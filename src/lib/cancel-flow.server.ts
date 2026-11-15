import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { normaliseEmail } from "@/lib/membership";
import { LOOP_API, syncSubscription } from "@/lib/loop.server";
import { parseOffers, sortReasons, type CancelOffer, type CancelReason } from "@/lib/cancel-flow";

// The in-app cancel flow's I/O: Loop's own cancel steps through its storefront API, acting for the
// signed-in member. The admin token (LOOP_API_KEY, read and write since 15 Nov) creates a session for
// her Shopify customer; that is exchanged for a storefront access token. Every step is then logged in
// Loop's retention analytics exactly as if she had used Loop's portal.
export const LOOP_STOREFRONT = "https://api.loopsubscriptions.com/storefront/2026-04";

export class CancelFlowError extends Error {
  constructor(public code: "no_subscription" | "loop_auth" | "loop_error", message: string, public status = 502) {
    super(message);
  }
}

type LoopBody<T> = { success?: boolean; message?: string; data?: T } | null;

async function readBody<T>(res: Response): Promise<LoopBody<T>> {
  return (await res.json().catch(() => null)) as LoopBody<T>;
}

// The member's Loop subscription and Shopify customer, read with the service role.
export async function memberLoopIds(email: string): Promise<{ subscriptionId: string; customerId: string }> {
  const { data, error } = await supabaseAdmin()
    .from("members")
    .select("contract_id, shopify_customer_id")
    .eq("email", normaliseEmail(email))
    .maybeSingle();
  if (error) throw new Error(`members lookup failed: ${error.message}`);
  if (!data?.contract_id || !data?.shopify_customer_id || data.shopify_customer_id === "TEST") {
    throw new CancelFlowError("no_subscription", "member has no Loop subscription", 409);
  }
  return { subscriptionId: String(data.contract_id), customerId: String(data.shopify_customer_id) };
}

// Admin session token -> storefront access token for this customer.
export async function storefrontToken(customerId: string): Promise<string> {
  const s = await fetch(`${LOOP_API}/customer/${encodeURIComponent(customerId)}/sessionToken`, {
    method: "POST",
    headers: { "X-Loop-Token": env("LOOP_API_KEY") },
    cache: "no-store",
  });
  const sBody = await readBody<{ sessionToken?: string }>(s);
  const sessionToken = sBody?.data?.sessionToken;
  if (!s.ok || !sessionToken) throw new CancelFlowError("loop_auth", `loop sessionToken ${s.status} ${sBody?.message ?? ""}`.trim());

  const a = await fetch(`${LOOP_STOREFRONT}/auth/refreshToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken }),
    cache: "no-store",
  });
  const aBody = await readBody<{ accessToken?: string }>(a);
  const accessToken = aBody?.data?.accessToken;
  if (!a.ok || !accessToken) throw new CancelFlowError("loop_auth", `loop refreshToken ${a.status} ${aBody?.message ?? ""}`.trim());
  return accessToken;
}

// Storefront calls send the access token as a bearer token; if Loop answers 401 to that, the bare
// token is tried once (Loop's reference says "bearer format" without showing the header; proved on
// the test subscription).
async function sf<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const call = (auth: string) =>
    fetch(LOOP_STOREFRONT + path, {
      method: init.method ?? "GET",
      headers: { Authorization: auth, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  let res = await call(`Bearer ${token}`);
  if (res.status === 401) res = await call(token);
  const body = await readBody<T>(res);
  if (!res.ok || !body || body.success === false) {
    throw new CancelFlowError("loop_error", `loop ${init.method ?? "GET"} ${path.split("?")[0]} ${res.status} ${body?.message ?? ""}`.trim());
  }
  return body.data as T;
}

export async function loopReasons(token: string, subscriptionId: string): Promise<CancelReason[]> {
  return sortReasons(await sf<unknown>(token, `/subscription/${subscriptionId}/cancellationFlow`));
}

export async function loopOffers(token: string, subscriptionId: string, reasonId: number): Promise<CancelOffer[]> {
  return parseOffers(await sf<unknown>(token, `/subscription/${subscriptionId}/cancellationOffers/?cancellationFlowId=${reasonId}`));
}

export async function loopApplyOffer(token: string, subscriptionId: string, reasonId: number, offerId: string): Promise<void> {
  await sf(token, `/subscription/${subscriptionId}/cancellationOffer`, {
    method: "POST",
    body: { cancellationFlowId: reasonId, cancellationOfferId: offerId },
  });
}

export async function loopCancel(token: string, subscriptionId: string, reasonId: number, comment?: string): Promise<void> {
  await sf(token, `/subscription/${subscriptionId}/cancel`, {
    method: "POST",
    body: { cancellationFlowId: reasonId, ...(comment ? { comment } : {}) },
  });
}

// After Loop changes, re-read the subscription so the members row (and her Account screen) is
// right at once rather than at the next webhook. A failure here is logged, never shown: the webhook
// and the nightly reconcile correct it.
export async function resyncAfterChange(subscriptionId: string) {
  try {
    const r = await syncSubscription(subscriptionId);
    if (!r.ok) console.error("cancel_flow_resync_failed", subscriptionId, r.reason);
  } catch (e) {
    console.error("cancel_flow_resync_failed", subscriptionId, e instanceof Error ? e.message : String(e));
  }
}
