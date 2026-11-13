// Smoke test of the vet report through the real entry points of a running app (local
// `next start` or production): the /report screen, the PDF route, making and revoking a
// share link, and the public /r/<token> page and PDF as a stranger with no cookie.
//   APP_URL=https://app.trypurestream.com npx vitest run tests/smoke-report.test.ts
// Without APP_URL it reports NOT RUN (never a pass). A disposable member is created and
// deleted with everything she made; the residue is asserted zero.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });
const APP = process.env.APP_URL?.replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

if (!APP) console.log("smoke-report: NOT RUN (set APP_URL to run it)");

const email = `smoke-report-${randomUUID().slice(0, 8)}@test.invalid`;
const CAT = `Smokey${randomUUID().slice(0, 4)}`;
let userId = "";
let cookie = "";
let catId = "";
let sharePath = "";

const call = (path: string, init: RequestInit = {}, withCookie = true) =>
  fetch(`${APP}${path}`, { redirect: "manual", ...init, headers: { ...(withCookie ? { cookie } : {}), ...(init.headers ?? {}) } });
const post = (path: string, body: unknown, withCookie = true) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, withCookie);

describe.skipIf(!APP)(`report smoke (${APP})`, () => {
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const m = await admin.from("members").insert({ email, shopify_customer_id: "TEST", status: "trial", trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    if (m.error) throw m.error;
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    const res = await fetch(`${APP}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=magiclink`, { redirect: "manual" });
    expect(res.status).toBe(307);
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toMatch(/sb-.*-auth-token/);
    const onboard = await post("/api/onboarding", {
      name: CAT, pronoun: "he", ageYears: 12, weight: 10, weightUnit: "lb", lives: "indoor", conditions: ["kidney"],
      food: "dry", remindByEmail: true, checkinTime: "08:00", timezone: "America/New_York",
    });
    expect(onboard.status).toBe(200);
    catId = (await onboard.json()).catId;
    expect((await post("/api/check-ins", { drinking: "more" })).status).toBe(200);
    expect((await post("/api/breathing", { breaths: 17 })).status).toBe(200); // 34: red
    expect((await post("/api/breathing", { breaths: 11 })).status).toBe(200); // 22: recount clears it
  });

  afterAll(async () => {
    await admin.from("members").delete().eq("email", email).eq("shopify_customer_id", "TEST");
    if (userId) await admin.auth.admin.deleteUser(userId);
    const users = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email === email).length;
    const members = (await admin.from("members").select("id", { count: "exact", head: true }).eq("email", email)).count;
    const cats = catId ? (await admin.from("cats").select("id", { count: "exact", head: true }).eq("id", catId)).count : 0;
    const shares = catId ? (await admin.from("report_shares").select("id", { count: "exact", head: true }).eq("cat_id", catId)).count : 0;
    console.log(`smoke-report residue: users ${users}, members ${members}, cats ${cats}, shares ${shares}`);
    expect([users, members, cats, shares]).toEqual([0, 0, 0, 0]);
  });

  it("signed out: /report redirects to sign-in, the PDF and share routes answer 401", async () => {
    const page = await call("/report", {}, false);
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toMatch(/\/sign-in$/);
    expect((await call("/api/report/pdf", {}, false)).status).toBe(401);
    expect((await post("/api/report/share", {}, false)).status).toBe(401);
    expect((await post("/api/report/share/revoke", {}, false)).status).toBe(401);
  });

  it("/report renders her cat's report with the your-vet fallback and the red reading on record", async () => {
    const res = await call("/report");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(new RegExp(`${CAT}(<!-- -->)?&#x27;s vet report`));
    expect(html).toMatch(/Ready for (<!-- -->)?your vet/);
    expect(html).toContain("OVER 30 AT REST");
    expect(html).toContain("Not a diagnosis — for your vet to review.");
  });

  it("the PDF route returns a real PDF for her", async () => {
    const res = await call("/api/report/pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
  });

  it("a share link opens the public report and its PDF with no cookie, noindex, and only her cat", async () => {
    const made = await post("/api/report/share", {});
    expect(made.status).toBe(200);
    sharePath = (await made.json()).path;
    expect(sharePath).toMatch(/^\/r\/[A-Za-z0-9_-]{43}$/);

    const page = await call(sharePath, {}, false);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toMatch(new RegExp(`${CAT}(<!-- -->)?&#x27;s vet report`));
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow/);
    expect(html).toContain('<meta name="referrer" content="no-referrer"');
    expect(html).not.toContain("Share with my vet"); // no owner controls
    expect(html).not.toContain('href="/today"'); // no tab bar into the app

    const pdf = await call(`${sharePath}/pdf`, {}, false);
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("bogus and malformed tokens are 404; app pages are still closed to strangers", async () => {
    expect((await call(`/r/${"A".repeat(43)}`, {}, false)).status).toBe(404);
    expect((await call("/r/not-a-token", {}, false)).status).toBe(404);
    expect((await call(`/r/${"A".repeat(43)}/pdf`, {}, false)).status).toBe(404);
    for (const p of ["/report", "/today", "/watch"]) {
      const r = await call(p, {}, false);
      expect([r.status, r.headers.get("location")?.endsWith("/sign-in")], p).toEqual([307, true]);
    }
  });

  it("after Stop sharing, the link is 404", async () => {
    const r = await post("/api/report/share/revoke", {});
    expect(r.status).toBe(200);
    expect((await r.json()).revoked).toBeGreaterThanOrEqual(1);
    expect((await call(sharePath, {}, false)).status).toBe(404);
    expect((await call(`${sharePath}/pdf`, {}, false)).status).toBe(404);
  });
});
