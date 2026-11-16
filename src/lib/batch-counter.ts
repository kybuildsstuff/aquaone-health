// The Black Friday stock card's "% of this batch claimed" (Ky, 16 Nov): a real count of fountains
// sold, read by the BFCM theme from a product metafield. The card shows the batch that is filling,
// capped at 95%, and rolls to the next batch when one genuinely sells through (snippets/bf-batch-card).
//
// Batches are Victoria's, in #mgmt-chat on 14 Nov: B04 + B05 (5,000, landing by 19 Nov) and
// B06 (5,000, landing 1 Dec). At her snapshot (14 Nov 07:01 UTC) Ningbo had 0 sellable fountains and
// 308 orders waiting; at 1.28 fountains an order that is 394 fountains already claimed from batch 1.

export const COUNT_FROM = "2026-11-14T07:01:19Z"; // Victoria's stock snapshot
export const BACKLOG_FOUNTAINS = 394; // 308 waiting orders x 1.28 fountains an order
export const BATCH_SIZES = [5000, 5000] as const; // B04+B05, then B06
export const ALERT_AT = 9500; // 95% of the last listed batch: time to add the next PO

// The fountain variants: the main product (PS-AQ1) and the unlisted "AquaOne" product used by the sale lander.
export const FOUNTAIN_VARIANTS = new Set(["gid://shopify/ProductVariant/40969640312896", "gid://shopify/ProductVariant/41283222077504"]);
export const COUNTER_PRODUCT = "gid://shopify/Product/7221708357696"; // where the total is stored (bfcm.batch_units)

export type CountedOrder = {
  cancelledAt: string | null;
  test: boolean;
  lineItems: { variantId: string | null; currentQuantity: number }[];
};

// Fountains in real orders: cancelled and test orders don't count; removed or refunded units don't
// count (currentQuantity is the quantity after edits and removals).
export function fountainsIn(orders: CountedOrder[]): number {
  let n = 0;
  for (const o of orders) {
    if (o.cancelledAt || o.test) continue;
    for (const li of o.lineItems) if (li.variantId && FOUNTAIN_VARIANTS.has(li.variantId)) n += Math.max(0, li.currentQuantity);
  }
  return n;
}

export const totalClaimed = (soldSince: number) => BACKLOG_FOUNTAINS + soldSince;

// What the card shows for a total (mirrors the Liquid in snippets/bf-batch-card.liquid).
export function cardView(units: number): { batch: number; pct: number } {
  let rest = Math.max(0, units);
  for (let i = 0; i < BATCH_SIZES.length; i++) {
    const size = BATCH_SIZES[i];
    if (rest < size || i === BATCH_SIZES.length - 1) {
      const pct = Math.min(95, Math.max(1, Math.floor((rest * 100) / size)));
      return { batch: i + 1, pct };
    }
    rest -= size;
  }
  return { batch: BATCH_SIZES.length, pct: 95 };
}
