// The in-app cancel flow through its real route handler, with Supabase and Loop stubbed:
// the session token -> access token chain, the reasons, the offer, accepting it, cancelling,
// and the guards (unknown reason, an offer for "My cat has passed away", members who can't cancel).
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.LOOP_API_KEY = "test-key-not-real";

let member: { status: string; paid_through: string | null; trial_ends_at: string | null } | null;
let ids: { contract_id: string | null; shopify_customer_id: string | null } | null;
const resynced: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: member === undefined ? null : { id: "u1", email: "jane@test.invalid" } } }) } }),
}));
vi.mock("@/lib/members.server", () => ({ findMember: async () => member }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ids, error: null }) }) }) }) }),
}));
vi.mock("@/lib/loop.server", () => ({
  LOOP_API: "https://api.loopsubscriptions.com/admin/2026-04",
  syncSubscription: async (id: string) => {
    resynced.push(id);
    return { ok: true, outcome: "updated" };
  },
}));

const REASONS = [
  { id: 11, reason: "It's too expensive", position: 1 },
  { id: 15, reason: "My cat has passed away", position: 5 },
  { id: 16, reason: "Something else", position: 6 },
];
const OFFER = { id: "off-50", title: "Keep it for half price", offerDescription: "Keep it at half price, for as long as you stay.", message: "Every renewal is 50% off.", keepSubscriptionCTAText: "Keep it at half price", cancelSubscriptionCTAText: "No thanks, cancel" };
const calls: { method: string; path: string; auth: string | null; body: unknown }[] = [];
let bearerAccepted = true;

vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const headers = new Headers(init?.headers);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  calls.push({ method, path: url.pathname + url.search, auth: headers.get("authorization"), body });
  if (url.pathname === "/admin/2026-04/customer/7001/sessionToken") {
    if (headers.get("x-loop-token") !== "test-key-not-real") return json(401, { success: false });
    return json(200, { success: true, data: { sessionToken: "sess-1" } });
  }
  if (url.pathname === "/storefront/2026-04/auth/refreshToken") {
    return body?.sessionToken === "sess-1" ? json(200, { success: true, data: { accessToken: "acc-1", refreshToken: "r" } }) : json(400, { success: false });
  }
  const auth = headers.get("authorization");
  const ok = bearerAccepted ? auth === "Bearer acc-1" : auth === "acc-1";
  if (!ok) return json(401, { success: false, message: "unauthorised" });
  if (url.pathname === "/storefront/2026-04/subscription/555/cancellationFlow") return json(200, { success: true, data: REASONS });
  if (url.pathname === "/storefront/2026-04/subscription/555/cancellationOffers/") return json(200, { success: true, data: [OFFER] });
  if (url.pathname === "/storefront/2026-04/subscription/555/cancellationOffer" && method === "POST") return json(200, { success: true, data: null });
  if (url.pathname === "/storefront/2026-04/subscription/555/cancel" && method === "POST") return json(200, { success: true, data: { id: 555, status: "CANCELLED" } });
  return json(404, { success: false, message: "no route" });
});

const { POST } = await import("../src/app/api/membership/cancel/route");
const post = (payload: unknown) => POST(new Request("http://x/api/membership/cancel", { method: "POST", body: JSON.stringify(payload) }));

beforeEach(() => {
  member = { status: "trial", paid_through: null, trial_ends_at: new Date(Date.now() + 20 * 86_400_000).toISOString() };
  ids = { contract_id: "555", shopify_customer_id: "7001" };
  calls.length = 0;
  resynced.length = 0;
  bearerAccepted = true;
});

describe("cancel flow route", () => {
  it("lists Loop's reasons for her subscription, through the session-token chain", async () => {
    const res = await post({ action: "reasons" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reasons.map((r: { id: number }) => r.id)).toEqual([11, 15, 16]);
    expect(calls[0].path).toBe("/admin/2026-04/customer/7001/sessionToken");
    expect(calls[1].path).toBe("/storefront/2026-04/auth/refreshToken");
  });

  it("offers half price for a normal reason, and accepting it applies Loop's offer and resyncs", async () => {
    const chosen = await (await post({ action: "choose", reasonId: 11 })).json();
    expect(chosen.step).toBe("offer");
    expect(chosen.offer.id).toBe("off-50");
    const res = await post({ action: "accept", reasonId: 11, offerId: "off-50" });
    expect((await res.json()).step).toBe("kept");
    const apply = calls.find((c) => c.path.endsWith("/cancellationOffer"));
    expect(apply?.body).toEqual({ cancellationFlowId: 11, cancellationOfferId: "off-50" });
    expect(resynced).toEqual(["555"]);
    expect(calls.some((c) => c.path.endsWith("/cancel"))).toBe(false);
  });

  it("cancels with the reason logged in Loop and resyncs her membership", async () => {
    const res = await post({ action: "cancel", reasonId: 16, comment: "moving" });
    expect((await res.json()).step).toBe("cancelled");
    expect(calls.find((c) => c.path.endsWith("/cancel"))?.body).toEqual({ cancellationFlowId: 16, comment: "moving" });
    expect(resynced).toEqual(["555"]);
  });

  it("never shows or applies an offer when her cat has died", async () => {
    const chosen = await (await post({ action: "choose", reasonId: 15 })).json();
    expect(chosen).toMatchObject({ step: "passed", offer: null });
    expect(calls.some((c) => c.path.includes("cancellationOffers"))).toBe(false);
    const res = await post({ action: "accept", reasonId: 15, offerId: "off-50" });
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.path.endsWith("/cancellationOffer"))).toBe(false);
  });

  it("refuses a reason Loop doesn't list and an offer Loop didn't make", async () => {
    expect((await post({ action: "choose", reasonId: 999 })).status).toBe(400);
    expect((await post({ action: "accept", reasonId: 11, offerId: "made-up" })).status).toBe(400);
    expect(calls.some((c) => c.path.endsWith("/cancellationOffer") || c.path.endsWith("/cancel"))).toBe(false);
  });

  it("falls back to the bare token if Loop refuses the bearer form", async () => {
    bearerAccepted = false;
    const res = await post({ action: "reasons" });
    expect(res.status).toBe(200);
  });

  it("only lets a member in her free month or paying cancel", async () => {
    for (const status of ["cancelled", "past_due", "ended"]) {
      member = { status, paid_through: new Date(Date.now() + 86_400_000).toISOString(), trial_ends_at: null };
      expect((await post({ action: "reasons" })).status).toBe(409);
    }
    member = null;
    expect((await post({ action: "reasons" })).status).toBe(409);
    expect(calls).toHaveLength(0);
  });

  it("explains a member with no Loop subscription instead of failing silently", async () => {
    ids = { contract_id: null, shopify_customer_id: "7001" };
    const res = await post({ action: "reasons" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_subscription");
  });

  it("rejects a malformed request before calling Loop", async () => {
    expect((await post({ action: "cancel" })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
