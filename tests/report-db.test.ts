// The vet report and its share links against the real database, as real signed-in users.
// Data is saved through the same server functions the API routes use; the report is read back
// through loadOwnReport (her session) and loadSharedReport (the public link). Proves period
// filtering on stored rows, the recount ruling, the "your vet" fallback, token expiry and
// revocation, one-cat-per-token, and row-level security on report_shares.
// Throwaway users are created and deleted; residue is asserted zero.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { saveBreathing, saveCheckIn, saveWeighIn } from "../src/lib/app-data.server";
import { createShareLink, hashShareToken, loadOwnReport, loadSharedReport, newShareToken, resolveShareToken, revokeShareLinks } from "../src/lib/report.server";
import { SHARE_LINK_DAYS } from "../src/lib/report";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type U = { id: string; client: SupabaseClient; catId: string };
const created: string[] = [];
const catIds: string[] = [];

async function makeOwner(label: string, name: string, vet: string | null): Promise<U> {
  const email = `rpt-${label}-${randomUUID().slice(0, 8)}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const cat = await client
    .from("cats")
    .insert({ owner_id: data.user.id, name, pronoun: "he", age_years: 11, lives: "indoor", food: "dry", conditions: ["kidney"], vet_name: vet })
    .select("id")
    .single();
  if (cat.error) throw cat.error;
  catIds.push(cat.data.id);
  const prefs = await client.from("reminder_prefs").upsert({ user_id: data.user.id, timezone: "America/New_York", by_text: false, by_email: true });
  if (prefs.error) throw prefs.error;
  return { id: data.user.id, client, catId: cat.data.id };
}

const NOW = Date.now();
const daysAgo = (n: number, minutes = 0) => new Date(NOW - n * 86400000 + minutes * 60000);
const tokenOf = (path: string) => path.replace(/^\/r\//, "");

let a: U;
let b: U;
beforeAll(async () => {
  a = await makeOwner("a", "Alpha", null);
  b = await makeOwner("b", "Bravo", "Dr. Lane");

  // Alpha: check-ins either side of the 30-day edge, three weigh-ins (one outside), a red count then a normal recount.
  for (const [d, v] of [[30, "less"], [29, "more"], [10, "more"], [0, "normal"]] as const) {
    const r = await saveCheckIn(a.client, v, daysAgo(d));
    if (!r.ok) throw new Error(`seed check-in: ${r.error}`);
  }
  for (const [d, withCat] of [[40, 152], [20, 150], [2, 149.5]] as const) {
    const r = await saveWeighIn(a.client, { ownerWeight: 140, withCatWeight: withCat, unit: "lb" }, daysAgo(d));
    if (!r.ok) throw new Error(`seed weigh-in: ${r.error}`);
  }
  const red = await saveBreathing(a.client, 17, daysAgo(3)); // 34 a minute: red, opens an alert
  const calm = await saveBreathing(a.client, 11, daysAgo(3, 5)); // 22 a minute: clears it
  if (!red.ok || !calm.ok) throw new Error("seed breathing");

  // Bravo: one check-in, so its report is distinguishable.
  await saveCheckIn(b.client, "less", daysAgo(1));
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  for (const t of ["cats", "check_ins", "weigh_ins", "breathing_counts", "alerts", "report_shares"]) {
    const col = t === "cats" ? "id" : "cat_id";
    const { count } = await admin.from(t).select("*", { count: "exact", head: true }).in(col, catIds);
    console.log(`residue ${t}: ${count}`);
    expect(count).toBe(0);
  }
});

describe("her report (her own session)", () => {
  it("holds only the last 30 local days, with the weight change from the first to the last weigh-in in them", async () => {
    const own = (await loadOwnReport(a.client))!;
    const r = own.report;
    expect(r.cat.name).toBe("Alpha");
    expect(r.drinking.counts).toEqual({ less: 0, normal: 1, more: 2 }); // the 30-days-ago "less" is outside
    expect(r.drinking.checkIns).toBe(3);
    expect(r.weight.points.map((p) => p.lb)).toEqual([10, 9.5]); // the 40-days-ago 12 lb is outside
    expect(r.weight.changePct).toBe(-5);
    for (const d of r.drinking.days) expect(d.date >= r.period.from && d.date <= r.period.to).toBe(true);
  });

  it("keeps the red breathing reading after the normal recount cleared the alert", async () => {
    const r = (await loadOwnReport(a.client))!.report;
    expect(r.breathing.latest?.bpm).toBe(22);
    expect(r.breathing.red.map((x) => x.bpm)).toEqual([34]);
    const alert = r.alerts.find((x) => x.kind === "breathing_over_30");
    expect(alert).toMatchObject({ level: "red" });
    expect(alert?.resolvedOn).not.toBeNull();
  });

  it('says "your vet" when none is saved, and the vet\'s name when one is', async () => {
    expect((await loadOwnReport(a.client))!.report.cat).toMatchObject({ vet: "your vet", vetSaved: false });
    expect((await loadOwnReport(b.client))!.report.cat).toMatchObject({ vet: "Dr. Lane", vetSaved: true });
  });
});

describe("share links", () => {
  it(`a new link opens only her cat's report, and expires in ${SHARE_LINK_DAYS} days`, async () => {
    const made = await createShareLink(a.client);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const token = tokenOf(made.data.path);
    const days = (Date.parse(made.data.expiresAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(SHARE_LINK_DAYS - 0.01);
    expect(days).toBeLessThanOrEqual(SHARE_LINK_DAYS);

    expect(await resolveShareToken(token)).toMatchObject({ catId: a.catId });
    const shared = (await loadSharedReport(token))!;
    expect(shared.report.cat.name).toBe("Alpha");
    expect(shared.report).toEqual((await loadOwnReport(a.client))!.report); // same data as her screen
    expect(JSON.stringify(shared)).not.toContain("Bravo");

    // Only the hash is stored.
    const { data: rows } = await admin.from("report_shares").select("token_hash").eq("cat_id", a.catId);
    expect(rows!.map((x) => x.token_hash)).toContain(hashShareToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect((await loadOwnReport(a.client))!.activeLinks).toBe(1);
  });

  it("two owners' links each open their own cat, never the other", async () => {
    const la = await createShareLink(a.client);
    const lb = await createShareLink(b.client);
    if (!la.ok || !lb.ok) throw new Error("link create failed");
    expect((await loadSharedReport(tokenOf(la.data.path)))!.report.cat.name).toBe("Alpha");
    expect((await loadSharedReport(tokenOf(lb.data.path)))!.report.cat.name).toBe("Bravo");
  });

  it("unknown, malformed, expired and revoked tokens open nothing", async () => {
    expect(await loadSharedReport(newShareToken())).toBeNull();
    expect(await loadSharedReport("short")).toBeNull();
    expect(await loadSharedReport("x".repeat(43) + "' or 1=1 --")).toBeNull();

    const expired = newShareToken();
    const ins = await admin.from("report_shares").insert({
      cat_id: a.catId, created_by: a.id, token_hash: hashShareToken(expired),
      created_at: new Date(NOW - 31 * 86400000).toISOString(), expires_at: new Date(NOW - 86400000).toISOString(),
    });
    expect(ins.error).toBeNull();
    expect(await loadSharedReport(expired)).toBeNull();

    const live = await createShareLink(a.client);
    if (!live.ok) throw new Error("link create failed");
    expect(await loadSharedReport(tokenOf(live.data.path))).not.toBeNull();
    const revoked = await revokeShareLinks(a.client);
    expect(revoked.ok && revoked.data.revoked).toBeGreaterThanOrEqual(3);
    expect(await loadSharedReport(tokenOf(live.data.path))).toBeNull();
    expect((await loadOwnReport(a.client))!.activeLinks).toBe(0);
    // Revoking hers left Bravo's link alone.
    expect((await loadOwnReport(b.client))!.activeLinks).toBe(1);
  });
});

describe("row-level security on report_shares", () => {
  it("another member cannot create a link for someone else's cat", async () => {
    const { error } = await b.client.from("report_shares").insert({ cat_id: a.catId, created_by: b.id, token_hash: hashShareToken(newShareToken()), expires_at: new Date(NOW + 86400000).toISOString() });
    expect(error?.code).toBe("42501");
    const { error: asA } = await b.client.from("report_shares").insert({ cat_id: a.catId, created_by: a.id, token_hash: hashShareToken(newShareToken()), expires_at: new Date(NOW + 86400000).toISOString() });
    expect(asA?.code).toBe("42501");
  });

  it("another member cannot see or revoke her links; she cannot extend one; signed-out visitors read nothing", async () => {
    const mine = await createShareLink(a.client);
    if (!mine.ok) throw new Error("link create failed");
    const hash = hashShareToken(tokenOf(mine.data.path));

    expect((await b.client.from("report_shares").select("id").eq("cat_id", a.catId)).data).toEqual([]);
    const up = await b.client.from("report_shares").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash).select("id");
    expect(up.data ?? []).toEqual([]);
    expect(await resolveShareToken(tokenOf(mine.data.path))).not.toBeNull();

    const extend = await a.client.from("report_shares").update({ expires_at: new Date(NOW + 365 * 86400000).toISOString() }).eq("token_hash", hash);
    expect(extend.error?.code).toBe("42501");

    const anon = createClient(url, publishable, { auth: { persistSession: false } });
    const r = await anon.from("report_shares").select("id, cat_id");
    expect(r.data ?? []).toEqual([]);
    const ins = await anon.from("report_shares").insert({ cat_id: a.catId, created_by: a.id, token_hash: hashShareToken(newShareToken()), expires_at: new Date(NOW + 86400000).toISOString() });
    expect(ins.error).not.toBeNull();
  });

  it("the database refuses a link that lasts more than 90 days, even from the server", async () => {
    const { error } = await admin.from("report_shares").insert({ cat_id: a.catId, created_by: a.id, token_hash: hashShareToken(newShareToken()), expires_at: new Date(NOW + 100 * 86400000).toISOString() });
    expect(error?.code).toBe("23514");
  });
});
