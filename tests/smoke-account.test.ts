// Smoke test of Account, Help, the legal pages and the email cron through a running app
// (local `next start` or production). A disposable TEST member signs in exactly as the emailed
// link does, onboards, then uses the real pages and routes. TEST rows are never emailed.
//   APP_URL=http://localhost:3000 npx vitest run tests/smoke-account.test.ts
// Without APP_URL it reports NOT RUN (never a pass). Everything it creates is deleted and the
// residue is asserted zero.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });
const APP = process.env.APP_URL?.replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
if (!APP) console.log("smoke-account: NOT RUN (set APP_URL to run it)");

const email = `smoke-acct-${randomUUID().slice(0, 8)}@test.invalid`;
let userId = "";
let cookie = "";
const call = (path: string, init: RequestInit = {}, withCookie = true) =>
  fetch(`${APP}${path}`, { redirect: "manual", ...init, headers: { ...(withCookie ? { cookie } : {}), ...(init.headers ?? {}) } });
const post = (path: string, body: unknown, withCookie = true) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, withCookie);
const catEdit = { name: "Smokey", pronoun: "she", ageYears: 12, weight: 9.5, weightUnit: "lb", lives: "both", food: "wet", conditions: ["thyroid"], vetName: "Dr. Test", vetPhone: "555 0100" };

describe.skipIf(!APP)(`account smoke (${APP})`, () => {
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const m = await admin.from("members").insert({ email, shopify_customer_id: "TEST", status: "trial", trial_ends_at: new Date(Date.now() + 20 * 86400000).toISOString() });
    if (m.error) throw m.error;
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    const res = await fetch(`${APP}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=magiclink`, { redirect: "manual" });
    expect(res.status).toBe(307);
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toMatch(/sb-.*-auth-token/);
  });

  afterAll(async () => {
    await admin.from("members").delete().eq("email", email).eq("shopify_customer_id", "TEST");
    if (userId) await admin.auth.admin.deleteUser(userId);
    const users = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email === email).length;
    const members = (await admin.from("members").select("id", { count: "exact", head: true }).eq("email", email)).count;
    const cats = (await admin.from("cats").select("id", { count: "exact", head: true }).eq("owner_id", userId)).count;
    const logs = (await admin.from("email_log").select("id", { count: "exact", head: true }).eq("to_email", email)).count;
    console.log(`smoke-account residue: users ${users}, members ${members}, cats ${cats}, email_log ${logs}`);
    expect([users, members, cats, logs]).toEqual([0, 0, 0, 0]);
  });

  it("Help and the legal pages answer 200 to a stranger", async () => {
    const pages: [string, RegExp][] = [
      ["/help", /How can we help\?/],
      ["/terms", /Terms of use[\s\S]*not veterinary advice/],
      ["/privacy", /Privacy policy[\s\S]*never sell/],
      ["/subscription-terms", /Subscription terms[\s\S]*\$19\.95 every 30 days/],
    ];
    for (const [path, text] of pages) {
      const r = await call(path, {}, false);
      expect(r.status, path).toBe(200);
      const html = await r.text();
      expect(html, path).toMatch(text);
      expect(html, path).toContain("help@trypurestream.com");
    }
  });

  it("signed out: Account redirects to sign-in, its APIs answer 401, the email cron 401 without its secret", async () => {
    const page = await call("/account", {}, false);
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toMatch(/\/sign-in$/);
    expect((await post("/api/account/cat", catEdit, false)).status).toBe(401);
    expect((await post("/api/account/reminders", { byEmail: true, checkinTime: "08:00" }, false)).status).toBe(401);
    expect((await call("/api/cron/emails", {}, false)).status).toBe(401);
    expect((await call("/api/cron/emails", { headers: { authorization: "Bearer wrong" } }, false)).status).toBe(401);
  });

  it("signed in: Account shows her free month, cat and the cancel path; sub-pages load", async () => {
    const r = await post("/api/onboarding", { name: "Smoke", pronoun: "she", ageYears: 9, weight: null, weightUnit: "lb", lives: "indoor", conditions: [], food: "dry", remindByEmail: true, checkinTime: "08:00", timezone: "America/New_York" });
    expect(r.status).toBe(200);
    const page = await call("/account");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toMatch(/Free until [A-Z][a-z]{2} \d{1,2}/);
    expect(html).toContain("Free month");
    expect(html).toContain("Manage or cancel membership");
    expect(html).toContain("Smoke");
    expect(html).toContain("Sign out");
    for (const p of ["/account/cat", "/account/reminders", "/account/legal"]) expect((await call(p)).status, p).toBe(200);
  });

  it("edit cat: invalid is refused with 400, valid saves through her session", async () => {
    expect((await post("/api/account/cat", { ...catEdit, name: "" })).status).toBe(400);
    expect((await post("/api/account/cat", { ...catEdit, conditions: ["made_up"] })).status).toBe(400);
    const ok = await post("/api/account/cat", catEdit);
    expect(ok.status).toBe(200);
    const cat = (await admin.from("cats").select("name, age_years, lives, food, conditions, vet_name").eq("owner_id", userId).single()).data;
    expect(cat).toMatchObject({ name: "Smokey", lives: "both", food: "wet", conditions: ["thyroid"], vet_name: "Dr. Test" });
    expect(Number(cat!.age_years)).toBe(12);
  });

  it("reminder settings save", async () => {
    expect((await post("/api/account/reminders", { byEmail: false, checkinTime: "12:00" })).status).toBe(200);
    expect((await post("/api/account/reminders", { byEmail: false, checkinTime: "04:00" })).status).toBe(400);
    const prefs = (await admin.from("reminder_prefs").select("by_email, checkin_time").eq("user_id", userId).single()).data;
    expect(prefs).toEqual({ by_email: false, checkin_time: "12:00:00" });
    expect((await call("/account")).status).toBe(200);
  });
});
