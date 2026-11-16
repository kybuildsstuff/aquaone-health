import "server-only";
import { env } from "@/lib/env";
import { sendViaResend } from "@/lib/email.server";
import { ALERT_AT, COUNT_FROM, COUNTER_PRODUCT, fountainsIn, totalClaimed, type CountedOrder } from "@/lib/batch-counter";

// Hourly (vercel.json): count fountains sold since Victoria's snapshot and store the total on the
// fountain product as metafield bfcm.batch_units, which the BFCM theme's stock card reads.
// Shopify access: the "PureStream batch counter" app (read_orders, write_products), installed on the
// store; its client credentials buy a 24-hour token on each run.
const SHOP = "k2tpn1-bv.myshopify.com";
const API = `https://${SHOP}/admin/api/2026-01/graphql.json`;

async function token(): Promise<string> {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env("SHOPIFY_CLIENT_ID"), client_secret: env("SHOPIFY_CLIENT_SECRET") }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!res.ok || !body?.access_token) throw new Error(`shopify token ${res.status}`);
  return body.access_token;
}

async function gql<T>(tok: string, query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API, { method: "POST", headers: { "X-Shopify-Access-Token": tok, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] } | null;
    const throttled = res.status === 429 || body?.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok || !body?.data || body.errors?.length) throw new Error(`shopify graphql ${res.status} ${body?.errors?.[0]?.message ?? ""}`.trim());
    return body.data;
  }
  throw new Error("shopify graphql throttled");
}

const ORDERS = `query($q: String!, $after: String) {
  orders(first: 100, after: $after, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { cancelledAt test lineItems(first: 30) { nodes { currentQuantity variant { id } } } }
  }
}`;

type OrdersPage = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { cancelledAt: string | null; test: boolean; lineItems: { nodes: { currentQuantity: number; variant: { id: string } | null }[] } }[] } };

export async function countSoldSince(tok: string): Promise<{ sold: number; orders: number }> {
  let after: string | null = null;
  let sold = 0;
  let orders = 0;
  do {
    const page: OrdersPage = await gql<OrdersPage>(tok, ORDERS, { q: `created_at:>=${COUNT_FROM}`, after });
    const counted: CountedOrder[] = page.orders.nodes.map((o) => ({ cancelledAt: o.cancelledAt, test: o.test, lineItems: o.lineItems.nodes.map((l) => ({ variantId: l.variant?.id ?? null, currentQuantity: l.currentQuantity })) }));
    sold += fountainsIn(counted);
    orders += counted.length;
    after = page.orders.pageInfo.hasNextPage ? page.orders.pageInfo.endCursor : null;
  } while (after);
  return { sold, orders };
}

const SET = `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { key value } userErrors { field message } } }`;

export async function runBatchCounter(): Promise<{ units: number; sold: number; orders: number; alerted: boolean }> {
  const tok = await token();
  const { sold, orders } = await countSoldSince(tok);
  const units = totalClaimed(sold);
  const r = await gql<{ metafieldsSet: { userErrors: { message: string }[] } }>(tok, SET, {
    m: [{ ownerId: COUNTER_PRODUCT, namespace: "bfcm", key: "batch_units", type: "number_integer", value: String(units) }],
  });
  if (r.metafieldsSet.userErrors.length) throw new Error(`metafieldsSet ${r.metafieldsSet.userErrors[0].message}`);

  // The last listed batch is 95% claimed: the card holds at 95% from here, so tell Ky to add the next PO.
  let alerted = false;
  if (units >= ALERT_AT) {
    const msg = {
      subject: "Stock card: the last batch is 95% claimed",
      html: `<p>The Black Friday stock card has counted ${units.toLocaleString("en-US")} fountains against the two batches (B04+B05 and B06, 10,000 in all), so it now holds at 95%.</p><p>Add the next PO to the card (src/lib/batch-counter.ts and snippets/bf-batch-card.liquid) so it can roll on to it.</p>`,
      text: `The Black Friday stock card has counted ${units} fountains against B04+B05 and B06 (10,000), so it now holds at 95%. Add the next PO to the card so it can roll on.`,
    };
    const sent = await sendViaResend("ky@theunicornhunters.io", msg, "bf-batch-alert-10000");
    alerted = sent.ok;
  }
  return { units, sold, orders, alerted };
}
