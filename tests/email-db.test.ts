// The welcome and trial-ending emails against the real members and email_log tables, with
// Resend stubbed (only api.resend.com; Supabase calls go through) and, for the webhook path,
// Loop stubbed too. Throwaway members use @example.com (a reserved domain), are scoped by a tag,
// and are deleted with their email_log rows; residue is asserted zero.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { AQUAONE } from "../src/lib/loop";

config({ path: ".env.local", quiet: true });
const SECRET = `test-${randomUUID()}`;
process.env.LOOP_WEBHOOK_SECRET = SECRET;
process.env.LOOP_API_KEY = "test-key-not-real";
process.env.RESEND_API_KEY = "re_test_not_real"; // never the real key: a stub failure can't send
process.env.CRON_SECRET = `cron-${randomUUID()}`;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const tag = randomUUID().slice(0, 8);
const email = (label: string) => `email-${label}-${tag}@example.com`;
const DAY = 86400_000;
const NOW = Date.now();
const at = (ms: number) => new Date(ms).toISOString();

// ---- stubs ---------------------------------------------------------------------------------
type Sent = { to: string; subject: string; key: string | null; text: string };
const sent: Sent[] = [];
let resendFails = false;
const loop = new Map<string, { sub: Record<string, unknown>; orders: unknown[] }>();
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/loop/${name}`, import.meta.url), "utf8"));
const realFetch = globalThis.fetch;
vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.hostname === "api.resend.com") {
    if (resendFails) return json(500, { name: "internal_server_error", message: "stubbed failure" });
    const body = JSON.parse(String(init?.body));
    const headers = new Headers(init?.headers);
    sent.push({ to: body.to[0], subject: body.subject, key: headers.get("idempotency-key"), text: body.text });
    expect(body.from).toBe("AquaOne Health <hello@notify.trypurestream.com>");
    expect(body.reply_to).toBe("help@trypurestream.com");
    return json(200, { id: randomUUID() });
  }
  if (url.hostname === "api.loopsubscriptions.com") {
    const m = url.pathname.match(/^\/admin\/2026-04\/subscription\/(\d+)(\/order\/history)?$/);
    const e = m ? loop.get(m[1]) : undefined;
    if (!e) return json(404, { success: false, message: "not found" });
    return json(200, { success: true, data: m![2] ? e.orders : e.sub, pageInfo: null });
  }
  return realFetch(input, init);
});

const { sendWelcomeIfDue, runDailyEmails, sendOnce } = await import("../src/lib/email.server");
const { welcomeEmail } = await import("../src/lib/email");
const { POST: webhook } = await import("../src/app/api/loop/webhook/route");
const { GET: cron } = await import("../src/app/api/cron/emails/route");

const mine: string[] = [];
async function addMember(label: string, over: Record<string, unknown> = {}) {
  const mail = email(label);
  mine.push(mail);
  const { data, error } = await admin
    .from("members")
    .insert({ email: mail, shopify_customer_id: "123", status: "trial", trial_ends_at: at(NOW + 20 * DAY), ...over })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, mail };
}
const logs = async (memberId: string, kind?: string) => {
  let q = admin.from("email_log").select("kind, status, to_email, provider_id").eq("member_id", memberId);
  if (kind) q = q.eq("kind", kind);
  return (await q).data ?? [];
};
const sentTo = (mail: string, subject?: RegExp) => sent.filter((s) => s.to === mail && (!subject || subject.test(s.subject)));

beforeEach(() => {
  resendFails = false;
});

afterAll(async () => {
  const { data } = await admin.from("members").select("id").in("email", mine);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) await admin.from("email_log").delete().in("member_id", ids);
  await admin.from("email_log").delete().in("to_email", mine);
  await admin.from("members").delete().in("email", mine);
  const members = (await admin.from("members").select("id", { count: "exact", head: true }).in("email", mine)).count;
  const emailLogs = (await admin.from("email_log").select("id", { count: "exact", head: true }).in("to_email", mine)).count;
  console.log(`email-db residue: members ${members}, email_log ${emailLogs}`);
  expect([members, emailLogs]).toEqual([0, 0]);
  vi.unstubAllGlobals();
});

describe("welcome email", () => {
  it("is sent once per member, however often it is triggered", async () => {
    const m = await addMember("welcome");
    expect(await sendWelcomeIfDue(m.mail)).toBe("sent");
    expect(await sendWelcomeIfDue(m.mail.toUpperCase())).toBe("already_sent");
    // Two triggers at the same moment still send one email.
    const both = await Promise.all([sendWelcomeIfDue(m.mail), sendWelcomeIfDue(m.mail)]);
    expect(both).toEqual(["already_sent", "already_sent"]);
    expect(sentTo(m.mail)).toHaveLength(1);
    expect(sentTo(m.mail)[0].key).toBe(`welcome/${m.id}`);
    const rows = await logs(m.id, "welcome");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "sent", to_email: m.mail });
    expect(rows[0].provider_id).toBeTruthy();
  });

  it("is never sent to a TEST row, a member who can't use the app, or an unknown email", async () => {
    const test = await addMember("test-row", { shopify_customer_id: "TEST" });
    const ended = await addMember("ended", { status: "ended" });
    const pastDue = await addMember("pastdue", { status: "past_due" });
    expect(await sendWelcomeIfDue(test.mail)).toBe("not_due");
    expect(await sendWelcomeIfDue(ended.mail)).toBe("not_due");
    expect(await sendWelcomeIfDue(pastDue.mail)).toBe("not_due");
    expect(await sendWelcomeIfDue(email("nobody"))).toBe("not_due");
    // Even the lower-level sender refuses a TEST row.
    expect(await sendOnce({ id: test.id, email: test.mail, shopify_customer_id: "TEST", status: "trial", trial_ends_at: null, paid_through: null, created_at: at(NOW) }, "welcome", welcomeEmail())).toBe("not_emailable");
    for (const x of [test, ended, pastDue]) {
      expect(sentTo(x.mail)).toHaveLength(0);
      expect(await logs(x.id)).toHaveLength(0);
    }
  });

  it("a failed send is logged as failed, and the daily run sends it once later", async () => {
    const m = await addMember("retry");
    resendFails = true;
    expect(await sendWelcomeIfDue(m.mail)).toBe("failed");
    expect((await logs(m.id, "welcome")).map((r) => r.status)).toEqual(["failed"]);
    resendFails = false;
    const run1 = await runDailyEmails(new Date(NOW), { onlyEmails: [m.mail] });
    expect(run1.welcome).toEqual({ sent: 1 });
    const run2 = await runDailyEmails(new Date(NOW + DAY), { onlyEmails: [m.mail] });
    expect(run2.welcome).toEqual({});
    expect(sentTo(m.mail)).toHaveLength(1);
    expect((await logs(m.id, "welcome")).map((r) => r.status).sort()).toEqual(["failed", "sent"]);
  });

  it("goes out through the real Loop webhook on her first purchase, once across repeated deliveries", async () => {
    const mail = email("webhook");
    mine.push(mail);
    const base = fixture("api-subscription.json").data;
    const id = 950_000_000 + Math.floor(Math.random() * 40_000_000);
    const sub = {
      ...base,
      id,
      status: "ACTIVE",
      createdAt: at(NOW - 60_000),
      billingPolicy: { interval: "DAY", intervalCount: 30 },
      lines: [{ ...base.lines[0], productShopifyId: Number(AQUAONE.productId), variantShopifyId: Number(AQUAONE.variantId), sellingPlanShopifyId: Number(AQUAONE.sellingPlanId), sku: AQUAONE.sku }],
      customer: { ...base.customer, email: mail, shopifyId: 8_000_000_000 + id },
    };
    loop.set(String(id), { sub, orders: [{ ...fixture("api-order-history.json").data[0], status: "PROCESSED", billingDate: sub.createdAt, totalPriceUsd: "0.00" }] });
    const body = fixture("webhook-subscription-cancelled.json");
    body.payload.id = id;
    body.payload.status = "ACTIVE";
    body.payload.lineItems = [{ ...body.payload.lineItems[0], ...sub.lines[0] }];
    const raw = JSON.stringify(body);
    const deliver = () =>
      webhook(
        new Request("https://app.trypurestream.com/api/loop/webhook", {
          method: "POST",
          headers: { "content-type": "application/json", "x-loop-webhook-topic": "subscription/created", "x-loop-webhook-id": randomUUID(), "x-loop-webhook-signature": "v1=" + createHmac("sha256", SECRET).update(raw).digest("hex") },
          body: raw,
        }),
      );
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    const row = (await admin.from("members").select("id, status").eq("email", mail).single()).data!;
    expect(row.status).toBe("trial");
    expect(sentTo(mail, /ready/)).toHaveLength(1);
    expect(await logs(row.id, "welcome")).toHaveLength(1);
  });
});

describe("trial-ending email", () => {
  it("each trial ending soon gets exactly one, across consecutive daily runs; active, cancelled and TEST get none", async () => {
    const soon = await addMember("ends-2d", { trial_ends_at: at(NOW + 2.5 * DAY) });
    const later = await addMember("ends-5d", { trial_ends_at: at(NOW + 5.2 * DAY) });
    const active = await addMember("active", { status: "active", trial_ends_at: at(NOW + 2.5 * DAY), paid_through: at(NOW + 2.5 * DAY) });
    const cancelled = await addMember("cancelled", { status: "cancelled", trial_ends_at: at(NOW + 2.5 * DAY) });
    const test = await addMember("test-trial", { shopify_customer_id: "TEST", trial_ends_at: at(NOW + 2.5 * DAY) });
    const scope = [soon, later, active, cancelled, test].map((m) => m.mail);
    // Welcomes are not under test here: mark them sent so the catch-up stays out of the way.
    await admin.from("email_log").insert([soon, later, active, cancelled].map((m) => ({ member_id: m.id, to_email: m.mail, kind: "welcome", status: "sent" })));

    for (let d = 0; d < 6; d++) await runDailyEmails(new Date(NOW + d * DAY), { onlyEmails: scope });

    expect(sentTo(soon.mail, /free month/)).toHaveLength(1);
    expect(sentTo(later.mail, /free month/)).toHaveLength(1);
    for (const m of [active, cancelled, test]) expect(sentTo(m.mail)).toHaveLength(0);
    expect(await logs(soon.id, "trial_ending")).toHaveLength(1);
    expect(sentTo(soon.mail)[0].key).toBe(`trial_ending/${soon.id}`);
    expect(sentTo(soon.mail)[0].text).toContain("$19.95 every 30 days");
  });
});

describe("email cron route", () => {
  it("answers 401 without the secret or with a wrong one, and sends nothing", async () => {
    const before = sent.length;
    const call = (auth?: string) => cron(new Request("https://app.trypurestream.com/api/cron/emails", { headers: auth ? { authorization: auth } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(process.env.CRON_SECRET)).status).toBe(401); // missing "Bearer "
    expect(sent.length).toBe(before);
  });
});
