// /join through the real entry point of a running app (local `next start`/`next dev` or
// the production URL): what a signed-out past buyer sees, what a signed-in member sees,
// and that the sign-in gate still guards the app pages.
//   APP_URL=http://localhost:3000 npx vitest run tests/smoke-join.test.ts
// Without APP_URL it reports NOT RUN (never a pass). The disposable member it creates is
// deleted, and the residue is asserted zero.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { JOIN_CHECKOUT_URL, joinCta } from "../src/lib/join";

config({ path: ".env.local", quiet: true });
const APP = process.env.APP_URL?.replace(/\/$/, "");

// The checkout link as it appears in the rendered HTML (& is escaped in attributes).
const HREF = `href="${JOIN_CHECKOUT_URL.replace(/&/g, "&amp;")}"`;
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("joinCta", () => {
  it("sends everyone who isn't a member to the tested Loop checkout link", () => {
    expect(joinCta(false)).toEqual({ href: JOIN_CHECKOUT_URL, label: "Start my free month", member: false });
    const u = new URL(JOIN_CHECKOUT_URL);
    expect([u.host, u.pathname]).toEqual(["trypurestream.com", "/cart/add"]);
    expect(Object.fromEntries(u.searchParams)).toEqual({ id: "41499429535808", quantity: "1", selling_plan: "1050804288", return_to: "/checkout" });
  });
  it("sends a member to the app instead of a second subscription", () => {
    expect(joinCta(true)).toEqual({ href: "/today", label: "Open the app", member: true });
  });
});

if (!APP) console.log("smoke-join: NOT RUN (set APP_URL to run it)");

describe.skipIf(!APP)(`/join smoke (${APP})`, () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const email = `smoke-join-${randomUUID().slice(0, 8)}@test.invalid`;
  let userId = "";
  let cookie = "";

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
  });

  afterAll(async () => {
    await admin.from("members").delete().eq("email", email).eq("shopify_customer_id", "TEST");
    if (userId) await admin.auth.admin.deleteUser(userId);
    const users = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email === email).length;
    const members = (await admin.from("members").select("id", { count: "exact", head: true }).eq("email", email)).count;
    console.log(`smoke-join residue: users ${users}, members ${members}`);
    expect([users, members]).toEqual([0, 0]);
  });

  it("signed out: /join is public and every button opens the checkout link", async () => {
    const res = await fetch(`${APP}/join`, { redirect: "manual" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("The app that notices");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    // Header, listing "Try free", hero, offer card, closing: five links to checkout, none to /today.
    expect(count(html, HREF)).toBe(5);
    expect(count(html, ">Start my free month<")).toBe(4); // rendered text, not the RSC payload copy
    expect(html).not.toContain('href="/today"');
    expect(html).not.toContain("You&#x27;re already a member");
  });

  it("signed in as a member: every button opens the app instead", async () => {
    const html = await (await fetch(`${APP}/join`, { headers: { cookie }, redirect: "manual" })).text();
    expect(count(html, HREF)).toBe(0);
    expect(count(html, 'href="/today"')).toBe(5);
    expect(html).toContain("Open the app");
    expect(html).toContain("already a member");
  });

  it("the sign-in gate still guards the app and its public pages stay public", async () => {
    for (const path of ["/today", "/account", "/watch", "/ask"]) {
      const r = await fetch(`${APP}${path}`, { redirect: "manual" });
      expect([path, r.status, r.headers.get("location")?.replace(APP!, "")]).toEqual([path, 307, "/sign-in"]);
    }
    for (const path of ["/", "/sign-in", "/help", "/terms", "/privacy", "/subscription-terms"]) {
      expect([path, (await fetch(`${APP}${path}`, { redirect: "manual" })).status]).toEqual([path, 200]);
    }
    // A look-alike path is not public: only /join and /join/... are.
    const lookalike = await fetch(`${APP}/joinx`, { redirect: "manual" });
    expect([lookalike.status, lookalike.headers.get("location")?.replace(APP!, "")]).toEqual([307, "/sign-in"]);
  });
});
