// The Loop webhook and nightly reconcile, end to end through the real route handlers and the
// real members table. Loop's API is stubbed (only api.loopsubscriptions.com; Supabase calls go
// through), serving Loop's own reference examples with the AquaOne Health line swapped in.
// Every row uses a throwaway @test.invalid email and is deleted afterwards; residue is asserted zero.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { AQUAONE } from "../src/lib/loop";

config({ path: ".env.local", quiet: true });
const SECRET = `test-${randomUUID()}`;
process.env.LOOP_WEBHOOK_SECRET = SECRET;
process.env.LOOP_API_KEY = "test-key-not-real";
process.env.CRON_SECRET = `cron-${randomUUID()}`;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/loop/${name}`, import.meta.url), "utf8"));
const tag = randomUUID().slice(0, 8);
const email = (label: string) => `loop-${label}-${tag}@test.invalid`;
const ourLine = { productShopifyId: Number(AQUAONE.productId), variantShopifyId: Number(AQUAONE.variantId), sellingPlanShopifyId: Number(AQUAONE.sellingPlanId), sku: AQUAONE.sku };
let nextId = 900_000_000 + Math.floor(Math.random() * 90_000_000);

// What the stubbed Loop API holds: subscription id -> { subscription, order history }.
type Sub = Record<string, unknown> & { id: number };
const loop = new Map<string, { sub: Sub; orders: unknown[] }>();
const freeFirst = (created: string) => ({ ...fixture("api-order-history.json").data[0], status: "PROCESSED", billingDate: created, totalPriceUsd: "0.00" });
const renewal = (at: string) => ({ ...fixture("api-order-history.json").data[0], status: "PROCESSED", billingDate: at, totalPriceUsd: "19.95" });

function makeSub(mail: string, over: Partial<Sub> = {}, ours = true): Sub {
  const base = fixture("api-subscription.json").data;
  const id = nextId++;
  const sub: Sub = {
    ...base,
    id,
    status: "ACTIVE",
    createdAt: "2026-11-14T10:00:00.000Z",
    billingPolicy: { interval: "DAY", intervalCount: 30 },
    lines: [{ ...base.lines[0], ...(ours ? ourLine : {}) }],
    customer: { ...base.customer, email: mail, shopifyId: 7_000_000_000 + id },
    ...over,
  };
  loop.set(String(id), { sub, orders: [freeFirst(sub.createdAt as string)] });
  return sub;
}

const realFetch = globalThis.fetch;
vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "api.loopsubscriptions.com") return realFetch(input, init);
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const m = url.pathname.match(/^\/admin\/2026-04\/subscription(?:\/(\d+)(\/order\/history)?)?$/);
  if (!m) return json(404, { success: false, message: "no route" });
  if (!m[1]) return json(200, { success: true, data: [...loop.values()].map((v) => v.sub), pageInfo: { hasNextPage: false, nextCursor: null } });
  const entry = loop.get(m[1]);
  if (!entry) return json(404, { success: false, message: "Subscription not found", data: null, code: "NOT_FOUND" });
  return json(200, { success: true, data: m[2] ? entry.orders : entry.sub, pageInfo: null });
});

const { POST } = await import("../src/app/api/loop/webhook/route");
const { GET } = await import("../src/app/api/loop/reconcile/route");

// A webhook as Loop sends it: its own example payload for the topic, pointed at our subscription.
function webhookBody(topic: string, sub: Sub) {
  if (topic.startsWith("order/")) {
    const body = fixture(topic === "order/paymentFailed" ? "webhook-order-payment-failed.json" : "webhook-order-processed.json");
    body.payload.subscription.id = sub.id;
    body.payload.subscription.lineItems = [{ ...body.payload.subscription.lineItems[0], ...ourLine }];
    body.payload.lineItems = [{ ...body.payload.lineItems[0], productShopifyId: ourLine.productShopifyId, variantShopifyId: ourLine.variantShopifyId }];
    return JSON.stringify(body);
  }
  const body = fixture("webhook-subscription-cancelled.json");
  body.payload.id = sub.id;
  body.payload.status = String(sub.status);
  const lines = sub.lines as Record<string, unknown>[];
  body.payload.lineItems = [{ ...body.payload.lineItems[0], productShopifyId: lines[0].productShopifyId, variantShopifyId: lines[0].variantShopifyId, sellingPlanShopifyId: lines[0].sellingPlanShopifyId, sku: lines[0].sku }];
  return JSON.stringify(body);
}
const deliver = (topic: string, raw: string, signature: string | null = "v1=" + createHmac("sha256", SECRET).update(raw).digest("hex")) =>
  POST(new Request("https://app.trypurestream.com/api/loop/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-loop-webhook-topic": topic, "x-loop-webhook-id": randomUUID(), ...(signature ? { "x-loop-webhook-signature": signature } : {}) },
    body: raw,
  }));
const send = (topic: string, sub: Sub) => deliver(topic, webhookBody(topic, sub));
const row = async (mail: string) => (await admin.from("members").select("*").eq("email", mail).maybeSingle()).data;
const setLoop = (sub: Sub, over: Partial<Sub>, orders?: unknown[]) => {
  const e = loop.get(String(sub.id))!;
  Object.assign(e.sub, over);
  if (orders) e.orders = orders;
};

beforeAll(async () => {
  const { error } = await admin.from("members").select("id").limit(1);
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("members").delete().like("email", `loop-%-${tag}@test.invalid`);
  const { count } = await admin.from("members").select("id", { count: "exact", head: true }).like("email", `loop-%-${tag}@test.invalid`);
  console.log(`loop-webhook cleanup: ${count} throwaway rows left`);
  expect(count).toBe(0);
  vi.unstubAllGlobals();
});

describe("Loop webhook", () => {
  it("rejects an unsigned, a wrongly signed and a tampered delivery with 401 and writes nothing", async () => {
    const sub = makeSub(email("unsigned"));
    const raw = webhookBody("subscription/created", sub);
    expect((await deliver("subscription/created", raw, null)).status).toBe(401);
    expect((await deliver("subscription/created", raw, "v1=" + createHmac("sha256", "wrong").update(raw).digest("hex"))).status).toBe(401);
    const goodSig = "v1=" + createHmac("sha256", SECRET).update(raw).digest("hex");
    expect((await deliver("subscription/created", raw.replace(String(sub.id), String(sub.id + 1)), goodSig)).status).toBe(401);
    expect(await row(email("unsigned"))).toBeNull();
  });

  it("ignores another product's subscription and writes nothing", async () => {
    const sub = makeSub(email("other"), {}, false);
    const res = await send("subscription/created", sub);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "not_aquaone" });
    expect(await row(email("other"))).toBeNull();
  });

  it("created -> trial; the same event twice leaves the same row", async () => {
    const mail = email("trial");
    const sub = makeSub(mail.toUpperCase());
    expect((await send("subscription/created", sub)).status).toBe(200);
    const first = await row(mail);
    expect(first).toMatchObject({ status: "trial", contract_id: String(sub.id), shopify_customer_id: String(7_000_000_000 + sub.id), paid_through: null });
    expect(new Date(first!.trial_ends_at).toISOString()).toBe("2026-12-14T10:00:00.000Z");
    const again = await send("subscription/created", sub);
    expect(await again.json()).toMatchObject({ outcome: "unchanged" });
    expect(await row(mail)).toEqual(first);
    const { count } = await admin.from("members").select("id", { count: "exact", head: true }).eq("email", mail);
    expect(count).toBe(1);
  });

  it("walks a member through renewal, failed payment, recovery, cancel and expiry", async () => {
    const mail = email("life");
    const sub = makeSub(mail);
    await send("subscription/created", sub);

    setLoop(sub, {}, [freeFirst("2026-11-14T10:00:00.000Z"), renewal("2026-12-14T10:00:00.000Z")]);
    await send("order/processed", sub);
    let r = await row(mail);
    expect(r).toMatchObject({ status: "active" });
    expect(new Date(r!.paid_through).toISOString()).toBe("2027-01-13T10:00:00.000Z");

    setLoop(sub, { lastPaymentStatus: "FAILED" });
    await send("order/paymentFailed", sub);
    expect((await row(mail))!.status).toBe("past_due");

    setLoop(sub, { lastPaymentStatus: "SUCCESS" });
    await send("order/processed", sub);
    expect((await row(mail))!.status).toBe("active");

    setLoop(sub, { status: "PAUSED" });
    await send("subscription/paused", sub);
    expect((await row(mail))!.status).toBe("cancelled");
    setLoop(sub, { status: "ACTIVE" });
    await send("subscription/resumed", sub);
    expect((await row(mail))!.status).toBe("active");

    setLoop(sub, { status: "CANCELLED", nextBillingDateEpoch: null });
    await send("subscription/cancelled", sub);
    r = await row(mail);
    expect(r).toMatchObject({ status: "cancelled" });
    expect(new Date(r!.paid_through).toISOString()).toBe("2027-01-13T10:00:00.000Z"); // still has what she paid for

    setLoop(sub, { status: "EXPIRED" });
    await send("subscription/expired", sub);
    expect((await row(mail))!.status).toBe("ended");
  });

  it("is out-of-order safe: a late 'created' after 'cancelled' leaves the cancelled state Loop holds", async () => {
    const mail = email("late");
    const sub = makeSub(mail, { status: "CANCELLED" });
    await send("subscription/cancelled", sub);
    await send("subscription/created", { ...sub, status: "ACTIVE" }); // stale payload; Loop says CANCELLED
    expect((await row(mail))!.status).toBe("cancelled");
  });

  it("never touches a TEST row", async () => {
    const mail = email("testrow");
    await admin.from("members").insert({ email: mail, shopify_customer_id: "TEST", status: "trial", trial_ends_at: "2026-12-31T00:00:00Z" });
    const before = await row(mail);
    const sub = makeSub(mail, { status: "EXPIRED" });
    const res = await send("subscription/expired", sub);
    expect(await res.json()).toMatchObject({ outcome: "skipped_test_row" });
    expect(await row(mail)).toEqual(before);
  });

  it("an older contract ending doesn't lock out a member whose newer contract is live", async () => {
    const mail = email("two");
    const live = makeSub(mail);
    const old = makeSub(mail, { status: "EXPIRED", createdAt: "2026-10-01T10:00:00.000Z" });
    await send("subscription/created", live);
    const res = await send("subscription/expired", old);
    expect(await res.json()).toMatchObject({ outcome: "kept_other_contract" });
    expect(await row(mail)).toMatchObject({ status: "trial", contract_id: String(live.id) });
  });

  it("a subscription Loop can't find yet is retried (503), not dropped", async () => {
    const sub = makeSub(email("missing"));
    const raw = webhookBody("subscription/created", sub);
    loop.delete(String(sub.id));
    expect((await deliver("subscription/created", raw)).status).toBe(503);
    expect(await row(email("missing"))).toBeNull();
  });
});

describe("nightly reconcile", () => {
  const cron = (auth?: string) => GET(new Request("https://app.trypurestream.com/api/loop/reconcile", { headers: auth ? { authorization: auth } : {} }));

  it("refuses a call without the cron secret", async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong")).status).toBe(401);
  });

  it("restores a deleted row, corrects a stale one and ends a contract that is no longer ours", async () => {
    const lostMail = email("lost");
    const lost = makeSub(lostMail);
    await send("subscription/created", lost);
    await admin.from("members").delete().eq("email", lostMail); // a missed webhook

    const staleMail = email("stale");
    const stale = makeSub(staleMail);
    await send("subscription/created", stale);
    setLoop(stale, { status: "CANCELLED" }); // the cancel webhook never arrived

    const swappedMail = email("swapped");
    const swapped = makeSub(swappedMail);
    await send("subscription/created", swapped);
    setLoop(swapped, { lines: [{ ...(swapped.lines as object[])[0], productShopifyId: 1, variantShopifyId: 2, sellingPlanShopifyId: 3, sku: null }] });

    // Only this test's subscriptions are listed; real members' contracts (if any) 404 in the stub, so nothing real is written.
    const keep = new Set([lost, stale, swapped].map((s) => String(s.id)));
    for (const id of [...loop.keys()]) if (!keep.has(id)) loop.delete(id);
    const res = await cron(`Bearer ${process.env.CRON_SECRET}`);
    const summary = await res.json();
    expect(summary.aquaone).toBe(2);
    expect(await row(lostMail)).toMatchObject({ status: "trial", contract_id: String(lost.id) });
    expect((await row(staleMail))!.status).toBe("cancelled");
    expect((await row(swappedMail))!.status).toBe("ended");

    // Run it again: nothing left to change for these rows.
    const second = await (await cron(`Bearer ${process.env.CRON_SECRET}`)).json();
    expect(second.outcomes.updated ?? 0).toBe(0);
    expect(second.outcomes.inserted ?? 0).toBe(0);
  });
});
