import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import {
  accessRank,
  deriveMember,
  hasAquaOneLine,
  type DerivedMember,
  type LoopOrder,
  type LoopSubscription,
} from "@/lib/loop";

// Loop Subscriptions -> membership: the I/O half (Loop API reads, members writes).
// Read-only against Loop. Rows with shopify_customer_id = 'TEST' are never written.
export const LOOP_API = "https://api.loopsubscriptions.com/admin/2026-04";

export class LoopApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function loopGet<T>(path: string): Promise<{ data: T; pageInfo?: { hasNextPage?: boolean; nextCursor?: string | null } | null }> {
  const res = await fetch(LOOP_API + path, { headers: { "X-Loop-Token": env("LOOP_API_KEY") }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string; pageInfo?: never } | null;
  if (!res.ok || !body || body.success === false) {
    throw new LoopApiError(res.status, `loop GET ${path.split("?")[0]} ${res.status} ${body?.message ?? ""}`.trim());
  }
  return { data: body.data as T, pageInfo: body.pageInfo };
}

export async function fetchSubscription(id: string): Promise<LoopSubscription | null> {
  try {
    return (await loopGet<LoopSubscription>(`/subscription/${encodeURIComponent(id)}`)).data;
  } catch (e) {
    if (e instanceof LoopApiError && e.status === 404) return null;
    throw e;
  }
}

// Every page of a subscription's order history (a long-time member's latest renewal can sit
// past the first page; audit, 15 Nov).
export async function fetchOrderHistory(id: string): Promise<LoopOrder[]> {
  const all: LoopOrder[] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < 50; page++) {
      // First page exactly as before (no query), so a parameter the endpoint doesn't know can't break it.
      const q: string = `/subscription/${encodeURIComponent(id)}/order/history${cursor ? `?afterCursor=${encodeURIComponent(cursor)}` : ""}`;
      const { data, pageInfo } = await loopGet<LoopOrder[]>(q);
      all.push(...(Array.isArray(data) ? data : []));
      if (!pageInfo?.hasNextPage || !pageInfo.nextCursor) return all;
      cursor = pageInfo.nextCursor;
    }
    return all;
  } catch (e) {
    if (e instanceof LoopApiError && e.status === 404) return all;
    throw e;
  }
}

// Nightly batch only: Loop's list says completedOrdersCount 0 while a member is still in her free
// month (the checkout order isn't counted), so her history needn't be read. Webhooks always read it.
const ordersForBatch = (sub: LoopSubscription) =>
  sub.completedOrdersCount === 0 ? Promise.resolve([] as LoopOrder[]) : fetchOrderHistory(String(sub.id));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs fn over items with at most `limit` in flight, keeping the input order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// Every subscription in the store (all products, all statuses). The list endpoint
// allows 2 requests per 3 seconds, so pages are spaced out.
export async function listAllSubscriptions(): Promise<LoopSubscription[]> {
  const all: LoopSubscription[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 500; page++) {
    if (page > 0) await sleep(1600);
    const q: string = `/subscription?pageSize=100${cursor ? `&afterCursor=${encodeURIComponent(cursor)}` : ""}`;
    const { data, pageInfo } = await loopGet<LoopSubscription[]>(q);
    all.push(...(Array.isArray(data) ? data : []));
    if (!pageInfo?.hasNextPage || !pageInfo.nextCursor) return all;
    cursor = pageInfo.nextCursor;
  }
  throw new Error("loop list: too many pages");
}

type Row = {
  id: string;
  email: string;
  shopify_customer_id: string | null;
  contract_id: string | null;
  status: DerivedMember["status"];
  trial_ends_at: string | null;
  paid_through: string | null;
};
const COLUMNS = "id, email, shopify_customer_id, contract_id, status, trial_ends_at, paid_through";

export type ApplyOutcome =
  | "inserted"
  | "updated"
  | "unchanged"
  | "skipped_test_row"
  | "kept_other_contract";

const sameTime = (a: string | null, b: string | null) => (a && b ? new Date(a).getTime() === new Date(b).getTime() : a === b);
const isTest = (r: Row) => r.shopify_customer_id === "TEST";

async function rowBy(column: "contract_id" | "email", value: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin().from("members").select(COLUMNS).eq(column, value).maybeSingle();
  if (error) throw new Error(`members lookup by ${column} failed: ${error.message}`);
  return data as Row | null;
}

async function update(row: Row, m: DerivedMember, withContract: boolean, email?: string): Promise<ApplyOutcome> {
  const next = {
    email: email ?? row.email,
    shopify_customer_id: m.shopify_customer_id ?? row.shopify_customer_id,
    contract_id: withContract ? m.contract_id : row.contract_id,
    status: m.status,
    trial_ends_at: m.trial_ends_at,
    paid_through: m.paid_through,
  };
  if (
    next.email === row.email &&
    next.shopify_customer_id === row.shopify_customer_id &&
    next.contract_id === row.contract_id &&
    next.status === row.status &&
    sameTime(next.trial_ends_at, row.trial_ends_at) &&
    sameTime(next.paid_through, row.paid_through)
  ) return "unchanged";
  const { error } = await supabaseAdmin()
    .from("members")
    .update(next)
    .eq("id", row.id)
    .or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST");
  if (error) throw new Error(`members update failed: ${error.message}`);
  return "updated";
}

// Writes one subscription's derived state. The row is found by its contract first (so an
// email change in Shopify doesn't fork her membership), then by email. When the email's row
// belongs to a different contract, the new one replaces it only if it grants at least as much
// access, so a second, older contract ending can't lock out a member whose newer one is live.
export async function applyMember(m: DerivedMember, now = new Date(), retry = true): Promise<ApplyOutcome> {
  const byContract = await rowBy("contract_id", m.contract_id);
  if (byContract) {
    if (isTest(byContract)) return "skipped_test_row";
    // She changed her email in Shopify: move the row to the new one so she can sign in with it,
    // unless another row already holds that email (then keep hers, and log it).
    if (byContract.email !== m.email) {
      const clash = await rowBy("email", m.email);
      if (!clash) return update(byContract, m, true, m.email);
      console.error("loop_member_email_differs", m.contract_id, "new email already has a row; kept the old one");
    }
    return update(byContract, m, true);
  }
  const byEmail = await rowBy("email", m.email);
  if (byEmail) {
    if (isTest(byEmail)) return "skipped_test_row";
    if (byEmail.contract_id && byEmail.contract_id !== m.contract_id && accessRank(m, now) < accessRank(byEmail, now)) {
      return "kept_other_contract";
    }
    return update(byEmail, m, true);
  }
  const { error } = await supabaseAdmin().from("members").insert({
    email: m.email,
    shopify_customer_id: m.shopify_customer_id,
    contract_id: m.contract_id,
    status: m.status,
    trial_ends_at: m.trial_ends_at,
    paid_through: m.paid_through,
  });
  if (error?.code === "23505" && retry) return applyMember(m, now, false); // a parallel event inserted first
  if (error) throw new Error(`members insert failed: ${error.message}`);
  return "inserted";
}

// A contract that no longer carries the AquaOne Health line (swapped or removed) ends the
// membership it was paying for.
async function endContract(contractId: string): Promise<ApplyOutcome | "no_row"> {
  const row = await rowBy("contract_id", contractId);
  if (!row) return "no_row";
  if (isTest(row)) return "skipped_test_row";
  if (row.status === "ended") return "unchanged";
  const { error } = await supabaseAdmin()
    .from("members")
    .update({ status: "ended" })
    .eq("id", row.id)
    .or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST");
  if (error) throw new Error(`members end failed: ${error.message}`);
  return "updated";
}

export type SyncResult =
  | { ok: true; outcome: ApplyOutcome | "not_aquaone" | "ended_not_aquaone"; member?: DerivedMember }
  | { ok: false; reason: string; retry: boolean };

// Re-reads one subscription from Loop and brings its members row in line with it.
export async function syncSubscription(id: string, now = new Date(), known?: LoopSubscription): Promise<SyncResult> {
  const sub = known ?? (await fetchSubscription(id));
  if (!sub) return { ok: false, reason: "subscription_not_found", retry: true };
  if (!hasAquaOneLine(sub.lines)) {
    const ended = await endContract(String(sub.id));
    return { ok: true, outcome: ended === "updated" ? "ended_not_aquaone" : "not_aquaone" };
  }
  const derived = deriveMember(sub, await fetchOrderHistory(String(sub.id)));
  if (!derived.ok) return { ok: false, reason: derived.reason, retry: false };
  return { ok: true, outcome: await applyMember(derived.member, now), member: derived.member };
}

export type ReconcileSummary = {
  subscriptions: number;
  aquaone: number;
  outcomes: Record<string, number>;
  errors: number;
};

// Nightly: re-reads every AquaOne Health subscription and corrects the members rows.
// One email with several contracts gets the one granting the most access (newest on a tie).
export async function reconcileAll(now = new Date()): Promise<ReconcileSummary> {
  const all = await listAllSubscriptions();
  const ours = all.filter((s) => hasAquaOneLine(s.lines));
  const summary: ReconcileSummary = { subscriptions: all.length, aquaone: ours.length, outcomes: {}, errors: 0 };
  const count = (k: string) => (summary.outcomes[k] = (summary.outcomes[k] ?? 0) + 1);

  const best = new Map<string, { m: DerivedMember; created: number }>();
  // Order histories are read a few at a time (and skipped for members still in their free month),
  // so the run finishes inside the function's time limit at Black Friday volume.
  const histories = await mapLimit(ours, 4, async (sub) => {
    try {
      return { sub, orders: await ordersForBatch(sub) };
    } catch (e) {
      return { sub, error: (e as Error).message };
    }
  });
  for (const h of histories) {
    const sub = h.sub;
    try {
      if ("error" in h) throw new Error(h.error);
      const d = deriveMember(sub, h.orders);
      if (!d.ok) {
        summary.errors++;
        console.error("loop_reconcile_failed", d.reason, String(sub.id));
        continue;
      }
      const created = new Date(sub.createdAt).getTime();
      const cur = best.get(d.member.email);
      const better =
        !cur ||
        accessRank(d.member, now) > accessRank(cur.m, now) ||
        (accessRank(d.member, now) === accessRank(cur.m, now) && created > cur.created);
      if (better) best.set(d.member.email, { m: d.member, created });
    } catch (e) {
      summary.errors++;
      console.error("loop_reconcile_failed order_history", String(sub.id), (e as Error).message);
    }
  }
  for (const { m } of best.values()) {
    try {
      count(await applyMember(m, now));
    } catch (e) {
      summary.errors++;
      console.error("loop_reconcile_failed write", m.contract_id, (e as Error).message);
    }
  }

  // Rows whose contract is no longer an AquaOne Health subscription in Loop.
  const ourIds = new Set(ours.map((s) => String(s.id)));
  // Read in pages: the API returns at most 1,000 rows per request.
  const rows: { contract_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin()
      .from("members")
      .select("contract_id")
      .not("contract_id", "is", null)
      .or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST")
      .order("contract_id")
      .range(from, from + 999);
    if (error) {
      summary.errors++;
      console.error("loop_reconcile_failed members_list", error.message);
      return summary;
    }
    rows.push(...((data ?? []) as { contract_id: string }[]));
    if (!data || data.length < 1000) break;
  }
  for (const r of rows) {
    const cid = String(r.contract_id);
    if (ourIds.has(cid)) continue;
    try {
      const res = await syncSubscription(cid, now);
      if (res.ok) count(res.outcome);
      else {
        summary.errors++;
        console.error("loop_reconcile_failed", res.reason, cid);
      }
    } catch (e) {
      summary.errors++;
      console.error("loop_reconcile_failed stale_row", cid, (e as Error).message);
    }
  }
  return summary;
}
