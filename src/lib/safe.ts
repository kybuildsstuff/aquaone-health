import { z } from "zod";
import { words, type Pronoun } from "@/lib/cat";

// Is it safe? (decision 6): our own list in the database. The AI only ever names the item;
// the verdict always comes from the list. Shared by server and client code.

export type Severity = "safe" | "mild" | "toxic" | "emergency";
export type SafetyCategory = "plant" | "food" | "household" | "medicine";

export type SafetyMatch = { id: string; name: string; category: SafetyCategory; severity: Severity; matched: string; score: number };

export type SafetyItem = {
  id: string;
  name: string;
  aliases: string[];
  category: SafetyCategory;
  severity: Severity;
  summary: string;
  what_to_do: string;
  source: string;
  scientific_name: string | null;
};

// A search hit at or above this is treated as "this is the item" (Enter, or a photo).
// Below it we show the unknown answer with the near misses as suggestions.
export const CONFIDENT_SCORE = 0.6;

export const isConfident = (m: SafetyMatch | undefined): m is SafetyMatch => Boolean(m && m.score >= CONFIDENT_SCORE);

// Which match to open straight away, if any. "ambiguous" means the top matches are about equally
// good but give different answers (e.g. "rubber plant": one safe, one toxic), so she must pick.
export function pickMatch(matches: SafetyMatch[]): { kind: "item"; match: SafetyMatch } | { kind: "ambiguous" } | { kind: "none" } {
  const [top, ...rest] = matches;
  if (!isConfident(top)) return { kind: "none" };
  const close = rest.filter((m) => m.score >= top.score - 0.05);
  if (close.some((m) => m.severity !== top.severity)) return { kind: "ambiguous" };
  return { kind: "item", match: top };
}

// Both lines are open 24/7 and both charge a consultation fee.
export const POISON_LINES = [
  { name: "ASPCA Animal Poison Control", phone: "(888) 426-4435", tel: "tel:+18884264435" },
  { name: "Pet Poison Helpline", phone: "(855) 764-7661", tel: "tel:+18557647661" },
] as const;
export const POISON_FEE_NOTE = "Both poison lines charge a consultation fee.";

export const SEVERITY_LABEL: Record<Severity, string> = {
  safe: "SAFE",
  mild: "CAUTION",
  toxic: "TOXIC",
  emergency: "EMERGENCY",
};

export const CATEGORY_LABEL: Record<SafetyCategory, string> = {
  plant: "Plants",
  food: "Foods",
  household: "Household",
  medicine: "Medicines",
};

export const isCategory = (s: string): s is SafetyCategory => s in CATEGORY_LABEL;

// The list's text uses {name}, {obj} and {poss}; this fills them in for her cat.
export function fillCatWords(text: string, cat: { name: string; pronoun: Pronoun | null } | null) {
  const w = words(cat?.pronoun);
  return text
    .replaceAll("{name}", cat?.name || "your cat")
    .replaceAll("{obj}", w.obj)
    .replaceAll("{poss}", w.poss);
}

// The fixed answer for anything not on our list (decision 6), in her cat's pronoun.
export function unknownMessage(pronoun: Pronoun | null | undefined) {
  const hasEaten = { he: "he's", she: "she's", they: "they've" }[pronoun ?? "they"];
  return `We don't have this one. If ${hasEaten} eaten it, call the poison line now.`;
}

export const searchSchema = z.object({ q: z.string().trim().min(1).max(120) });
export const lookupSchema = z.object({
  q: z.string().trim().min(1).max(120),
  itemId: z.string().uuid().nullable(),
});

// Photo uploads: the phone resizes before sending, so 4 MB is plenty (and under Vercel's body limit).
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];
