import { z } from "zod";

// Every cat in the house (Ky, 15 Nov): up to four active cats per member, one chosen at a time.
export const MAX_CATS = 4;
// The chosen cat, remembered per browser. Only ever a hint: every read still goes through RLS,
// so a forged id can only pick among her own cats.
export const CAT_COOKIE = "aoh_cat";
// Sent with every save: the cat the screen showed. The save goes to that cat or is refused, never
// to whichever cat another tab switched to since.
export const CAT_HEADER = "x-cat-id";

// The chosen cat from her cats (oldest first): the remembered one if it's still hers and active,
// otherwise her first.
export function pickCat<T extends { id: string }>(cats: T[], remembered: string | null | undefined): T | null {
  return cats.find((c) => c.id === remembered) ?? cats[0] ?? null;
}

export const catIdSchema = z.object({ catId: z.string().uuid() });

// The words for each refusal, shown as they are.
export const CAT_ERRORS: Record<string, string> = {
  cat_limit: `You can have up to ${MAX_CATS} cats. Remove one to add another.`,
  last_cat: "You need at least one cat in the app.",
  not_found: "We couldn't find that cat.",
};
