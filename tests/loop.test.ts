// Unit tests for the Loop -> membership logic. Fixtures in tests/fixtures/loop are Loop's own
// reference examples (developer.loopwork.co, API 2026-04, fetched 13 Nov 2026), loaded verbatim;
// each test swaps in the AquaOne Health line and the dates it needs.
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  AQUAONE,
  LOOP_TOPICS,
  accessRank,
  addInterval,
  deriveMember,
  lastRenewalDate,
  verifyLoopSignature,
  webhookSecrets,
  webhookTarget,
  type LoopOrder,
  type LoopSubscription,
} from "../src/lib/loop";
import { membershipAllows } from "../src/lib/membership";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/loop/${name}`, import.meta.url), "utf8"));
const sign = (body: string, secret: string) => "v1=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
const ourLine = { productShopifyId: Number(AQUAONE.productId), variantShopifyId: Number(AQUAONE.variantId), sellingPlanShopifyId: Number(AQUAONE.sellingPlanId), sku: AQUAONE.sku };
const plan = { interval: "DAY", intervalCount: 30 };

// The API read example, made into an AquaOne Health membership bought on 1 Nov.
function apiSub(over: Partial<LoopSubscription> = {}): LoopSubscription {
  const base = fixture("api-subscription.json").data;
  return { ...base, createdAt: "2026-11-01T10:00:00.000Z", billingPolicy: plan, lines: [{ ...base.lines[0], ...ourLine }], customer: { ...base.customer, email: "  Jane@Example.COM " }, ...over };
}
const history = (orders: LoopOrder[]) => {
  const ex = fixture("api-order-history.json").data[0];
  return orders.map((o) => ({ ...ex, ...o }));
};
const freeFirst = { status: "PROCESSED", billingDate: "2026-11-01T10:00:00.000Z", totalPriceUsd: "0.00" };
const renewal = { status: "PROCESSED", billingDate: "2026-12-01T10:00:00.000Z", totalPriceUsd: "19.95" };

describe("webhook signature", () => {
  const body = JSON.stringify(fixture("webhook-subscription-cancelled.json"));
  it("accepts a valid v1 signature", () => {
    expect(verifyLoopSignature(body, sign(body, "s1"), ["s1"])).toBe(true);
  });
  it("rejects a wrong secret, a missing header, a malformed header", () => {
    expect(verifyLoopSignature(body, sign(body, "other"), ["s1"])).toBe(false);
    expect(verifyLoopSignature(body, null, ["s1"])).toBe(false);
    expect(verifyLoopSignature(body, "", ["s1"])).toBe(false);
    expect(verifyLoopSignature(body, sign(body, "s1").slice(3), ["s1"])).toBe(false); // no v1= prefix
    expect(verifyLoopSignature(body, "v1=abc", ["s1"])).toBe(false);
  });
  it("rejects a tampered body", () => {
    const sig = sign(body, "s1");
    expect(verifyLoopSignature(body.replace("CANCELLED", "ACTIVE"), sig, ["s1"])).toBe(false);
    expect(verifyLoopSignature(body + " ", sig, ["s1"])).toBe(false);
  });
  it("accepts any match when Loop sends several signatures, and we hold several secrets", () => {
    const header = `${sign(body, "old")}, ${sign(body, "new")},v2=ignored`;
    expect(verifyLoopSignature(body, header, ["new"])).toBe(true);
    expect(verifyLoopSignature(body, header, ["old"])).toBe(true);
    expect(verifyLoopSignature(body, sign(body, "new"), webhookSecrets("old, new"))).toBe(true);
    expect(verifyLoopSignature(body, header, ["third"])).toBe(false);
  });
  it("never accepts an empty secret list or empty secret", () => {
    expect(verifyLoopSignature(body, sign(body, ""), [])).toBe(false);
    expect(verifyLoopSignature(body, sign(body, ""), webhookSecrets(" , "))).toBe(false);
  });
});

describe("which subscription a webhook is about", () => {
  it("reads the subscription id from subscription topics and order topics", () => {
    const sub = fixture("webhook-subscription-cancelled.json");
    expect(webhookTarget("subscription/cancelled", sub)).toEqual({ kind: "subscription", subscriptionId: String(sub.payload.id), linesSeen: true, ours: false });
    const order = fixture("webhook-order-payment-failed.json");
    expect(webhookTarget("order/paymentFailed", order)).toMatchObject({ subscriptionId: String(order.payload.subscription.id), linesSeen: true, ours: false });
  });
  it("marks our product as ours, by product, variant, plan or SKU", () => {
    const sub = fixture("webhook-subscription-paused.json");
    for (const line of [{ productShopifyId: Number(AQUAONE.productId) }, { variantShopifyId: AQUAONE.variantId }, { sellingPlanShopifyId: Number(AQUAONE.sellingPlanId) }, { sku: AQUAONE.sku }]) {
      sub.payload.lineItems = [{ ...sub.payload.lineItems[0], productShopifyId: 1, variantShopifyId: 2, sellingPlanShopifyId: 3, sku: null, ...line }];
      expect(webhookTarget("subscription/paused", sub)).toMatchObject({ ours: true });
    }
    const order = fixture("webhook-order-processed.json");
    order.payload.subscription.lineItems = [{ ...order.payload.subscription.lineItems[0], ...ourLine }];
    expect(webhookTarget("order/processed", order)).toMatchObject({ ours: true });
  });
  it("returns none for a payload without a subscription", () => {
    expect(webhookTarget("subscription/created", {})).toEqual({ kind: "none" });
    expect(webhookTarget("paymentMethod/updated", fixture("webhook-subscription-paused.json"))).toEqual({ kind: "none" });
    expect(webhookTarget("order/processed", { payload: { id: 1 } })).toEqual({ kind: "none" });
  });
  it("the registration script subscribes exactly the topics the app handles", () => {
    const script = readFileSync(new URL("../scripts/register-loop-webhooks.mjs", import.meta.url), "utf8");
    const block = script.slice(script.indexOf("export const TOPICS = ["), script.indexOf("];", script.indexOf("export const TOPICS = [")));
    const topics = [...block.matchAll(/"([a-zA-Z]+\/[a-zA-Z]+)"/g)].map((m) => m[1]);
    expect(topics.sort()).toEqual([...LOOP_TOPICS].sort());
  });
});

describe("Loop subscription -> member row", () => {
  const derive = (sub: LoopSubscription, orders: LoopOrder[] = history([freeFirst])) => {
    const r = deriveMember(sub, orders);
    if (!r.ok) throw new Error(r.reason);
    return r.member;
  };

  it("new subscription in its free month: trial, ending 30 days after purchase, nothing paid", () => {
    const m = derive(apiSub());
    expect(m).toMatchObject({ email: "jane@example.com", status: "trial", trial_ends_at: "2026-12-01T10:00:00.000Z", paid_through: null });
    expect(m.contract_id).toBe(String(fixture("api-subscription.json").data.id));
    expect(m.shopify_customer_id).toBe(String(fixture("api-subscription.json").data.customer.shopifyId));
  });

  it("after the first $19.95 renewal: active, paid through 30 days after it", () => {
    expect(derive(apiSub(), history([freeFirst, renewal]))).toMatchObject({ status: "active", paid_through: "2026-12-31T10:00:00.000Z" });
  });

  it("ignores failed and unpaid orders when finding the last renewal", () => {
    const failed = { status: "FAILED", billingDate: "2027-01-01T10:00:00.000Z", totalPriceUsd: "19.95" };
    expect(lastRenewalDate(history([freeFirst, renewal, failed]), "2026-11-01T10:00:00.000Z")).toBe("2026-12-01T10:00:00.000Z");
    expect(lastRenewalDate(history([freeFirst]), "2026-11-01T10:00:00.000Z")).toBeNull();
    expect(lastRenewalDate([], "2026-11-01T10:00:00.000Z")).toBeNull();
  });

  it("last payment failed: past_due, locked out", () => {
    const m = derive(apiSub({ lastPaymentStatus: "FAILED" }), history([freeFirst, renewal]));
    expect(m.status).toBe("past_due");
    expect(membershipAllows(m, new Date("2026-12-15T00:00:00Z"))).toEqual({ allowed: false, reason: "past_due" });
    expect(derive(apiSub({ isBillingRetryOn: true })).status).toBe("past_due");
  });

  it("cancelled in the free month: keeps access to the trial end, then locked", () => {
    const m = derive(apiSub({ status: "CANCELLED", nextBillingDateEpoch: null, cancelledAt: "2026-11-05T00:00:00Z" }));
    expect(m).toMatchObject({ status: "cancelled", paid_through: null, trial_ends_at: "2026-12-01T10:00:00.000Z" });
    expect(membershipAllows(m, new Date("2026-11-30T00:00:00Z")).allowed).toBe(true);
    expect(membershipAllows(m, new Date("2026-12-02T00:00:00Z"))).toEqual({ allowed: false, reason: "ended" });
  });

  it("cancelled after paying: keeps access to the paid-through date, then locked", () => {
    const m = derive(apiSub({ status: "CANCELLED", nextBillingDateEpoch: null }), history([freeFirst, renewal]));
    expect(m).toMatchObject({ status: "cancelled", paid_through: "2026-12-31T10:00:00.000Z" });
    expect(membershipAllows(m, new Date("2026-12-30T00:00:00Z")).allowed).toBe(true);
    expect(membershipAllows(m, new Date("2027-01-01T00:00:00Z")).allowed).toBe(false);
  });

  it("marked for cancellation at period end: cancelled now, access to the end of what she has", () => {
    const m = derive(apiSub({ isMarkedForCancellation: true }), history([freeFirst, renewal]));
    expect(m.status).toBe("cancelled");
    expect(membershipAllows(m, new Date("2026-12-20T00:00:00Z")).allowed).toBe(true);
  });

  it("paused: treated as cancelled (keeps what was paid for, then locked until resumed)", () => {
    const m = derive(apiSub({ status: "PAUSED" }), history([freeFirst, renewal]));
    expect(m.status).toBe("cancelled");
    expect(membershipAllows(m, new Date("2026-12-20T00:00:00Z")).allowed).toBe(true);
    expect(membershipAllows(m, new Date("2027-02-01T00:00:00Z")).allowed).toBe(false);
  });

  it("resumed or reactivated: back to active (or trial if never renewed)", () => {
    expect(derive(apiSub({ status: "ACTIVE" }), history([freeFirst, renewal])).status).toBe("active");
    expect(derive(apiSub({ status: "ACTIVE" })).status).toBe("trial");
  });

  it("expired: ended, locked out even with dates in the future", () => {
    const m = derive(apiSub({ status: "EXPIRED" }), history([freeFirst, renewal]));
    expect(m.status).toBe("ended");
    expect(membershipAllows(m, new Date("2026-12-02T00:00:00Z"))).toEqual({ allowed: false, reason: "ended" });
  });

  it("refuses a subscription with no email or an unknown status", () => {
    expect(deriveMember(apiSub({ customer: { shopifyId: 1, email: null } }), [])).toEqual({ ok: false, reason: "no_customer_email" });
    expect(deriveMember(apiSub({ status: "WEIRD" }), [])).toEqual({ ok: false, reason: "unknown_status_WEIRD" });
  });

  it("is deterministic: the same Loop state always gives the same row", () => {
    expect(derive(apiSub(), history([freeFirst, renewal]))).toEqual(derive(apiSub(), history([renewal, freeFirst])));
  });

  it("adds billing intervals in days, weeks, months and years", () => {
    expect(addInterval("2026-01-31T00:00:00.000Z", { interval: "DAY", intervalCount: 30 })).toBe("2026-03-02T00:00:00.000Z");
    expect(addInterval("2026-01-01T00:00:00.000Z", { interval: "WEEK", intervalCount: 2 })).toBe("2026-01-15T00:00:00.000Z");
    expect(addInterval("2026-01-15T00:00:00.000Z", { interval: "MONTH", intervalCount: 1 })).toBe("2026-02-15T00:00:00.000Z");
    expect(addInterval("2026-01-15T00:00:00.000Z", { interval: "YEAR", intervalCount: 1 })).toBe("2027-01-15T00:00:00.000Z");
    expect(addInterval("2026-01-01T00:00:00.000Z", null)).toBe("2026-01-31T00:00:00.000Z");
  });

  it("ranks access so a live contract beats a dead one on the same email", () => {
    const now = new Date("2026-12-10T00:00:00Z");
    const t = "2026-12-20T00:00:00Z";
    expect(accessRank({ status: "active", paid_through: null, trial_ends_at: null }, now)).toBe(3);
    expect(accessRank({ status: "cancelled", paid_through: t, trial_ends_at: null }, now)).toBe(2);
    expect(accessRank({ status: "past_due", paid_through: t, trial_ends_at: null }, now)).toBe(1);
    expect(accessRank({ status: "cancelled", paid_through: "2026-12-01T00:00:00Z", trial_ends_at: null }, now)).toBe(0);
    expect(accessRank({ status: "ended", paid_through: t, trial_ends_at: t }, now)).toBe(0);
  });
});
