// Is it safe? through the real entry points of a running app (local `next start` or production):
// a disposable member signs in through /auth/confirm with a real one-time token, then uses the
// real API routes and pages.
//   APP_URL=http://localhost:3000 npx vitest run tests/smoke-safe.test.ts
// Without APP_URL it reports NOT RUN (never a pass). Everything it creates is deleted, and the
// residue is asserted zero. No photo is sent to the model here (see safe-live.test.ts).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });
const APP = process.env.APP_URL?.replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

if (!APP) console.log("smoke-safe: NOT RUN (set APP_URL to run it)");

const email = `smoke-safe-${randomUUID().slice(0, 8)}@test.invalid`;
let userId = "";
let cookie = "";
let catId = "";

const call = (path: string, init: RequestInit = {}, withCookie = true) =>
  fetch(`${APP}${path}`, { redirect: "manual", ...init, headers: { ...(withCookie ? { cookie } : {}), ...(init.headers ?? {}) } });
// Page text as she reads it: React's text separators and HTML apostrophes removed.
const text = async (r: Response) => (await r.text()).replace(/<!-- -->/g, "").replace(/&#x27;|&#39;/g, "'");
const post = (path: string, body: unknown, withCookie = true) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, withCookie);

describe.skipIf(!APP)(`Is it safe? smoke (${APP})`, () => {
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const m = await admin.from("members").insert({ email, shopify_customer_id: "TEST", status: "trial", trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    if (m.error) throw m.error;
    const cat = await admin.from("cats").insert({ owner_id: userId, name: "Smokey", pronoun: "she" }).select("id").single();
    if (cat.error) throw cat.error;
    catId = cat.data.id;
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
    const cats = (await admin.from("cats").select("id", { count: "exact", head: true }).eq("id", catId)).count;
    const lookups = (await admin.from("safety_lookups").select("id", { count: "exact", head: true }).eq("cat_id", catId)).count;
    console.log(`smoke-safe residue: users ${users}, members ${members}, cats ${cats}, lookups ${lookups}`);
    expect([users, members, cats, lookups]).toEqual([0, 0, 0, 0]);
  });

  it("signed out: the page redirects to /sign-in and every Safe API answers 401", async () => {
    const page = await call("/safe", {}, false);
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toMatch(/\/sign-in$/);
    expect((await post("/api/safe/search", { q: "lily" }, false)).status).toBe(401);
    expect((await post("/api/safe/lookup", { q: "lily", itemId: null }, false)).status).toBe(401);
    expect((await call("/api/safe/photo", { method: "POST", body: new FormData() }, false)).status).toBe(401);
  });

  it("search finds the lily as an emergency, by alias and misspelling too", async () => {
    for (const q of ["lily", "easter lilly", "tylenol"]) {
      const r = await post("/api/safe/search", { q });
      expect(r.status, q).toBe(200);
      const top = (await r.json()).results[0];
      expect(top.severity, q).toBe("emergency");
    }
    expect((await post("/api/safe/search", { q: "" })).status).toBe(400);
  });

  it("opening the lily logs the lookup and shows the toxic answer", async () => {
    const lily = (await (await post("/api/safe/search", { q: "lily" })).json()).results[0];
    const log = await post("/api/safe/lookup", { q: "lily", itemId: lily.id });
    expect([log.status, (await log.json()).logged]).toEqual([200, true]);
    const page = await call(`/safe/item/${lily.id}`);
    expect(page.status).toBe(200);
    const html = await text(page);
    expect(html).toContain("TOXIC TO CATS");
    expect(html).toMatch(/pollen/);
    expect(html).toContain("(888) 426-4435");
    expect(html).toContain("(855) 764-7661");
    const home = await text(await call("/safe"));
    expect(home).toContain("Is it safe for Smokey?");
    expect(home).toContain("RECENTLY CHECKED");
  });

  it("a safe plant shows the safe answer", async () => {
    const spider = (await (await post("/api/safe/search", { q: "spider plant" })).json()).results[0];
    const html = await text(await call(`/safe/item/${spider.id}`));
    expect(html).toContain("SAFE FOR CATS");
  });

  it("something not on the list gets the decided message in her pronoun", async () => {
    const page = await call("/safe/unknown?q=kombucha");
    expect(page.status).toBe(200);
    const html = await text(page);
    expect(html).toContain("We don't have this one. If she's eaten it, call the poison line now.");
  });

  it("the photo route refuses a file that isn't a photo, before any model call", async () => {
    const form = new FormData();
    form.append("photo", new Blob(["not a photo"], { type: "text/plain" }), "x.txt");
    const r = await call("/api/safe/photo", { method: "POST", body: form });
    expect([r.status, (await r.json()).error]).toEqual([415, "bad_type"]);
  });

  it("the category lists open", async () => {
    for (const c of ["plant", "food", "household", "medicine"]) expect((await call(`/safe/browse/${c}`)).status, c).toBe(200);
    expect((await call("/safe/browse/nonsense")).status).toBe(404);
  });
});
