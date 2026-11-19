// The /join page for past AquaOne buyers (Paper v4, copy in the workspace's
// aquaone-health/join_page_copy.md). Every button starts the free month on Shopify:
// this link adds AquaOne Health on its Loop plan (first order 100% off, then $19.95
// every 30 days) and goes straight to checkout. Shopify cart permalinks ignore selling
// plans, so it must stay a /cart/add link. Tested end to end on 19 Nov 2026 (order #22189).
export const JOIN_CHECKOUT_URL =
  "https://trypurestream.com/cart/add?id=41499429535808&quantity=1&selling_plan=1050804288&return_to=/checkout";

export type JoinCta = { href: string; label: string; member: boolean };

// A signed-in member with access today gets "Open the app" instead of a second
// subscription (Ky, 19 Nov: decision 1a). Everyone else gets the free month.
export function joinCta(isMember: boolean): JoinCta {
  return isMember
    ? { href: "/today", label: "Open the app", member: true }
    : { href: JOIN_CHECKOUT_URL, label: "Start my free month", member: false };
}
