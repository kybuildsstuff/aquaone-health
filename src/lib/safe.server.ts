import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/lib/app-data.server";
import type { Pronoun } from "@/lib/cat";
import { pickMatch, type PhotoType, type SafetyCategory, type SafetyItem, type SafetyMatch, type Severity } from "@/lib/safe";
import type { Identification, Identifier } from "@/lib/safe-vision.server";

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

export async function searchItems(supabase: SupabaseClient, q: string, max = 8): Promise<SafetyMatch[]> {
  const { data, error } = await supabase.rpc("search_safety_items", { q, max_results: max });
  if (error) throw new Error(`search_safety_items failed: ${error.message}`);
  return ((data ?? []) as SafetyMatch[]).map((m) => ({ ...m, score: Number(m.score) }));
}

const ITEM_COLUMNS = "id, name, aliases, category, severity, summary, what_to_do, source, scientific_name";

export async function getItem(supabase: SupabaseClient, id: string): Promise<SafetyItem | null> {
  const { data, error } = await supabase.from("safety_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`safety_items read failed: ${error.message}`);
  return (data as SafetyItem | null) ?? null;
}

export async function listCategory(supabase: SupabaseClient, category: SafetyCategory) {
  const { data, error } = await supabase.from("safety_items").select("id, name, severity").eq("category", category).order("name").limit(2000);
  if (error) throw new Error(`safety_items list failed: ${error.message}`);
  return (data ?? []) as { id: string; name: string; severity: Severity }[];
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
  identified: Identification;
  itemId: string | null;
  query: string;
  candidates: { id: string; name: string; severity: Severity }[];
};

// Photo -> the model names it -> we match the name against our list. A match only counts when the
// model wasn't guessing (confidence not low) and the name matches one answer closely; otherwise she
// gets the unknown answer with the near matches to choose from.
export async function photoLookup(
  supabase: SupabaseClient,
  image: { data: string; mediaType: PhotoType },
  identify: Identifier,
): Promise<ActionResult<PhotoResult>> {
  const identified = await identify(image);
  const names = identified.found ? [identified.name, ...identified.alternatives].filter(Boolean) : [];

  let itemId: string | null = null;
  const candidates = new Map<string, { id: string; name: string; severity: Severity }>();
  for (const [i, name] of names.entries()) {
    const matches = await searchItems(supabase, name, 3);
    const pick = pickMatch(matches);
    if (i === 0 && identified.confidence !== "low" && pick.kind === "item") itemId = pick.match.id;
    for (const m of matches) if (m.score >= 0.45 && candidates.size < 4) candidates.set(m.id, { id: m.id, name: m.name, severity: m.severity });
  }
  if (itemId) candidates.delete(itemId);

  const query = identified.found ? identified.name : "(photo: nothing recognised)";
  const cat = await getSafeCat(supabase);
  if (cat) await logLookup(supabase, cat.id, query, itemId, "photo");
  return { ok: true, data: { identified, itemId, query, candidates: [...candidates.values()] } };
}
