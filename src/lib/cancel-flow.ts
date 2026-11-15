// In-app cancel flow (Paper boards 22.1–23.1, Ky 15 Nov). Pure helpers, unit-tested.
// The reasons and the offer live in Loop's cancel flow (General profile); the app only shows them.

export type CancelReason = { id: number; reason: string; position: number };
export type CancelOffer = {
  id: string;
  title: string;
  description: string;
  message: string;
  keepText: string;
  cancelText: string;
};

// Loop returns reasons with a position; show them in that order, without blanks.
export function sortReasons(raw: unknown): CancelReason[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ id: Number(r?.id), reason: String(r?.reason ?? "").trim(), position: Number(r?.position ?? 0) }))
    .filter((r) => Number.isFinite(r.id) && r.reason.length > 0)
    .sort((a, b) => a.position - b.position);
}

// The reason a member gives when her cat has died. No offer is shown for it (Ky, 15 Nov).
export function isPassedAway(reason: string | null | undefined): boolean {
  return /passed away|died|death|no longer with us/i.test(reason ?? "");
}

// Offer text comes from Loop's rich-text editor; the app shows it as plain text.
export function plainText(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOffers(raw: unknown): CancelOffer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o.id === "string" && o.id.length > 0)
    .map((o) => ({
      id: o.id as string,
      title: plainText(o.title),
      description: plainText(o.offerDescription),
      message: plainText(o.message),
      keepText: plainText(o.keepSubscriptionCTAText) || "Keep it at half price",
      cancelText: plainText(o.cancelSubscriptionCTAText) || "No thanks, cancel",
    }));
}

// Half price of the membership, in cents, the way Loop applies the 50% offer: the discount is rounded
// down to the cent, so $19.95 becomes $9.98 (read from Loop on the live test subscription, 15 Nov:
// discountedPrice 9.98).
export function halfPriceCents(priceCents: number): number {
  const off = Math.floor(priceCents * 0.5);
  return priceCents - off;
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// What the flow can do next, decided on the server from what Loop returned.
export type Step = "before" | "reason" | "offer" | "confirm" | "passed" | "kept" | "cancelled";

export function stepAfterReason(reason: CancelReason, offers: CancelOffer[]): Step {
  if (isPassedAway(reason.reason)) return "passed";
  return offers.length > 0 ? "offer" : "confirm";
}
