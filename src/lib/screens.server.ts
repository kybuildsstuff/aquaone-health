import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysBetween, greeting, localDate, localHour, streakDays } from "@/lib/dates";
import { getContext, getOrCreatePlan, kidneyWatchStatus, type Ctx } from "@/lib/app-data.server";

export type Drink = "less" | "normal" | "more";

// Reads for the Today and Kidney Watch screens, all with her own client (RLS).

export async function loadToday(supabase: SupabaseClient) {
  const ctx = await getContext(supabase);
  if (!ctx) return null;
  const since = addDays(ctx.today, -90);
  const [status, plan, checkIns, doneDays] = await Promise.all([
    kidneyWatchStatus(supabase, ctx.cat.id),
    getOrCreatePlan(supabase, ctx.cat, ctx.today),
    supabase.from("check_ins").select("date, drinking").eq("cat_id", ctx.cat.id).gte("date", since).order("date", { ascending: false }),
    supabase.from("care_plan_days").select("date, done_ids").eq("cat_id", ctx.cat.id).gte("date", since),
  ]);
  if (checkIns.error) throw new Error(`check_ins read failed: ${checkIns.error.message}`);
  if (doneDays.error) throw new Error(`care_plan_days read failed: ${doneDays.error.message}`);

  // A day counts toward the streak when she checked in or ticked any care task.
  const active = [
    ...(checkIns.data ?? []).map((c) => c.date as string),
    ...(doneDays.data ?? []).filter((d) => (d.done_ids as string[]).length > 0).map((d) => d.date as string),
  ];
  const todayCheckIn = (checkIns.data ?? []).find((c) => c.date === ctx.today)?.drinking as Drink | undefined;
  return {
    ...ctx,
    status,
    plan,
    todayCheckIn: todayCheckIn ?? null,
    streak: streakDays(active, ctx.today),
    dayNumber: dayNumber(ctx),
    greeting: greeting(localHour(ctx.tz)),
    recentDrinking: (checkIns.data ?? []).slice(0, 6).reverse().map((c) => c.drinking as Drink),
  };
}

export async function loadWatch(supabase: SupabaseClient) {
  const ctx = await getContext(supabase);
  if (!ctx) return null;
  const [status, checkIns, weighIns, breathing] = await Promise.all([
    kidneyWatchStatus(supabase, ctx.cat.id),
    supabase.from("check_ins").select("date, drinking").eq("cat_id", ctx.cat.id).gte("date", addDays(ctx.today, -13)),
    supabase.from("weigh_ins").select("date, cat_lb, created_at").eq("cat_id", ctx.cat.id).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(12),
    supabase.from("breathing_counts").select("taken_at, breaths_per_min").eq("cat_id", ctx.cat.id).order("taken_at", { ascending: false }).limit(1),
  ]);
  for (const r of [checkIns, weighIns, breathing]) if (r.error) throw new Error(`watch read failed: ${r.error.message}`);

  const byDate = new Map((checkIns.data ?? []).map((c) => [c.date as string, c.drinking as Drink]));
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(ctx.today, i - 13);
    return { date, drinking: byDate.get(date) ?? null };
  });
  const latestBreath = breathing.data?.[0];
  return {
    ...ctx,
    status,
    last14,
    dayNumber: dayNumber(ctx),
    weighIns: (weighIns.data ?? []).map((w) => ({ date: w.date as string, catLb: Number(w.cat_lb) })).reverse(),
    breathing: latestBreath
      ? { bpm: Number(latestBreath.breaths_per_min), date: localDate(ctx.tz, new Date(latestBreath.taken_at as string)) }
      : null,
  };
}

// The last 7 check-ins (oldest first), for the what-to-do screen.
export async function loadAlert(supabase: SupabaseClient) {
  const ctx = await getContext(supabase);
  if (!ctx) return null;
  const [status, checkIns] = await Promise.all([
    kidneyWatchStatus(supabase, ctx.cat.id),
    supabase.from("check_ins").select("date, drinking").eq("cat_id", ctx.cat.id).order("date", { ascending: false }).limit(7),
  ]);
  if (checkIns.error) throw new Error(`check_ins read failed: ${checkIns.error.message}`);
  return { ...ctx, status, last7: (checkIns.data ?? []).reverse().map((c) => ({ date: c.date as string, drinking: c.drinking as Drink })) };
}

// Day 1 is the local day the cat was added.
function dayNumber(ctx: Ctx) {
  return daysBetween(localDate(ctx.tz, new Date(ctx.cat.created_at)), ctx.today) + 1;
}

