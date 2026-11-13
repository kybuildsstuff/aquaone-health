// End to end against the real database, as real signed-in users: a check-in, weigh-in or
// breathing count is saved through the same server functions the API routes call, Kidney
// Watch is recomputed, and the server opens or resolves alerts. Also proves row-level
// security on the new data. Throwaway users are created and deleted; residue is asserted zero.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getOrCreatePlan, saveBreathing, saveCheckIn, saveWeighIn, setCareTaskDone, getContext } from "../src/lib/app-data.server";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type U = { id: string; client: SupabaseClient; catId: string };
const created: string[] = [];
const catIds: string[] = [];
const TZ = "America/New_York";

async function makeOwner(label: string): Promise<U> {
  const email = `kwa-${label}-${randomUUID().slice(0, 8)}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const cat = await client.from("cats").insert({ owner_id: data.user.id, name: "Test", pronoun: "he", age_years: 11, lives: "indoor", food: "dry", conditions: ["kidney"] }).select("id").single();
  if (cat.error) throw cat.error;
  catIds.push(cat.data.id);
  const prefs = await client.from("reminder_prefs").upsert({ user_id: data.user.id, timezone: TZ, by_text: false, by_email: true });
  if (prefs.error) throw prefs.error;
  return { id: data.user.id, client, catId: cat.data.id };
}

const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86400000);
const openAlerts = async (catId: string) =>
  (await admin.from("alerts").select("id, kind, level, resolved_at").eq("cat_id", catId).is("resolved_at", null).order("kind")).data ?? [];
const allAlerts = async (catId: string) => (await admin.from("alerts").select("id, kind, resolved_at").eq("cat_id", catId)).data ?? [];

let a: U;
let b: U;
beforeAll(async () => {
  a = await makeOwner("a");
  b = await makeOwner("b");
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  // Cleanup is proven: nothing left for the deleted cats.
  for (const t of ["cats", "check_ins", "weigh_ins", "breathing_counts", "care_plan_days", "alerts"]) {
    const col = t === "cats" ? "id" : "cat_id";
    const { count } = await admin.from(t).select("*", { count: "exact", head: true }).in(col, catIds);
    console.log(`residue ${t}: ${count}`);
    expect(count).toBe(0);
  }
});

describe("check-in → Kidney Watch → alerts", () => {
  it("stays learning (no alert) for the first six check-ins, even all 'more'", async () => {
    for (let d = 9; d >= 4; d--) {
      const r = await saveCheckIn(a.client, "more", daysAgo(d));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.status).toBe("learning");
    }
    expect(await openAlerts(a.catId)).toEqual([]);
  });

  it("the 7th 'more' check-in turns amber and the server opens one drinking_more alert", async () => {
    const r = await saveCheckIn(a.client, "more", daysAgo(3));
    expect(r.ok && r.data.status).toBe("amber");
    const open = await openAlerts(a.catId);
    expect(open.map((x) => [x.kind, x.level])).toEqual([["drinking_more", "amber"]]);
  });

  it("another firing check-in keeps the same single alert (no duplicates)", async () => {
    await saveCheckIn(a.client, "more", daysAgo(2));
    expect((await openAlerts(a.catId)).length).toBe(1);
  });

  it("a second tap on the same day changes that day's answer instead of adding one", async () => {
    await saveCheckIn(a.client, "more", daysAgo(1));
    await saveCheckIn(a.client, "normal", daysAgo(1));
    const { data } = await a.client.from("check_ins").select("drinking").eq("cat_id", a.catId).order("date", { ascending: false }).limit(1);
    expect(data).toEqual([{ drinking: "normal" }]);
  });

  it("when drinking settles, the server resolves the alert and status is steady", async () => {
    // Last 7 are now days 6..0 ago: five 'more', two 'normal'. Still amber.
    let last = await saveCheckIn(a.client, "normal", daysAgo(0));
    expect(last.ok && last.data).toMatchObject({ status: "amber", more_in_last_7: 5 });
    // Three more normal days push 'more' down to 2 of the last 7.
    for (let d = 1; d <= 3; d++) last = await saveCheckIn(a.client, "normal", new Date(NOW + d * 86400000));
    expect(last.ok && last.data.status).toBe("steady");
    expect(await openAlerts(a.catId)).toEqual([]);
    const all = await allAlerts(a.catId);
    expect(all).toHaveLength(1);
    expect(all[0].resolved_at).not.toBeNull();
  });
});

describe("breathing and weigh-in saves", () => {
  it("a count over 30 a minute is red and opens a red alert; a later normal count resolves it", async () => {
    const red = await saveBreathing(a.client, 17, new Date(NOW + 4 * 86400000)); // 34 a minute
    expect(red.ok && red.data).toMatchObject({ status: "red", bpm: 34, latest_breaths: 34 });
    expect((await openAlerts(a.catId)).map((x) => [x.kind, x.level])).toEqual([["breathing_over_30", "red"]]);

    const ok = await saveBreathing(a.client, 11, new Date(NOW + 4 * 86400000 + 60000)); // 22 a minute
    expect(ok.ok && ok.data).toMatchObject({ status: "steady", bpm: 22 });
    expect(await openAlerts(a.catId)).toEqual([]);
  });

  it("saves a two-reading weigh-in in pounds; a 5%+ drop against 4 weeks earlier opens a weight alert", async () => {
    const first = await saveWeighIn(b.client, { ownerWeight: 140, withCatWeight: 150.6, unit: "lb" }, daysAgo(28));
    expect(first.ok && first.data.catLb).toBe(10.6);
    const { data: rows } = await b.client.from("weigh_ins").select("owner_lb, with_cat_lb, cat_lb").eq("cat_id", b.catId);
    expect(rows?.map((r) => [Number(r.owner_lb), Number(r.with_cat_lb), Number(r.cat_lb)])).toEqual([[140, 150.6, 10.6]]);

    const second = await saveWeighIn(b.client, { ownerWeight: 140, withCatWeight: 150, unit: "lb" }, daysAgo(0));
    expect(second.ok && second.data).toMatchObject({ status: "amber", catLb: 10, reasons: ["weight_down_5pct"] });
    expect((await openAlerts(b.catId)).map((x) => x.kind)).toEqual(["weight_down_5pct"]);
  });

  it("refuses a weigh-in where the second reading isn't heavier, and saves nothing", async () => {
    const r = await saveWeighIn(b.client, { ownerWeight: 150, withCatWeight: 149, unit: "lb" });
    expect(r).toMatchObject({ ok: false, status: 400, error: "not_heavier" });
    const { count } = await admin.from("weigh_ins").select("*", { count: "exact", head: true }).eq("cat_id", b.catId);
    expect(count).toBe(2);
  });
});

describe("care plan days", () => {
  it("picks today's plan once; ticking a task is stored; a task not in the plan is refused", async () => {
    const ctx = (await getContext(a.client))!;
    const p1 = await getOrCreatePlan(a.client, ctx.cat, ctx.today);
    const p2 = await getOrCreatePlan(a.client, ctx.cat, ctx.today);
    expect(p1.tasks.map((t) => t.id)).toHaveLength(3);
    expect(p2.tasks.map((t) => t.id)).toEqual(p1.tasks.map((t) => t.id));

    const tick = await setCareTaskDone(a.client, p1.tasks[0].id, true);
    expect(tick.ok && tick.data.doneIds).toEqual([p1.tasks[0].id]);
    const untick = await setCareTaskDone(a.client, p1.tasks[0].id, false);
    expect(untick.ok && untick.data.doneIds).toEqual([]);
    const notMine = await setCareTaskDone(a.client, "not_a_task", true);
    expect(notMine).toMatchObject({ ok: false, error: "not_in_plan" });
  });
});

describe("row-level security on Kidney Watch data", () => {
  it("another member cannot read her check-ins, weigh-ins, breathing counts, plans or alerts", async () => {
    for (const t of ["check_ins", "weigh_ins", "breathing_counts", "care_plan_days", "alerts"]) {
      const { data } = await b.client.from(t).select("*").eq("cat_id", a.catId);
      expect(data, t).toEqual([]);
    }
  });

  it("another member cannot write them either", async () => {
    expect((await b.client.from("check_ins").insert({ cat_id: a.catId, date: "2027-01-01", drinking: "more" })).error).not.toBeNull();
    expect((await b.client.from("weigh_ins").insert({ cat_id: a.catId, date: "2027-01-01", owner_lb: 100, with_cat_lb: 110 })).error).not.toBeNull();
    expect((await b.client.from("breathing_counts").insert({ cat_id: a.catId, breaths_per_min: 50 })).error).not.toBeNull();
    expect((await b.client.from("care_plan_days").insert({ cat_id: a.catId, date: "2027-01-01", task_ids: [] })).error).not.toBeNull();
    const [alert] = await allAlerts(a.catId);
    const upd = await b.client.from("alerts").update({ resolved_at: null }).eq("id", alert.id).select("id");
    expect(upd.data).toEqual([]);
  });

  it("an owner can read and resolve her own alerts but cannot write one", async () => {
    expect((await a.client.from("alerts").insert({ cat_id: a.catId, kind: "drinking_more", level: "amber" })).error).not.toBeNull();
    const own = await b.client.from("alerts").select("id, kind").eq("cat_id", b.catId).is("resolved_at", null);
    expect(own.data?.map((x) => x.kind)).toEqual(["weight_down_5pct"]);
    const resolved = await b.client.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", own.data![0].id).select("id");
    expect(resolved.data).toHaveLength(1);
  });

  it("the save functions only ever touch her own cat", async () => {
    const before = (await admin.from("check_ins").select("id", { count: "exact", head: true }).eq("cat_id", a.catId)).count;
    await saveCheckIn(b.client, "less", new Date(NOW + 10 * 86400000));
    const after = (await admin.from("check_ins").select("id", { count: "exact", head: true }).eq("cat_id", a.catId)).count;
    expect(after).toBe(before);
  });
});
