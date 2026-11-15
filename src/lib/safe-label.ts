import type { SafetyCategory, Severity } from "@/lib/safe";

// Label Scan (Ky, 15 Nov): the model only READS the ingredient list off a label; this file
// decides which ingredients are on our list. Our code and our list decide safety, never the model.

export type LabelIndexItem = { id: string; name: string; aliases: string[]; scientific_name: string | null; severity: Severity; category: SafetyCategory; summary: string };
export type LabelFlag = { ingredient: string; id: string; name: string; severity: Severity; summary: string };
// listedSafe: ingredients found on our list as safe (shown as neither flagged nor "not on our list").
export type LabelMatch = { flagged: LabelFlag[]; unlisted: string[]; listedSafe: number; worst: Severity | null };

const RANK: Record<Severity, number> = { safe: 0, mild: 1, toxic: 2, emergency: 3 };

// Ordinary label words that our list also uses for other things (salt → salty snacks, yeast →
// raw bread dough, zinc → swallowed coins). On a label they are normal amounts, so they never flag.
export const LABEL_IGNORE = new Set([
  "salt", "sea salt", "yeast", "brewers yeast", "dried yeast", "sugar", "fat", "animal fat", "vitamins", "vitamin", "iron", "zinc",
  "liver", "chicken liver", "beef liver", "potato", "potatoes", "apple", "cheese", "milk", "bones", "tea", "fish", "egg", "eggs",
  "coconut", "coconut oil", "natural sea salt", "table salt", "kosher salt", "himalayan salt", "pink salt", "sodium chloride",
]);

// A product of one or two ingredients IS those ingredients (a jar of sea salt, a bottle of tea tree
// oil), so it is judged like a single item: the ignore list only applies to longer ingredient lists.
export const WHOLE_PRODUCT_MAX = 2;

// Short terms that are distinctive enough to count inside a longer ingredient name
// ("Delta-9 THC Distillate", "contains lye"); other terms need 5+ letters (audit, 15 Nov).
const SHORT_DISTINCT = new Set(["thc", "lye", "deet"]);

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

// Ignored terms stay in the index (a whole-product label needs them); matching skips them on long lists.
export function buildLabelIndex(items: LabelIndexItem[]): { exact: Map<string, LabelIndexItem>; contained: Term[] } {
  const exact = new Map<string, LabelIndexItem>();
  const contained: Term[] = [];
  for (const item of items) {
    for (const t of [item.name, ...item.aliases, ...(item.scientific_name ? [item.scientific_name] : [])]) {
      const n = norm(t);
      if (!n) continue;
      const prev = exact.get(n);
      if (!prev || RANK[item.severity] > RANK[prev.severity]) exact.set(n, item);
      // Inside a longer ingredient ("dehydrated garlic", "permethrin 0.1%"), only distinctive terms
      // for items that need a warning count, so ordinary food words never trip it.
      if (item.severity !== "safe" && (n.length >= 5 || SHORT_DISTINCT.has(n))) contained.push({ term: n, item });
    }
  }
  contained.sort((a, b) => b.term.length - a.term.length);
  return { exact, contained };
}

// One name (the whole ingredient, or the text inside its brackets) against our list.
function lookup(n: string, index: ReturnType<typeof buildLabelIndex>, skip: (t: string) => boolean): LabelIndexItem | undefined {
  if (!n || skip(n)) return undefined;
  const padded = forms(n).map((f) => ` ${f} `);
  return (
    forms(n)
      .filter((f) => !skip(f))
      .map((f) => index.exact.get(f))
      .find(Boolean) ??
    index.contained.find((c) => !skip(c.term) && padded.some((p) => p.includes(` ${c.term} `) || p.includes(` ${c.term}s `)))?.item
  );
}

export function matchLabel(ingredients: string[], index: ReturnType<typeof buildLabelIndex>): LabelMatch {
  const longList = ingredients.length > WHOLE_PRODUCT_MAX;
  const flagged: LabelFlag[] = [];
  const unlisted: string[] = [];
  let listedSafe = 0;
  ingredients.forEach((ingredient, i) => {
    // The first ingredient is what the product mostly is (a box of salt with anti-caking agent),
    // so the ordinary-label-word list never applies to it.
    const skip = (term: string) => longList && i > 0 && LABEL_IGNORE.has(term);
    // The text in brackets often names the danger: "Melaleuca Alternifolia (Tea Tree) Leaf Oil",
    // "natural flavor (onion)". Each name is looked up and the worst answer kept.
    const names = [norm(ingredient), ...[...ingredient.matchAll(/\(([^)]*)\)/g)].map((m) => norm(m[1]))];
    const found = names.map((n) => lookup(n, index, skip)).filter((x): x is LabelIndexItem => Boolean(x));
    const item = found.sort((a, b) => RANK[b.severity] - RANK[a.severity])[0];
    if (item && item.severity !== "safe") flagged.push({ ingredient, id: item.id, name: item.name, severity: item.severity, summary: item.summary });
    else if (item) listedSafe++;
    else unlisted.push(ingredient);
  });
  flagged.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  return { flagged, unlisted, listedSafe, worst: flagged[0]?.severity ?? null };
}
