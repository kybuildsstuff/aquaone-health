// Smoke test through the real entry points of a running app (local `next start`/`next dev`
// or the production URL): a disposable member signs in through /auth/confirm with a real
// one-time token, onboards through /api/onboarding, then uses the real API routes and pages.
//   APP_URL=http://localhost:3000 npx vitest run tests/smoke-app.test.ts
// Without APP_URL it reports NOT RUN (never a pass). Everything it creates is deleted, and
// the residue is asserted zero.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });
const APP = process.env.APP_URL?.replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

if (!APP) console.log("smoke-app: NOT RUN (set APP_URL to run it)");

const email = `smoke-${randomUUID().slice(0, 8)}@test.invalid`;
let userId = "";
let cookie = "";
let catId = "";

const call = (path: string, init: RequestInit = {}, withCookie = true) =>
  fetch(`${APP}${path}`, { redirect: "manual", ...init, headers: { ...(withCookie ? { cookie } : {}), ...(init.headers ?? {}) } });
const post = (path: string, body: unknown) => call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!APP)(`app smoke (${APP})`, () => {
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const m = await admin.from("members").insert({ email, shopify_customer_id: "TEST", status: "trial", trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    if (m.error) throw m.error;
    // Sign in exactly as the emailed link does.
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    const res = await fetch(`${APP}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=magiclink`, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/start$/);
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toMatch(/sb-.*-auth-token/);
  });

  afterAll(async () => {
    await admin.from("members").delete().eq("email", email).eq("shopify_customer_id", "TEST");
    if (userId) await admin.auth.admin.deleteUser(userId);
    const users = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email === email).length;
    const members = (await admin.from("members").select("id", { count: "exact", head: true }).eq("email", email)).count;
    const cats = catId ? (await admin.from("cats").select("id", { count: "exact", head: true }).eq("id", catId)).count : 0;
    const alerts = catId ? (await admin.from("alerts").select("id", { count: "exact", head: true }).eq("cat_id", catId)).count : 0;
    console.log(`smoke residue: users ${users}, members ${members}, cats ${cats}, alerts ${alerts}`);
    expect([users, members, cats, alerts]).toEqual([0, 0, 0, 0]);
  });

  it("signed out: app pages redirect to /sign-in and the API answers 401", async () => {
    const page = await call("/today", {}, false);
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toMatch(/\/sign-in$/);
    const api = await fetch(`${APP}/api/check-ins`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"drinking":"normal"}' });
    expect(api.status).toBe(401);
  });

  it("before onboarding: a check-in is refused with no_cat and Today sends her to onboarding", async () => {
    const r = await post("/api/check-ins", { drinking: "normal" });
    expect([r.status, (await r.json()).error]).toEqual([409, "no_cat"]);
    const today = await call("/today");
    expect(today.status).toBe(307);
    expect(today.headers.get("location")).toMatch(/\/onboarding$/);
  });

  it("onboards through the real route", async () => {
    const r = await post("/api/onboarding", {
      name: "Smoke", pronoun: "she", ageYears: 9, weight: null, weightUnit: "lb", lives: "indoor", conditions: ["kidney"],
      food: "dry", remindByEmail: true, checkinTime: "08:00", timezone: "America/New_York",
    });
    expect(r.status).toBe(200);
    catId = (await r.json()).catId;
    expect(catId).toBeTruthy();
  });

  it("Today renders day 1 with three care tasks; every tab and Watch screen answers 200", async () => {
    const today = await call("/today");
    expect(today.status).toBe(200);
    const html = await today.text();
    expect(html).toContain("Smoke&#x27;s first day");
    expect(html).toContain("Today&#x27;s care");
    const plan = await admin.from("care_plan_days").select("task_ids").eq("cat_id", catId).single();
    expect(plan.data?.task_ids).toHaveLength(3);
    for (const p of ["/watch", "/watch/alert", "/watch/weigh-in", "/watch/breathing", "/ask", "/safe", "/report", "/account"]) {
      expect((await call(p)).status, p).toBe(200);
    }
  });

  it("check-in: a bad body is a 400, a good one saves and returns the status", async () => {
    const bad = await post("/api/check-ins", { drinking: "lots" });
    expect([bad.status, (await bad.json()).error]).toEqual([400, "invalid"]);
    const ok = await post("/api/check-ins", { drinking: "more" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "learning", checkins_total: 1 });
  });

  it("breathing over 30 is red and the server writes a red alert; a normal recount resolves it", async () => {
    const red = await post("/api/breathing", { breaths: 17 });
    expect(await red.json()).toMatchObject({ status: "red", bpm: 34 });
    const open = await admin.from("alerts").select("kind, level").eq("cat_id", catId).is("resolved_at", null);
    expect(open.data).toEqual([{ kind: "breathing_over_30", level: "red" }]);
    expect(await (await call("/today")).text()).toContain("GO TO A VET NOW");

    const calm = await post("/api/breathing", { breaths: 11 });
    expect(await calm.json()).toMatchObject({ status: "learning", bpm: 22 });
    const still = await admin.from("alerts").select("id").eq("cat_id", catId).is("resolved_at", null);
    expect(still.data).toEqual([]);
  });

  it("weigh-in saves the difference in pounds and refuses a lighter second reading", async () => {
    const ok = await post("/api/weigh-ins", { ownerWeight: 64.6, withCatWeight: 69.4, unit: "kg" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).catLb).toBeCloseTo(10.58, 1);
    const bad = await post("/api/weigh-ins", { ownerWeight: 150, withCatWeight: 140, unit: "lb" });
    expect([bad.status, (await bad.json()).error]).toEqual([400, "not_heavier"]);
  });

  it("ticks one of today's care tasks", async () => {
    const plan = await admin.from("care_plan_days").select("task_ids").eq("cat_id", catId).single();
    const id = plan.data!.task_ids[0];
    const r = await post("/api/care-plan", { taskId: id, done: true });
    expect(await r.json()).toEqual({ ok: true, doneIds: [id] });
  });
});
