import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addDays, localDate, safeTimezone } from "@/lib/dates";
import { pickTasks, type CareTask, type CatProfile } from "@/lib/care-plan";
import {
  breathsPerMinute,
  planAlertSync,
  toKwStatus,
  weighInPounds,
  type KwStatus,
  type weighInSchema,
} from "@/lib/kidney-watch";
import type { z } from "zod";

// Everything here runs with HER client (row-level security applies), except the
// alert writes in recomputeKidneyWatch, which are documented where they happen.

export type Cat = CatProfile & {
  name: string;
  pronoun: "he" | "she" | "they";
  vet_name: string | null;
  vet_phone: string | null;
  created_at: string;
};

export type Ctx = { userId: string; cat: Cat; tz: string; today: string };

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; detail?: string };
const fail = (status: number, error: string, detail?: string) => ({ ok: false as const, status, error, detail });

// Her cat (one per member in version 1), her timezone and her local "today".
export async function getContext(supabase: SupabaseClient, at: Date = new Date()): Promise<Ctx | null> {
  // getClaims verifies the signed session locally (ES256), so no round trip to Supabase Auth.
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return null;
  const [{ data: cat, error }, { data: prefs }] = await Promise.all([
    supabase
      .from("cats")
      .select("id, name, pronoun, age_years, lives, food, conditions, vet_name, vet_phone, created_at")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase.from("reminder_prefs").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw new Error(`cat lookup failed: ${error.message}`);
  if (!cat) return null;
  const tz = safeTimezone(prefs?.timezone);
  return { userId, cat: cat as Cat, tz, today: localDate(tz, at) };
}

export async function kidneyWatchStatus(supabase: SupabaseClient, catId: string): Promise<KwStatus> {
  const { data, error } = await supabase.rpc("kidney_watch_status", { p_cat_id: catId });
  if (error) throw new Error(`kidney_watch_status failed: ${error.message}`);
  return toKwStatus(data?.[0]);
}

// Recomputes Kidney Watch after every check-in, weigh-in or breathing count and brings
// the alerts table in line with it. catId must come from getContext (her own RLS read),
// which is what proves she owns the cat before the service-role writes below.
export async function recomputeKidneyWatch(supabase: SupabaseClient, catId: string): Promise<KwStatus> {
  const status = await kidneyWatchStatus(supabase, catId);

  // Service role, justified: alerts are written only by the server (decisions.md), so
  // members have no insert policy on alerts by design. The status above was computed
  // with her own session; the admin client only records what the rules decided.
  const admin = supabaseAdmin();
  const { data: open, error: openError } = await admin.from("alerts").select("id, kind").eq("cat_id", catId).is("resolved_at", null);
  if (openError) throw new Error(`alerts read failed: ${openError.message}`);
  const plan = planAlertSync(status.reasons, open ?? []);

  for (const a of plan.toOpen) {
    const { error } = await admin.from("alerts").insert({ cat_id: catId, kind: a.kind, level: a.level });
    // 23505: another request opened the same alert a moment ago (one open alert per kind).
    if (error && error.code !== "23505") throw new Error(`alert open failed: ${error.message}`);
  }
  if (plan.toResolve.length) {
    const { error } = await admin.from("alerts").update({ resolved_at: new Date().toISOString() }).in("id", plan.toResolve);
    if (error) throw new Error(`alert resolve failed: ${error.message}`);
  }
  return status;
}

// Today's three tasks, picked once and stored so the plan is stable all day.
export async function getOrCreatePlan(supabase: SupabaseClient, cat: CatProfile, date: string) {
  const existing = await supabase.from("care_plan_days").select("task_ids, done_ids").eq("cat_id", cat.id).eq("date", date).maybeSingle();
  if (existing.error) throw new Error(`plan read failed: ${existing.error.message}`);

  const { data: library, error: libError } = await supabase.from("care_tasks").select("id, title, detail, tags, min_age, conditions");
  if (libError) throw new Error(`care_tasks read failed: ${libError.message}`);
  const tasks = (library ?? []) as CareTask[];

  let row = existing.data;
  if (!row) {
    const { data: yesterday } = await supabase.from("care_plan_days").select("task_ids").eq("cat_id", cat.id).eq("date", addDays(date, -1)).maybeSingle();
    const taskIds = pickTasks(tasks, cat, date, yesterday?.task_ids ?? []);
    const { error } = await supabase
      .from("care_plan_days")
      .upsert({ cat_id: cat.id, date, task_ids: taskIds, done_ids: [] }, { onConflict: "cat_id,date", ignoreDuplicates: true });
    if (error) throw new Error(`plan insert failed: ${error.message}`);
    const again = await supabase.from("care_plan_days").select("task_ids, done_ids").eq("cat_id", cat.id).eq("date", date).single();
    if (again.error) throw new Error(`plan reread failed: ${again.error.message}`);
    row = again.data;
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return {
    date,
    doneIds: row.done_ids as string[],
    tasks: (row.task_ids as string[]).map((id) => byId.get(id)).filter((t): t is CareTask => Boolean(t)),
  };
}

// Actions ------------------------------------------------------------------------------

export async function saveCheckIn(supabase: SupabaseClient, drinking: "less" | "normal" | "more", at?: Date): Promise<ActionResult<KwStatus>> {
  const ctx = await getContext(supabase, at);
  if (!ctx) return fail(409, "no_cat");
  const { error } = await supabase
    .from("check_ins")
    .upsert({ cat_id: ctx.cat.id, date: ctx.today, drinking }, { onConflict: "cat_id,date" });
  if (error) return fail(500, "save_failed", `check_in_upsert: ${error.message}`);
  return { ok: true, data: await recomputeKidneyWatch(supabase, ctx.cat.id) };
}

export async function saveWeighIn(supabase: SupabaseClient, input: z.output<typeof weighInSchema>, at?: Date): Promise<ActionResult<KwStatus & { catLb: number }>> {
  const w = weighInPounds(input);
  if (!w.ok) return fail(400, w.error);
  const ctx = await getContext(supabase, at);
  if (!ctx) return fail(409, "no_cat");
  const { error } = await supabase.from("weigh_ins").insert({ cat_id: ctx.cat.id, date: ctx.today, owner_lb: w.ownerLb, with_cat_lb: w.withCatLb });
  if (error) return fail(500, "save_failed", `weigh_in_insert: ${error.message}`);
  return { ok: true, data: { ...(await recomputeKidneyWatch(supabase, ctx.cat.id)), catLb: w.catLb } };
}

export async function saveBreathing(supabase: SupabaseClient, breathsIn30s: number, at?: Date): Promise<ActionResult<KwStatus & { bpm: number }>> {
  const ctx = await getContext(supabase, at);
  if (!ctx) return fail(409, "no_cat");
  const bpm = breathsPerMinute(breathsIn30s);
  const { error } = await supabase.from("breathing_counts").insert({ cat_id: ctx.cat.id, breaths_per_min: bpm, ...(at ? { taken_at: at.toISOString() } : {}) });
  if (error) return fail(500, "save_failed", `breathing_insert: ${error.message}`);
  return { ok: true, data: { ...(await recomputeKidneyWatch(supabase, ctx.cat.id)), bpm } };
}

export async function setCareTaskDone(supabase: SupabaseClient, taskId: string, done: boolean, at?: Date): Promise<ActionResult<{ doneIds: string[] }>> {
  const ctx = await getContext(supabase, at);
  if (!ctx) return fail(409, "no_cat");
  const plan = await getOrCreatePlan(supabase, ctx.cat, ctx.today);
  if (!plan.tasks.some((t) => t.id === taskId)) return fail(409, "not_in_plan");
  const doneIds = done ? [...new Set([...plan.doneIds, taskId])] : plan.doneIds.filter((id) => id !== taskId);
  const { error } = await supabase.from("care_plan_days").update({ done_ids: doneIds }).eq("cat_id", ctx.cat.id).eq("date", ctx.today);
  if (error) return fail(500, "save_failed", `plan_update: ${error.message}`);
  return { ok: true, data: { doneIds } };
}
