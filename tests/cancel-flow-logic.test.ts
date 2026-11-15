// The in-app cancel flow's pure rules (boards 22.1–23.1).
import { describe, expect, it } from "vitest";
import { halfPriceCents, isPassedAway, money, parseOffers, plainText, sortReasons, stepAfterReason } from "../src/lib/cancel-flow";

describe("reasons", () => {
  it("keeps Loop's order and drops blanks or bad ids", () => {
    const r = sortReasons([
      { id: 3, reason: "Something else", position: 6 },
      { id: 1, reason: "It's too expensive", position: 1 },
      { id: "x", reason: "bad id", position: 2 },
      { id: 4, reason: "  ", position: 3 },
    ]);
    expect(r.map((x) => x.id)).toEqual([1, 3]);
    expect(sortReasons(null)).toEqual([]);
  });

  it("recognises the reason for a cat that has died, and nothing else", () => {
    for (const s of ["My cat has passed away", "my cat died", "She's no longer with us"]) expect(isPassedAway(s)).toBe(true);
    for (const s of ["It's too expensive", "I'm not using it enough", "Something isn't working", "", null]) expect(isPassedAway(s)).toBe(false);
  });
});

describe("offers", () => {
  it("reads Loop's offer list as plain text, with sensible button text when Loop leaves it blank", () => {
    const o = parseOffers([
      { id: "abc", title: "Keep it for half price", offerDescription: "Keep it at half price, for as long as you stay.", message: "<p>Every renewal is 50% off,<br>for as long as you stay.</p>", keepSubscriptionCTAText: "", cancelSubscriptionCTAText: "No thanks, cancel" },
      { id: "", title: "no id" },
      null,
    ]);
    expect(o).toHaveLength(1);
    expect(o[0].message).toBe("Every renewal is 50% off, for as long as you stay.");
    expect(o[0].keepText).toBe("Keep it at half price");
    expect(o[0].cancelText).toBe("No thanks, cancel");
    expect(plainText("Tom &amp; Jerry&#39;s")).toBe("Tom & Jerry's");
  });

  it("never offers a discount when her cat has died, even if Loop returned one", () => {
    const offer = parseOffers([{ id: "abc", title: "x" }]);
    expect(stepAfterReason({ id: 5, reason: "My cat has passed away", position: 5 }, offer)).toBe("passed");
    expect(stepAfterReason({ id: 1, reason: "It's too expensive", position: 1 }, offer)).toBe("offer");
    expect(stepAfterReason({ id: 1, reason: "It's too expensive", position: 1 }, [])).toBe("confirm");
  });
});

describe("half price", () => {
  it("halves the price with the discount rounded to the cent, and never charges more than half", () => {
    for (const cents of [1995, 2000, 999, 1]) {
      const half = halfPriceCents(cents);
      expect(half * 2).toBeLessThanOrEqual(cents + 1);
      expect(half * 2).toBeGreaterThanOrEqual(cents - 1);
    }
    // Loop's real discounted price on the live test subscription (15 Nov): $9.98.
    expect(money(halfPriceCents(1995))).toBe("$9.98");
  });
});
