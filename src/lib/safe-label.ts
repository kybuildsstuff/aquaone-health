import type { SafetyCategory, Severity } from "@/lib/safe";

// Label Scan (Ky, 15 Nov): the model only READS the ingredient list off a label; this file
// decides which ingredients are on our list. Our code and our list decide safety, never the model.

export type LabelIndexItem = { id: string; name: string; aliases: string[]; scientific_name: string | null; severity: Severity; category: SafetyCategory; summary: string };
export type LabelFlag = { ingredient: string; id: string; name: string; severity: Severity; summary: string };
export type LabelMatch = { flagged: LabelFlag[]; unlisted: string[]; worst: Severity | null };

const RANK: Record<Severity, number> = { safe: 0, mild: 1, toxic: 2, emergency: 3 };

// Ordinary label words that our list also uses for other things (salt → salty snacks, yeast →
// raw bread dough, zinc → swallowed coins). On a label they are normal amounts, so they never flag.
export const LABEL_IGNORE = new Set([
  "salt", "sea salt", "yeast", "brewers yeast", "dried yeast", "sugar", "fat", "animal fat", "vitamins", "vitamin", "iron", "zinc",
  "liver", "chicken liver", "beef liver", "potato", "potatoes", "apple", "cheese", "milk", "bones", "tea", "fish", "egg", "eggs",
  "coconut", "coconut oil",
]);

// "pyrethrins" on the label, "pyrethrin" on our list: try the word with and without a final s.
const forms = (n: string) => [n, n.endsWith("s") ? n.slice(0, -1) : `${n}s`];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[0-9.,]+\s*%/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

// Split what the model read into single ingredients ("a, b and c" → a / b / c), keep order, drop
// empties and repeats.
export function splitIngredients(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.flatMap((r) => r.split(/[,;•\n]|\band\b/i))) {
    const t = part.replace(/^(ingredients|active ingredients?|inactive ingredients?|contains)\s*:?\s*/i, "").trim().replace(/\.$/, "");
    const key = norm(t);
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

type Term = { term: string; item: LabelIndexItem };

export function buildLabelIndex(items: LabelIndexItem[]): { exact: Map<string, LabelIndexItem>; contained: Term[] } {
  const exact = new Map<string, LabelIndexItem>();
  const contained: Term[] = [];
  for (const item of items) {
    for (const t of [item.name, ...item.aliases, ...(item.scientific_name ? [item.scientific_name] : [])]) {
      const n = norm(t);
      if (!n || LABEL_IGNORE.has(n)) continue;
      const prev = exact.get(n);
      if (!prev || RANK[item.severity] > RANK[prev.severity]) exact.set(n, item);
      // Inside a longer ingredient ("dehydrated garlic", "permethrin 0.1%"), only distinctive terms
      // for items that need a warning count, so ordinary food words never trip it.
      if (item.severity !== "safe" && n.length >= 5) contained.push({ term: n, item });
    }
  }
  contained.sort((a, b) => b.term.length - a.term.length);
  return { exact, contained };
}

export function matchLabel(ingredients: string[], index: ReturnType<typeof buildLabelIndex>): LabelMatch {
  const flagged: LabelFlag[] = [];
  const unlisted: string[] = [];
  for (const ingredient of ingredients) {
    const n = norm(ingredient);
    if (!n || LABEL_IGNORE.has(n)) {
      unlisted.push(ingredient);
      continue;
    }
    const padded = forms(n).map((f) => ` ${f} `);
    const item =
      forms(n).map((f) => index.exact.get(f)).find(Boolean) ??
      index.contained.find((c) => padded.some((p) => p.includes(` ${c.term} `) || p.includes(` ${c.term}s `)))?.item;
    if (item && item.severity !== "safe") flagged.push({ ingredient, id: item.id, name: item.name, severity: item.severity, summary: item.summary });
    else unlisted.push(ingredient);
  }
  flagged.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  return { flagged, unlisted, worst: flagged[0]?.severity ?? null };
}
