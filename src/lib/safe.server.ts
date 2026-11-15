import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/lib/app-data.server";
import { words, type Pronoun } from "@/lib/cat";
import { CONFIDENT_SCORE, pickMatch, type PhotoType, type SafetyCategory, type SafetyItem, type SafetyMatch, type Severity } from "@/lib/safe";
import type { Identification, Identifier } from "@/lib/safe-vision.server";
import { buildLabelIndex, matchLabel, splitIngredients, type LabelFlag, type LabelIndexItem } from "@/lib/safe-label";
import { fillCatWords } from "@/lib/safe";

// Everything here runs with HER client, so row-level security applies: the list is readable by
// any signed-in user, and lookups are written and read only for her own cat.

const fail = (status: number, error: string, detail?: string) => ({ ok: false as const, status, error, detail });

export type SafeCat = { id: string; name: string; pronoun: Pronoun; vet_name: string | null; vet_phone: string | null };

// Her cat (one per member in version 1), or null before onboarding. Lookups need a cat to log
// against; the list itself works without one.
export async function getSafeCat(supabase: SupabaseClient): Promise<SafeCat | null> {
  const { data, error } = await supabase.from("cats").select("id, name, pronoun, vet_name, vet_phone").order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(`cat lookup failed: ${error.message}`);
  return (data as SafeCat | null) ?? null;
}

async function searchOnce(supabase: SupabaseClient, q: string, max: number): Promise<SafetyMatch[]> {
  const { data, error } = await supabase.rpc("search_safety_items", { q, max_results: max });
  if (error) throw new Error(`search_safety_items failed: ${error.message}`);
  return ((data ?? []) as SafetyMatch[]).map((m) => ({ ...m, score: Number(m.score) }));
}

// The whole query first. When that finds nothing confident and the query has several words (a
// label read from a photo, "minoxidil topical solution 5%"), each word and word pair is searched
// too, so an item named inside a longer phrase is still found. Results keep the whole-query order;
// extra hits are added after it. pickMatch(results, q) then decides whether the phrase names one.
export async function searchItems(supabase: SupabaseClient, q: string, max = 8): Promise<SafetyMatch[]> {
  const whole = await searchOnce(supabase, q, max);
  const words = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length >= 4 && !/^\d/.test(w)).slice(0, 6);
  if (whole[0]?.score >= CONFIDENT_SCORE || words.length < 1 || (words.length === 1 && words[0] === q.trim().toLowerCase())) return whole;
  const parts = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
  const extra = (await Promise.all(parts.map((part) => searchOnce(supabase, part, 3)))).flat();
  const seen = new Set(whole.map((m) => m.id));
  const merged = [...whole];
  for (const m of extra.sort((a, b) => b.score - a.score)) if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
  return merged.slice(0, Math.max(max, whole.length));
}

const ITEM_COLUMNS = "id, name, aliases, category, severity, summary, what_to_do, source, scientific_name";

export async function getItem(supabase: SupabaseClient, id: string): Promise<SafetyItem | null> {
  const { data, error } = await supabase.from("safety_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`safety_items read failed: ${error.message}`);
  return (data as SafetyItem | null) ?? null;
}

export async function listCategory(supabase: SupabaseClient, category: SafetyCategory) {
  // PostgREST returns at most 1,000 rows a request whatever .limit() says, so page (audit, 15 Nov).
  const out: { id: string; name: string; severity: Severity }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("safety_items").select("id, name, severity").eq("category", category).order("name").order("id").range(from, from + 999);
    if (error) throw new Error(`safety_items list failed: ${error.message}`);
    out.push(...((data ?? []) as typeof out));
    if (!data || data.length < 1000) return out;
  }
}

// Her most recent distinct lookups, newest first, for "Recently checked".
export async function recentLookups(supabase: SupabaseClient, catId: string, limit = 3) {
  const { data, error } = await supabase
    .from("safety_lookups")
    .select("query, created_at, safety_items(id, name, severity)")
    .eq("cat_id", catId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`safety_lookups read failed: ${error.message}`);
  const seen = new Set<string>();
  const out: { label: string; itemId: string | null; severity: Severity | null; query: string }[] = [];
  for (const row of data ?? []) {
    const item = (Array.isArray(row.safety_items) ? row.safety_items[0] : row.safety_items) as { id: string; name: string; severity: Severity } | null;
    const key = item ? `i:${item.id}` : `q:${String(row.query).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: item?.name ?? String(row.query), itemId: item?.id ?? null, severity: item?.severity ?? null, query: String(row.query) });
    if (out.length >= limit) break;
  }
  return out;
}

async function logLookup(supabase: SupabaseClient, catId: string, query: string, itemId: string | null, method: "search" | "photo") {
  const { error } = await supabase.from("safety_lookups").insert({ cat_id: catId, query: query.slice(0, 200), matched_item_id: itemId, method });
  if (error) throw new Error(`safety_lookups insert failed: ${error.message}`);
}

// A typed lookup she opened (an item, or the unknown answer). Logged against her own cat.
export async function recordSearchLookup(supabase: SupabaseClient, q: string, itemId: string | null): Promise<ActionResult<{ logged: boolean }>> {
  const cat = await getSafeCat(supabase);
  if (!cat) return { ok: true, data: { logged: false } };
  if (itemId && !(await getItem(supabase, itemId))) return fail(404, "unknown_item", itemId);
  await logLookup(supabase, cat.id, q, itemId, "search");
  return { ok: true, data: { logged: true } };
}

export type PhotoResult = {
  kind: "item";
  identified: Identification;
  itemId: string | null;
  query: string;
  candidates: { id: string; name: string; severity: Severity }[];
};

// Label Scan: what the label says, ingredient by ingredient, against our list.
export type LabelResult = {
  kind: "label";
  product: string;
  readable: "full" | "partial" | "none";
  flagged: LabelFlag[];
  unlisted: string[];
  listedSafe: number;
  worst: Severity | null;
  subj: string; // her cat's pronoun ("she", "he", "they"), for "If she's eaten it"
};

// The whole list (about 1,200 rows) for label matching, read with her client (the list is
// readable by any signed-in user).
// The API returns at most 1,000 rows per request, so the list is read in pages.
async function labelIndexItems(supabase: SupabaseClient): Promise<LabelIndexItem[]> {
  const out: LabelIndexItem[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("safety_items").select("id, name, aliases, scientific_name, severity, category, summary").order("name").range(from, from + 999);
    if (error) throw new Error(`safety_items read failed: ${error.message}`);
    out.push(...((data ?? []) as LabelIndexItem[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function labelLookup(supabase: SupabaseClient, identified: Identification): Promise<LabelResult> {
  const ingredients = splitIngredients(identified.ingredients);
  const match = matchLabel(ingredients, buildLabelIndex(await labelIndexItems(supabase)));
  const cat = await getSafeCat(supabase);
  const flagged = match.flagged.map((f) => ({ ...f, summary: fillCatWords(f.summary, cat) }));
  const product = identified.product || identified.name || "This label";
  if (cat) await logLookup(supabase, cat.id, `label: ${product}`, flagged[0]?.id ?? null, "photo");
  const readable = ingredients.length === 0 ? "none" : identified.readable;
  return { kind: "label", product, readable, flagged, unlisted: match.unlisted, listedSafe: match.listedSafe, worst: match.worst, subj: words(cat?.pronoun).subj };
}

// Photo -> the model names it -> we match the name against our list. A match only counts when the
// model wasn't guessing (confidence not low) and the name matches one answer closely; otherwise she
// gets the unknown answer with the near matches to choose from.
export async function photoLookup(
  supabase: SupabaseClient,
  image: { data: string; mediaType: PhotoType },
  identify: Identifier,
): Promise<ActionResult<PhotoResult | LabelResult>> {
  const identified = await identify(image);
  if (identified.kind === "label") return { ok: true, data: await labelLookup(supabase, identified) };
  const names = identified.found ? [identified.name, ...identified.alternatives].filter(Boolean) : [];

  let itemId: string | null = null;
  const candidates = new Map<string, { id: string; name: string; severity: Severity }>();
  for (const [i, name] of names.entries()) {
    const matches = await searchItems(supabase, name, 8);
    const pick = pickMatch(matches, name);
    if (i === 0 && identified.confidence !== "low" && pick.kind === "item") itemId = pick.match.id;
    for (const m of matches.slice(0, 3)) if (m.score >= 0.45 && candidates.size < 4) candidates.set(m.id, { id: m.id, name: m.name, severity: m.severity });
  }
  if (itemId) candidates.delete(itemId);

  const query = identified.found ? identified.name : "(photo: nothing recognised)";
  const cat = await getSafeCat(supabase);
  if (cat) await logLookup(supabase, cat.id, query, itemId, "photo");
  return { ok: true, data: { kind: "item", identified, itemId, query, candidates: [...candidates.values()] } };
}
