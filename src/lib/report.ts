// The vet report: what goes in it and the words for it. Pure (no database), so the period
// filtering, the weight maths and the breathing flags are unit-tested; the reads live in
// report.server.ts and the PDF drawing in report-pdf.server.ts. Not a diagnosis (decision 8).
import { addDays } from "@/lib/dates";
import { BREATHING_RED_OVER } from "@/lib/kidney-watch";
import { CONDITIONS } from "@/lib/onboarding";
import { vetLabel, type Pronoun } from "@/lib/cat";

// The report covers her last 30 local days, today included.
export const REPORT_DAYS = 30;
// How long a share link works. The one place to change it (the database only caps it at 90 days).
export const SHARE_LINK_DAYS = 30;
// 32 random bytes, base64url: 43 characters, 256 bits. Only its SHA-256 hash is stored.
export const SHARE_TOKEN_BYTES = 32;
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// The normal sleeping breathing band shown on the report; over 30 is Kidney Watch's red rule.
export const BREATHING_NORMAL = { low: 15, high: BREATHING_RED_OVER } as const;
export const DISCLAIMER = "Not a diagnosis — for your vet to review.";

export type Drink = "less" | "normal" | "more";

export type ReportCatRow = {
  id: string;
  name: string;
  pronoun: Pronoun;
  age_years: number | string | null;
  breed: string | null;
  lives: "indoor" | "outdoor" | "both" | null;
  food: "dry" | "wet" | "mix" | null;
  conditions: string[] | null;
  vet_name: string | null;
  vet_phone: string | null;
  start_weight_lb: number | string | null;
};

export type ReportInput = {
  cat: ReportCatRow;
  tz: string;
  today: string; // her local YYYY-MM-DD
  checkIns: { date: string; drinking: Drink }[];
  weighIns: { date: string; cat_lb: number | string; created_at: string }[];
  breathing: { taken_at: string; breaths_per_min: number | string }[];
  alerts: { kind: string; level: "amber" | "red"; opened_at: string; resolved_at: string | null }[];
};

export type Report = ReturnType<typeof buildReport>;

const round1 = (n: number) => Math.round(n * 10) / 10;

// Local calendar date of an instant, in her timezone.
export function localDay(tz: string, iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function reportPeriod(today: string, days = REPORT_DAYS) {
  return { from: addDays(today, -(days - 1)), to: today, days };
}

const inPeriod = (date: string, p: { from: string; to: string }) => date >= p.from && date <= p.to;

// Percentage change from the first to the last weigh-in, one decimal. Null without two weigh-ins.
export function weightChangePct(firstLb: number, lastLb: number): number | null {
  if (!(firstLb > 0) || !Number.isFinite(lastLb)) return null;
  return round1(((lastLb - firstLb) / firstLb) * 100);
}

export function weightChangeLabel(pct: number | null): string {
  if (pct == null) return "One weigh-in so far";
  if (Math.abs(pct) < 1) return "Steady";
  return pct > 0 ? `Up ${pct}%` : `Down ${Math.abs(pct)}%`;
}

export const ALERT_TITLES: Record<string, string> = {
  drinking_more: "Drinking more than usual",
  drinking_less: "Drinking less than usual",
  weight_down_5pct: "Weight down 5% or more in 4 weeks",
  breathing_over_30: "Breathing over 30 a minute at rest",
};

const LIVES = { indoor: "Indoor", outdoor: "Outdoor", both: "Indoor and outdoor" } as const;
const FOOD = { dry: "Dry food", wet: "Wet food", mix: "Wet and dry food" } as const;

export function conditionLabels(conditions: string[] | null | undefined): string[] {
  return (conditions ?? []).map((c) => (c.startsWith("other:") ? c.slice(6).trim() : (CONDITIONS.find((x) => x.id === c)?.label ?? c))).filter(Boolean);
}

export function ageLabel(age: number | string | null): string | null {
  if (age == null || age === "") return null;
  const n = Number(age);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return `${Math.max(1, Math.round(n * 12))} months`;
  return `${round1(n)} ${n === 1 ? "yr" : "yrs"}`;
}

// "Nov 17", or "Nov 17, 2026" with the year.
export function dayLabel(date: string, withYear = false): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function periodLabel(p: { from: string; to: string }): string {
  return `${dayLabel(p.from)} – ${dayLabel(p.to, true)}`;
}

function timeLabel(tz: string, iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export function buildReport(input: ReportInput, days = REPORT_DAYS) {
  const period = reportPeriod(input.today, days);
  const { cat } = input;

  // Drinking: one answer per local day.
  const byDate = new Map(input.checkIns.filter((c) => inPeriod(c.date, period)).map((c) => [c.date, c.drinking]));
  const drinkingDays = Array.from({ length: days }, (_, i) => {
    const date = addDays(period.from, i);
    return { date, drinking: byDate.get(date) ?? null };
  });
  const counts = { less: 0, normal: 0, more: 0 };
  for (const d of byDate.values()) counts[d]++;
  const checkIns = counts.less + counts.normal + counts.more;
  const mostly = (["normal", "more", "less"] as const).reduce((best, k) => (counts[k] > counts[best] ? k : best), "normal" as Drink);
  const drinkingLabel = checkIns === 0 ? "No check-ins" : mostly === "normal" ? "Normal" : mostly === "more" ? "More than usual" : "Less than usual";

  // Weight: real two-step weigh-ins in the period, oldest first (the onboarding estimate is not one).
  const weighIns = input.weighIns
    .filter((w) => inPeriod(w.date, period))
    .map((w) => ({ date: w.date, lb: Number(w.cat_lb), created_at: w.created_at }))
    .sort((a, b) => (a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date)))
    .map(({ date, lb }) => ({ date, lb }));
  const first = weighIns[0];
  const last = weighIns.at(-1);
  const changePct = weighIns.length >= 2 && first && last ? weightChangePct(first.lb, last.lb) : null;

  // Breathing: every count in the period stays on the report, red ones included even when a
  // later normal recount cleared the alert (Ky's breathing-recount ruling, 13 Nov).
  const breathing = input.breathing
    .map((b) => ({ at: b.taken_at, date: localDay(input.tz, b.taken_at), bpm: Number(b.breaths_per_min) }))
    .filter((b) => inPeriod(b.date, period))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((b) => ({ ...b, time: timeLabel(input.tz, b.at), red: b.bpm > BREATHING_RED_OVER }));
  const red = breathing.filter((b) => b.red);

  // Alerts that were open at any point in the period.
  const alerts = input.alerts
    .map((a) => ({ ...a, openedOn: localDay(input.tz, a.opened_at), resolvedOn: a.resolved_at ? localDay(input.tz, a.resolved_at) : null }))
    .filter((a) => a.openedOn <= period.to && (a.resolvedOn == null || a.resolvedOn >= period.from))
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at))
    .map((a) => ({ kind: a.kind, level: a.level, title: ALERT_TITLES[a.kind] ?? a.kind, openedOn: a.openedOn, resolvedOn: a.resolvedOn }));

  const startEstimate = cat.start_weight_lb == null ? null : Number(cat.start_weight_lb);

  return {
    period: { ...period, label: periodLabel(period) },
    cat: {
      name: cat.name,
      pronoun: cat.pronoun,
      age: ageLabel(cat.age_years),
      breed: cat.breed?.trim() || null,
      lives: cat.lives ? LIVES[cat.lives] : null,
      food: cat.food ? FOOD[cat.food] : null,
      conditions: conditionLabels(cat.conditions),
      vet: vetLabel(cat.vet_name),
      vetSaved: Boolean(cat.vet_name?.trim()),
      vetPhone: cat.vet_phone?.trim() || null,
      startEstimateLb: startEstimate != null && Number.isFinite(startEstimate) ? startEstimate : null,
    },
    drinking: { days: drinkingDays, counts, checkIns, label: drinkingLabel },
    weight: {
      points: weighIns,
      latestLb: last?.lb ?? null,
      changePct,
      label: weighIns.length === 0 ? "No weigh-ins" : weightChangeLabel(changePct),
      since: weighIns.length >= 2 && first ? first.date : null,
    },
    breathing: {
      counts: breathing,
      red,
      latest: breathing.at(-1) ?? null,
      max: breathing.length ? Math.max(...breathing.map((b) => b.bpm)) : null,
      min: breathing.length ? Math.min(...breathing.map((b) => b.bpm)) : null,
    },
    alerts,
  };
}

// The line under a profile name: "Tabby · 11 yrs".
export function profileLine(r: Report): string {
  return [r.cat.name, r.cat.breed, r.cat.age].filter(Boolean).join(" · ");
}

export function drinkingSub(r: Report): string {
  const { counts, checkIns } = r.drinking;
  if (checkIns === 0) return "Daily check-ins start on Today";
  const bits = [`${checkIns} of ${r.period.days} days`];
  if (counts.more) bits.push(`${counts.more} "more"`);
  if (counts.less) bits.push(`${counts.less} "less"`);
  return bits.join(" · ");
}

export function breathingSub(r: Report): string {
  const n = r.breathing.counts.length;
  if (!n) return "No counts yet";
  if (r.breathing.red.length) return `${r.breathing.red.length} over 30`;
  return `${n} ${n === 1 ? "count" : "counts"}, at rest`;
}

// A safe file name for the PDF: "Milo-vet-report.pdf".
export function pdfFileName(catName: string): string {
  const base = catName.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${base || "cat"}-vet-report.pdf`;
}
