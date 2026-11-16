import { describe, expect, it } from "vitest";
import { BACKLOG_FOUNTAINS, cardView, fountainsIn, totalClaimed } from "../src/lib/batch-counter";

const F = "gid://shopify/ProductVariant/40969640312896";
const F2 = "gid://shopify/ProductVariant/41283222077504";
const OTHER = "gid://shopify/ProductVariant/1";

describe("batch counter", () => {
  it("counts only fountains in real orders, after removals", () => {
    const n = fountainsIn([
      { cancelledAt: null, test: false, lineItems: [{ variantId: F, currentQuantity: 2 }, { variantId: OTHER, currentQuantity: 5 }] },
      { cancelledAt: null, test: false, lineItems: [{ variantId: F2, currentQuantity: 1 }, { variantId: F, currentQuantity: 0 }] },
      { cancelledAt: "2026-11-15T00:00:00Z", test: false, lineItems: [{ variantId: F, currentQuantity: 3 }] },
      { cancelledAt: null, test: true, lineItems: [{ variantId: F, currentQuantity: 4 }] },
      { cancelledAt: null, test: false, lineItems: [{ variantId: null, currentQuantity: 9 }] },
    ]);
    expect(n).toBe(3);
    expect(totalClaimed(n)).toBe(BACKLOG_FOUNTAINS + 3);
  });

  // Properties: never above 95%, never below 1%, never goes down as sales go up within a batch,
  // and rolls to batch 2 exactly when batch 1 sells through.
  it("shows the filling batch, between 1% and 95%, and rolls over at 5,000", () => {
    let last = { batch: 1, pct: 0 };
    for (let u = 0; u <= 12000; u += 37) {
      const v = cardView(u);
      expect(v.pct).toBeGreaterThanOrEqual(1);
      expect(v.pct).toBeLessThanOrEqual(95);
      expect(v.batch).toBe(u < 5000 ? 1 : 2);
      if (v.batch === last.batch) expect(v.pct).toBeGreaterThanOrEqual(last.pct);
      last = v;
    }
    expect(cardView(947)).toEqual({ batch: 1, pct: 18 });
    expect(cardView(4999).pct).toBe(95);
    expect(cardView(5000)).toEqual({ batch: 2, pct: 1 });
    expect(cardView(20000)).toEqual({ batch: 2, pct: 95 });
  });
});
