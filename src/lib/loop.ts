// Loop Subscriptions -> membership: the pure half (signature check, "is this ours?",
// and how a Loop subscription becomes a members row). No I/O, so it is unit-tested.
import { createHmac, timingSafeEqual } from "node:crypto";
import { membershipAllows, normaliseEmail, type MemberStatus } from "@/lib/membership";

// The AquaOne Health membership in Shopify and Loop (aquaone-health/CONTEXT.md).
export const AQUAONE = {
  productId: "7323287093312",
  variantId: "41499429535808",
  sellingPlanId: "1050804288",
  sku: "AOH-MEMBER",
} as const;

// Every topic the app subscribes to. Each one only tells us "this subscription changed":
// the handler re-reads the subscription from the Loop API and derives the row from that.
export const LOOP_TOPICS = [
  "subscription/created",
  "subscription/updated",
  "subscription/cancelled",
  "subscription/markedForCancellation",
  "subscription/paused",
  "subscription/resumed",
  "subscription/reactivated",
  "subscription/expired",
  "subscription/rescheduled",
  "subscription/delayed",
  "order/processed",
  "order/paymentFailed",
] as const;

// Loop signs the raw body with every active secret: header "v1=<hex>[,v1=<hex>...]".
// Authentic when any v1 token matches any of our secrets (constant-time compare).
export function verifyLoopSignature(rawBody: string, header: string | null, secrets: string[]): boolean {
  if (!header) return false;
  const received = header.split(",").map((s) => s.trim()).filter((s) => s.startsWith("v1="));
  for (const secret of secrets.filter(Boolean)) {
    const expected = Buffer.from("v1=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"));
    for (const token of received) {
      const got = Buffer.from(token);
      if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
    }
  }
  return false;
}

// LOOP_WEBHOOK_SECRET may hold several secrets, comma-separated, during a key rotation.
export const webhookSecrets = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

type LineLike = {
  productShopifyId?: unknown;
  variantShopifyId?: unknown;
  sellingPlanShopifyId?: unknown;
  sku?: unknown;
};

export const isAquaOneLine = (l: LineLike) =>
  String(l.productShopifyId ?? "") === AQUAONE.productId ||
  String(l.variantShopifyId ?? "") === AQUAONE.variantId ||
  String(l.sellingPlanShopifyId ?? "") === AQUAONE.sellingPlanId ||
  l.sku === AQUAONE.sku;

export const hasAquaOneLine = (lines: unknown) => Array.isArray(lines) && lines.some((l) => l && isAquaOneLine(l as LineLike));

// What a webhook body tells us before we call the API: which subscription, and whether
// its lines are visible and not ours (then it is another product's subscription: ignore it).
export type WebhookTarget =
  | { kind: "subscription"; subscriptionId: string; linesSeen: boolean; ours: boolean }
  | { kind: "none" };

export function webhookTarget(topic: string, body: unknown): WebhookTarget {
  const payload = (body as { payload?: Record<string, unknown> } | null)?.payload;
  if (!payload || typeof payload !== "object") return { kind: "none" };
  if (topic.startsWith("subscription/")) {
    if (payload.id == null) return { kind: "none" };
    const linesSeen = Array.isArray(payload.lineItems);
    return { kind: "subscription", subscriptionId: String(payload.id), linesSeen, ours: hasAquaOneLine(payload.lineItems) };
  }
  if (topic.startsWith("order/")) {
    const sub = payload.subscription as Record<string, unknown> | undefined;
    if (!sub || sub.id == null) return { kind: "none" };
    const linesSeen = Array.isArray(payload.lineItems) || Array.isArray(sub.lineItems);
    const ours = hasAquaOneLine(payload.lineItems) || hasAquaOneLine(sub.lineItems);
    return { kind: "subscription", subscriptionId: String(sub.id), linesSeen, ours };
  }
  return { kind: "none" };
}

// The subset of GET /subscription/{id} (and the list endpoint) that membership needs.
export type LoopSubscription = {
  id: number | string;
  shopifyId?: number | string | null;
  status: string;
  createdAt: string;
  cancelledAt?: string | null;
  isMarkedForCancellation?: boolean | null;
  nextBillingDateEpoch?: number | null;
  originOrderShopifyId?: number | string | null;
  completedOrdersCount?: number | null;
  lastPaymentStatus?: string | null;
  isBillingRetryOn?: boolean | null;
  billingPolicy?: { interval?: string | null; intervalCount?: number | null } | null;
  lines?: LineLike[] | null;
  customer?: { shopifyId?: number | string | null; email?: string | null } | null;
};

// The subset of GET /subscription/{id}/order/history entries that membership needs.
export type LoopOrder = { shopifyId?: number | string | null; status?: string | null; billingDate?: string | null; totalPriceUsd?: string | number | null };

export type DerivedMember = {
  email: string;
  shopify_customer_id: string | null;
  contract_id: string; // the Loop subscription id (what the Loop API reads by)
  status: MemberStatus;
  trial_ends_at: string;
  paid_through: string | null;
};

const DAY = 86_400_000;
export function addInterval(fromIso: string, policy: LoopSubscription["billingPolicy"]): string {
  const count = policy?.intervalCount && policy.intervalCount > 0 ? policy.intervalCount : 30;
  const unit = (policy?.interval ?? "DAY").toUpperCase();
  const d = new Date(fromIso);
  if (unit === "WEEK") return new Date(d.getTime() + count * 7 * DAY).toISOString();
  if (unit === "MONTH") { d.setUTCMonth(d.getUTCMonth() + count); return d.toISOString(); }
  if (unit === "YEAR") { d.setUTCFullYear(d.getUTCFullYear() + count); return d.toISOString(); }
  return new Date(d.getTime() + count * DAY).toISOString();
}

// A renewal is a processed order billed a day or more after the subscription began, and never the
// checkout order itself. The order total can't tell them apart: when the membership is bought in the
// same checkout as the fountain, the first order costs money (the fountain and shipping) even though
// the membership line in it is free (audit, 15 Nov).
const PROCESSED = new Set(["PROCESSED", "SUCCESS"]);
export function lastRenewalDate(orders: LoopOrder[], createdAt: string, originOrderId?: number | string | null): string | null {
  const start = new Date(createdAt).getTime();
  const origin = originOrderId != null ? String(originOrderId) : null;
  const renewals = orders
    .filter((o) => PROCESSED.has(String(o.status ?? "").toUpperCase()) && o.billingDate)
    .filter((o) => !origin || String(o.shopifyId ?? "") !== origin)
    .map((o) => new Date(o.billingDate as string).getTime())
    .filter((t) => Number.isFinite(t) && t >= start + DAY);
  return renewals.length ? new Date(Math.max(...renewals)).toISOString() : null;
}

export type DeriveResult = { ok: true; member: DerivedMember } | { ok: false; reason: string };

// Loop's current state -> the members row. Derived only from the subscription as Loop
// holds it now (never from which event arrived), so a repeat or late event writes the same row.
//   EXPIRED                          -> ended
//   CANCELLED                        -> cancelled (access until the later of paid_through and trial end)
//   PAUSED                           -> cancelled (same: keeps what was paid for, then locked until resumed)
//   ACTIVE, last payment failed      -> past_due
//   ACTIVE, marked for cancellation  -> cancelled (access runs to the end of what was paid for)
//   ACTIVE, a renewal on record      -> active
//   ACTIVE, no renewal yet           -> trial
// trial_ends_at = Loop's next charge date while still free (else created + one interval).
// paid_through  = last renewal's billing date + one interval (null while still free).
export function deriveMember(sub: LoopSubscription, orders: LoopOrder[]): DeriveResult {
  const email = sub.customer?.email ? normaliseEmail(sub.customer.email) : "";
  if (!email.includes("@")) return { ok: false, reason: "no_customer_email" };
  if (!sub.createdAt || Number.isNaN(new Date(sub.createdAt).getTime())) return { ok: false, reason: "no_created_at" };

  const lastPaid = lastRenewalDate(orders, sub.createdAt, sub.originOrderShopifyId);
  // While still free, the trial ends when Loop will actually charge (a rescheduled first charge
  // moves it); otherwise created + one interval.
  const nextCharge = sub.nextBillingDateEpoch && sub.nextBillingDateEpoch > 0 ? new Date(sub.nextBillingDateEpoch * 1000) : null;
  const trialEndsAt = !lastPaid && nextCharge && nextCharge.getTime() > new Date(sub.createdAt).getTime() ? nextCharge.toISOString() : addInterval(sub.createdAt, sub.billingPolicy);
  const paidThrough = lastPaid ? addInterval(lastPaid, sub.billingPolicy) : null;

  let status: MemberStatus;
  switch (String(sub.status).toUpperCase()) {
    case "EXPIRED":
      status = "ended";
      break;
    case "CANCELLED":
    case "PAUSED":
      status = "cancelled";
      break;
    case "ACTIVE":
      if (String(sub.lastPaymentStatus ?? "").toUpperCase() === "FAILED" || sub.isBillingRetryOn === true) status = "past_due";
      else if (sub.isMarkedForCancellation) status = "cancelled";
      else status = lastPaid ? "active" : "trial";
      break;
    default:
      return { ok: false, reason: `unknown_status_${sub.status}` };
  }

  return {
    ok: true,
    member: {
      email,
      shopify_customer_id: sub.customer?.shopifyId != null ? String(sub.customer.shopifyId) : null,
      contract_id: String(sub.id),
      status,
      trial_ends_at: trialEndsAt,
      paid_through: paidThrough,
    },
  };
}

// How much a row grants, for choosing between two contracts on one email:
// 3 trial/active, 2 cancelled but still inside what was paid for, 1 past due, 0 no access.
export function accessRank(row: { status: MemberStatus; paid_through: string | null; trial_ends_at: string | null }, now = new Date()): number {
  if (row.status === "trial" || row.status === "active") return 3;
  if (row.status === "cancelled" && membershipAllows(row, now).allowed) return 2;
  if (row.status === "past_due") return 1;
  return 0;
}
