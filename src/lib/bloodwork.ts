// Bloodwork, explained (Ky, 15 Nov, answers 5a–7a). The model only READS the report; this file
// decides what each result means in plain English, how it moved since the last panel, and which
// questions to take to the vet. Wording rules: say what a test measures and how the number moved,
// quote the lab's own range and flags, never name a disease, never stage, never advise a treatment.

export type TestInfo = { code: string; label: string; group: TestGroup; about: string; aliases: string[] };
export type TestGroup = "Kidneys" | "Liver" | "Blood sugar" | "Thyroid" | "Blood count" | "Minerals" | "Urine" | "Other";

// About 25 common cat tests (5a). `about` is ours, written to the claims rules above.
export const TESTS: TestInfo[] = [
  { code: "creatinine", label: "Creatinine", group: "Kidneys", about: "A waste product the kidneys filter out of the blood. Vets watch it to see how well the kidneys are filtering.", aliases: ["creatinine", "creat", "crea", "cre", "crt"] },
  { code: "sdma", label: "SDMA", group: "Kidneys", about: "Another measure of how well the kidneys filter. It can change sooner than creatinine does.", aliases: ["sdma", "idexx sdma", "symmetric dimethylarginine"] },
  { code: "bun", label: "BUN (urea)", group: "Kidneys", about: "A waste product from breaking down protein, cleared by the kidneys. Diet and how much your cat drinks also move it.", aliases: ["bun", "urea", "urea nitrogen", "blood urea nitrogen", "urea n"] },
  { code: "bun_creatinine_ratio", label: "BUN to creatinine ratio", group: "Kidneys", about: "BUN divided by creatinine. Vets read it alongside both numbers.", aliases: ["bun creatinine ratio", "bun creat ratio", "bun crea ratio", "bun cre ratio", "bun/creatinine ratio", "b c ratio"] },
  { code: "phosphorus", label: "Phosphorus", group: "Minerals", about: "A mineral the kidneys help keep in balance. Vets watch it closely in older cats.", aliases: ["phosphorus", "phos", "phosphate", "inorganic phosphorus", "phos inorganic"] },
  { code: "potassium", label: "Potassium", group: "Minerals", about: "A mineral that keeps muscles and the heart working. Older cats can run low.", aliases: ["potassium", "k", "k+"] },
  { code: "sodium", label: "Sodium", group: "Minerals", about: "A salt that helps balance the water in the body.", aliases: ["sodium", "na", "na+"] },
  { code: "chloride", label: "Chloride", group: "Minerals", about: "A salt that moves with sodium and water in the body.", aliases: ["chloride", "cl", "cl-"] },
  { code: "calcium", label: "Calcium", group: "Minerals", about: "A mineral for bones, muscles and nerves.", aliases: ["calcium", "ca", "total calcium"] },
  { code: "usg", label: "Urine concentration (USG)", group: "Urine", about: "How concentrated the urine is. Kidneys that filter well can make urine more concentrated.", aliases: ["usg", "urine specific gravity", "specific gravity", "sp gr", "sg"] },
  { code: "upc", label: "Urine protein to creatinine (UPC)", group: "Urine", about: "How much protein is passing into the urine, compared with creatinine.", aliases: ["upc", "upcr", "urine protein creatinine ratio", "urine protein:creatinine ratio", "protein creatinine ratio"] },
  { code: "alt", label: "ALT", group: "Liver", about: "An enzyme from liver cells. It goes up when liver cells are under strain.", aliases: ["alt", "alt sgpt", "sgpt", "alanine aminotransferase"] },
  { code: "alp", label: "ALP", group: "Liver", about: "An enzyme from the liver and bones. In cats even small rises get a vet's attention.", aliases: ["alp", "alkp", "alk phos", "alkaline phosphatase"] },
  { code: "ggt", label: "GGT", group: "Liver", about: "An enzyme linked to the liver and bile ducts.", aliases: ["ggt", "gamma gt", "gamma glutamyltransferase"] },
  { code: "bilirubin", label: "Bilirubin", group: "Liver", about: "A yellow pigment the liver clears from old red blood cells.", aliases: ["total bilirubin", "tbil", "t bil", "bilirubin", "tbili"] },
  { code: "albumin", label: "Albumin", group: "Liver", about: "A protein made by the liver that helps keep fluid inside the blood vessels.", aliases: ["albumin", "alb"] },
  { code: "total_protein", label: "Total protein", group: "Liver", about: "All the proteins in the blood, albumin and globulin together.", aliases: ["total protein", "tp", "protein total", "tprot"] },
  { code: "globulin", label: "Globulin", group: "Liver", about: "Proteins that include the immune system's antibodies.", aliases: ["globulin", "glob"] },
  { code: "glucose", label: "Glucose", group: "Blood sugar", about: "Blood sugar. In cats, stress at the vet can push it up for a while.", aliases: ["glucose", "glu", "gluc"] },
  { code: "fructosamine", label: "Fructosamine", group: "Blood sugar", about: "The average blood sugar over the last two to three weeks, so a stressful visit doesn't skew it.", aliases: ["fructosamine", "fruct"] },
  { code: "t4", label: "T4 (thyroid)", group: "Thyroid", about: "The main thyroid hormone. Older cats often have it checked.", aliases: ["t4", "total t4", "tt4", "thyroxine", "t4 total"] },
  { code: "cholesterol", label: "Cholesterol", group: "Other", about: "A fat in the blood. Vets read it alongside the other results.", aliases: ["cholesterol", "chol"] },
  { code: "hct", label: "Red cell share (HCT/PCV)", group: "Blood count", about: "How much of the blood is made of red blood cells, which carry oxygen.", aliases: ["hct", "hematocrit", "haematocrit", "pcv", "packed cell volume"] },
  { code: "hgb", label: "Hemoglobin", group: "Blood count", about: "The part of red blood cells that carries oxygen.", aliases: ["hgb", "hb", "hemoglobin", "haemoglobin"] },
  { code: "rbc", label: "Red blood cells", group: "Blood count", about: "The count of red blood cells, which carry oxygen.", aliases: ["rbc", "red blood cells", "red blood cell count", "erythrocytes"] },
  { code: "wbc", label: "White blood cells", group: "Blood count", about: "The count of white blood cells, which fight infection.", aliases: ["wbc", "white blood cells", "white blood cell count", "leukocytes"] },
  { code: "platelets", label: "Platelets", group: "Blood count", about: "Cells that help blood clot. Cat platelets often clump, so the count can read low.", aliases: ["plt", "platelets", "platelet count", "thrombocytes"] },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9+:/-]+/g, " ")
    .replace(/[:/-]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const BY_ALIAS = new Map(TESTS.flatMap((t) => t.aliases.map((a) => [norm(a), t] as const)));
export const testByCode = new Map(TESTS.map((t) => [t.code, t]));

// Our test for a name as printed ("CREA", "ALT (SGPT)", "SDMA (IDEXX)"); null when it's not on our list.
export function matchTest(printed: string): TestInfo | null {
  const n = norm(printed);
  if (BY_ALIAS.has(n)) return BY_ALIAS.get(n)!;
  // "IDEXX SDMA", "Creatinine, serum": try without the first or last word.
  const words = n.split(" ");
  for (const cut of [words.slice(1).join(" "), words.slice(0, -1).join(" ")]) if (cut && BY_ALIAS.has(cut)) return BY_ALIAS.get(cut)!;
  // The printed name in brackets ("Alanine aminotransferase (ALT)").
  const inBrackets = printed.match(/\(([^)]+)\)/)?.[1];
  return inBrackets && BY_ALIAS.has(norm(inBrackets)) ? BY_ALIAS.get(norm(inBrackets))! : null;
}

// "1.9", "<0.1", "1,234", "Negative" → a number when there is one.
export function parseNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export type ResultRow = { name: string; test_code: string | null; value: number | null; value_text: string; unit: string | null; ref_low: number | null; ref_high: number | null; lab_flag: "high" | "low" | null };
export type Position = "above" | "below" | "within" | null;

// Where the value sits against the lab's own range: the lab's printed flag first, else the range.
export function position(r: Pick<ResultRow, "value" | "ref_low" | "ref_high" | "lab_flag">): Position {
  if (r.lab_flag === "high") return "above";
  if (r.lab_flag === "low") return "below";
  if (r.value == null || (r.ref_low == null && r.ref_high == null)) return null;
  if (r.ref_high != null && r.value > r.ref_high) return "above";
  if (r.ref_low != null && r.value < r.ref_low) return "below";
  return "within";
}

export const POSITION_TEXT: Record<Exclude<Position, null>, string> = {
  above: "Above the lab's range",
  below: "Below the lab's range",
  within: "Within the lab's range",
};

// "May" within the last year, otherwise "May 2025". Dates are YYYY-MM-DD.
export function monthLabel(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const days = (Date.parse(`${today}T12:00:00Z`) - d.getTime()) / 86400000;
  return days > 330 ? `${month} ${d.getUTCFullYear()}` : month;
}

export type Change = { direction: "up" | "down" | "same"; previous: number; previousText: string; since: string };

// How a result moved since the same test on the previous panel. "Same" within 5% (lab noise).
export function changeSince(current: number | null, previous: { value: number | null; value_text: string } | undefined, since: string): Change | null {
  if (current == null || !previous || previous.value == null) return null;
  const diff = current - previous.value;
  const same = Math.abs(diff) <= Math.max(Math.abs(previous.value) * 0.05, 1e-9);
  return { direction: same ? "same" : diff > 0 ? "up" : "down", previous: previous.value, previousText: previous.value_text, since };
}

export function changeText(c: Change): string {
  return c.direction === "same" ? `same as ${c.since}` : `${c.direction} from ${c.previousText} in ${c.since}`;
}

// Up to three questions for her vet (7a), built only from what the lab flagged or what changed.
// Flagged results come first, then the biggest moves. Never a diagnosis, never a treatment.
export function vetQuestions(rows: (ResultRow & { change: Change | null })[], catName: string): string[] {
  const named = (r: ResultRow) => (r.test_code ? testByCode.get(r.test_code)!.label : r.name);
  const scored = rows
    .map((r) => {
      const pos = position(r);
      const flagged = pos === "above" || pos === "below";
      const moved = r.change && r.change.direction !== "same" && r.change.previous !== 0 ? Math.abs((r.value! - r.change.previous) / r.change.previous) : 0;
      return { r, pos, flagged, moved };
    })
    .filter((x) => x.flagged || x.moved >= 0.15);
  scored.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.moved - a.moved);
  return scored.slice(0, 3).map(({ r, pos, flagged }) => {
    const side = pos === "above" ? "above" : "below";
    if (flagged && r.change && r.change.direction !== "same")
      return `${named(r)} is ${side} the lab's range and went from ${r.change.previousText} to ${r.value_text} since ${r.change.since}. Should we recheck it, and when?`;
    if (flagged) return `${named(r)} is ${side} the lab's range. What does that mean for ${catName}, and should anything change?`;
    return `${named(r)} went from ${r.change!.previousText} to ${r.value_text} since ${r.change!.since}. Is that change worth watching?`;
  });
}

// Group order on the results screen: kidney tests first (our buyer's biggest worry).
export const GROUP_ORDER: TestGroup[] = ["Kidneys", "Urine", "Minerals", "Blood sugar", "Thyroid", "Liver", "Blood count", "Other"];

// Daily limit on lab report photos per member, across her cats (same spirit as Ask's photo cap).
export const LAB_PHOTO_DAILY_CAP = 10;

// The words for each refusal when adding a report.
export function labErrorMessage(status: number | null, error?: string): string {
  if (status === null) return "We couldn't reach AquaOne Health. Check your connection and try again.";
  if (error === "unreadable") return "We couldn't read a lab report in that photo. Try again in good light, with the whole page flat and in focus.";
  if (error === "lab_cap") return `That's ${LAB_PHOTO_DAILY_CAP} reports today. You can add more tomorrow.`;
  if (error === "too_large") return "That photo is too big. Try taking it again.";
  if (error === "bad_type") return "That file isn't a photo we can read. Try a JPG or PNG.";
  if (status === 401) return "You've been signed out. Sign in again and try once more.";
  return "Something went wrong reading the report. Try again in a moment.";
}

// One panel explained (built in bloodwork.server.ts, shown by the app, the vet report and the PDF).
export type ExplainedResult = ResultRow & { id: string; label: string; about: string | null; group: TestGroup | null; position: Position; change: Change | null };
export type ExplainedPanel = {
  id: string;
  catId: string;
  taken_on: string;
  date_from_report: boolean;
  lab_name: string | null;
  readable: "full" | "partial";
  previousOn: string | null;
  groups: { group: TestGroup | "Not on our list"; results: ExplainedResult[] }[];
  questions: string[];
  photo_path: string | null;
};

