import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContext, type ActionResult } from "@/lib/app-data.server";
import { localMidnightUtc } from "@/lib/ask.server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PhotoType } from "@/lib/safe";
import type { LabReader, LabReading } from "@/lib/bloodwork-vision.server";
import {
  GROUP_ORDER,
  LAB_PHOTO_DAILY_CAP,
  changeSince,
  matchTest,
  monthLabel,
  parseNumber,
  position,
  testByCode,
  vetQuestions,
  type ExplainedPanel,
  type ExplainedResult,
  type ResultRow,
} from "@/lib/bloodwork";

export type { ExplainedPanel, ExplainedResult };
export const LAB_PHOTO_BUCKET = "lab-photos";
const fail = (status: number, error: string, detail?: string) => ({ ok: false as const, status, error, detail });
const EXT: Record<PhotoType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

// A printed report date as YYYY-MM-DD. Slashed dates are read month first, as US labs print them
// (our members are mostly in the US); "10 Nov 2026" and "Nov 10, 2026" are read as written.
export function parseReportDate(s: string): string | null {
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  m = t.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/);
  if (m && MONTHS.includes(m[2])) return iso(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS.includes(m[1])) return iso(+m[3], MONTHS.indexOf(m[1]) + 1, +m[2]);
  return null;
}

// The report's date when it reads as a real date that isn't in the future or absurdly old; else today.
export function panelDate(reportDate: string, today: string): { taken_on: string; date_from_report: boolean } {
  const d = parseReportDate(reportDate);
  return d && d <= today && d >= "2005-01-01" ? { taken_on: d, date_from_report: true } : { taken_on: today, date_from_report: false };
}

// What the model read, as rows for our tables. A row with no name or no value is dropped.
export function rowsFromReading(reading: LabReading): ResultRow[] {
  return reading.results
    .map((r) => ({ ...r, name: r.name.trim().slice(0, 120), value: r.value.trim().slice(0, 40) }))
    .filter((r) => r.name && r.value)
    .map((r) => ({
      name: r.name,
      test_code: matchTest(r.name)?.code ?? null,
      value: /^[<>]/.test(r.value) ? null : parseNumber(r.value),
      value_text: r.value,
      unit: r.unit.trim().slice(0, 30) || null,
      ref_low: parseNumber(r.refLow),
      ref_high: parseNumber(r.refHigh),
      lab_flag: r.flag === "none" ? null : r.flag,
    }));
}

// A photo of a lab report → one saved panel for the chosen cat. Nothing is saved when the photo
// isn't a readable lab report.
export async function saveLabReport(
  supabase: SupabaseClient,
  image: { data: string; mediaType: PhotoType },
  read: LabReader,
  at: Date = new Date(),
): Promise<ActionResult<{ panelId: string }>> {
  const ctx = await getContext(supabase, at);
  if (!ctx) return fail(409, "no_cat");
  // Per member across her cats; her own session's RLS scopes the count.
  const { count, error: capError } = await supabase.from("lab_panels").select("id", { count: "exact", head: true }).gte("created_at", localMidnightUtc(ctx.tz, at).toISOString());
  if (capError) throw new Error(`lab cap count failed: ${capError.message}`);
  if ((count ?? 0) >= LAB_PHOTO_DAILY_CAP) return fail(429, "lab_cap");

  const reading = await read(image);
  const rows = rowsFromReading(reading);
  if (!reading.isLabReport || reading.readable === "none" || rows.length === 0) return fail(422, "unreadable", `isLabReport=${reading.isLabReport} readable=${reading.readable} rows=${rows.length}`);

  const path = `${ctx.cat.id}/${randomUUID()}.${EXT[image.mediaType]}`;
  const up = await supabaseAdmin().storage.from(LAB_PHOTO_BUCKET).upload(path, Buffer.from(image.data, "base64"), { contentType: image.mediaType });
  if (up.error) throw new Error(`lab photo upload failed: ${up.error.message}`);

  const { data: panel, error } = await supabase
    .from("lab_panels")
    .insert({ cat_id: ctx.cat.id, ...panelDate(reading.reportDate, ctx.today), lab_name: reading.labName.trim().slice(0, 120) || null, photo_path: path, readable: reading.readable })
    .select("id")
    .single();
  if (error) {
    await supabaseAdmin().storage.from(LAB_PHOTO_BUCKET).remove([path]);
    return fail(500, "save_failed", error.message);
  }
  const results = await supabase.from("lab_results").insert(rows.map((r, i) => ({ ...r, panel_id: panel.id, cat_id: ctx.cat.id, position: i })));
  if (results.error) {
    await supabase.from("lab_panels").delete().eq("id", panel.id);
    await supabaseAdmin().storage.from(LAB_PHOTO_BUCKET).remove([path]);
    return fail(500, "save_failed", results.error.message);
  }
  return { ok: true, data: { panelId: panel.id } };
}

export type PanelSummary = { id: string; taken_on: string; date_from_report: boolean; lab_name: string | null; results: number; outside: number };

// Her chosen cat's panels, newest first.
export async function loadBloodwork(supabase: SupabaseClient) {
  const ctx = await getContext(supabase);
  if (!ctx) return null;
  const { data, error } = await supabase
    .from("lab_panels")
    .select("id, taken_on, date_from_report, lab_name, lab_results(value, ref_low, ref_high, lab_flag)")
    .eq("cat_id", ctx.cat.id)
    .order("taken_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`lab_panels read failed: ${error.message}`);
  const panels: PanelSummary[] = (data ?? []).map((p) => {
    const rs = (p.lab_results ?? []) as Pick<ResultRow, "value" | "ref_low" | "ref_high" | "lab_flag">[];
    return { id: p.id, taken_on: p.taken_on, date_from_report: p.date_from_report, lab_name: p.lab_name, results: rs.length, outside: rs.filter((r) => ["above", "below"].includes(position(r) ?? "")).length };
  });
  return { ...ctx, panels };
}

type DbResult = ResultRow & { id: string; position: number };
const key = (r: Pick<ResultRow, "test_code" | "name">) => r.test_code ?? `name:${r.name.toLowerCase().replace(/\s+/g, " ").trim()}`;

// One panel explained: our words for each test, the change since the cat's previous panel, and the
// questions for her vet. `client` is her own (RLS) client, or the admin client for a share link
// that has already been checked.
export async function explainPanel(client: SupabaseClient, panelId: string, catName: string, today: string): Promise<ExplainedPanel | null> {
  const { data: panel, error } = await client
    .from("lab_panels")
    .select("id, cat_id, taken_on, date_from_report, lab_name, readable, photo_path, created_at")
    .eq("id", panelId)
    .maybeSingle();
  if (error) throw new Error(`lab_panels read failed: ${error.message}`);
  if (!panel) return null;
  const [results, previous] = await Promise.all([
    client.from("lab_results").select("id, position, name, test_code, value, value_text, unit, ref_low, ref_high, lab_flag").eq("panel_id", panel.id).order("position"),
    client
      .from("lab_panels")
      .select("id, taken_on")
      .eq("cat_id", panel.cat_id)
      .neq("id", panel.id)
      .or(`taken_on.lt.${panel.taken_on},and(taken_on.eq.${panel.taken_on},created_at.lt.${panel.created_at})`)
      .order("taken_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (results.error) throw new Error(`lab_results read failed: ${results.error.message}`);
  if (previous.error) throw new Error(`previous panel read failed: ${previous.error.message}`);

  const prevByKey = new Map<string, { value: number | null; value_text: string }>();
  if (previous.data) {
    const prev = await client.from("lab_results").select("name, test_code, value, value_text").eq("panel_id", previous.data.id);
    if (prev.error) throw new Error(`previous results read failed: ${prev.error.message}`);
    for (const r of prev.data ?? []) if (!prevByKey.has(key(r as ResultRow))) prevByKey.set(key(r as ResultRow), r as { value: number | null; value_text: string });
  }
  const since = previous.data ? monthLabel(previous.data.taken_on, today) : "";

  const explained: ExplainedResult[] = ((results.data ?? []) as DbResult[]).map((r) => {
    const info = r.test_code ? testByCode.get(r.test_code) : undefined;
    const nr = { ...r, value: r.value == null ? null : Number(r.value), ref_low: r.ref_low == null ? null : Number(r.ref_low), ref_high: r.ref_high == null ? null : Number(r.ref_high) };
    return { ...nr, label: info?.label ?? r.name, about: info?.about ?? null, group: info?.group ?? null, position: position(nr), change: previous.data ? changeSince(nr.value, prevByKey.get(key(r)), since) : null };
  });

  const groups: ExplainedPanel["groups"] = [];
  for (const g of GROUP_ORDER) {
    const rs = explained.filter((r) => r.group === g);
    if (rs.length) groups.push({ group: g, results: rs });
  }
  const unlisted = explained.filter((r) => !r.group);
  if (unlisted.length) groups.push({ group: "Not on our list", results: unlisted });

  return {
    id: panel.id,
    catId: panel.cat_id,
    taken_on: panel.taken_on,
    date_from_report: panel.date_from_report,
    lab_name: panel.lab_name,
    readable: panel.readable,
    previousOn: previous.data?.taken_on ?? null,
    groups,
    questions: vetQuestions(explained, catName),
    photo_path: panel.photo_path,
  };
}

// The newest panel for a cat (for the vet report), explained; null when she has none.
export async function latestPanel(client: SupabaseClient, catId: string, catName: string, today: string): Promise<ExplainedPanel | null> {
  const { data, error } = await client.from("lab_panels").select("id").eq("cat_id", catId).order("taken_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`latest panel read failed: ${error.message}`);
  return data ? explainPanel(client, data.id, catName, today) : null;
}

// A short-lived link to the original photo (private bucket, 8a).
export async function signLabPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin().storage.from(LAB_PHOTO_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(`lab photo sign failed: ${error.message}`);
  return data.signedUrl;
}

// Deletes a panel, its results and its photo. Found with her own client, so only her own.
export async function deletePanel(supabase: SupabaseClient, panelId: string): Promise<ActionResult<{ panelId: string }>> {
  const { data: panel, error } = await supabase.from("lab_panels").select("id, photo_path").eq("id", panelId).maybeSingle();
  if (error) throw new Error(`lab_panels read failed: ${error.message}`);
  if (!panel) return fail(404, "not_found");
  const del = await supabase.from("lab_panels").delete().eq("id", panel.id).select("id");
  if (del.error) return fail(500, "delete_failed", del.error.message);
  if (!del.data?.length) return fail(404, "not_found");
  if (panel.photo_path) {
    const rm = await supabaseAdmin().storage.from(LAB_PHOTO_BUCKET).remove([panel.photo_path]);
    if (rm.error) console.error("lab_delete photo_remove_failed", panel.id, rm.error.message);
  }
  return { ok: true, data: { panelId: panel.id } };
}
