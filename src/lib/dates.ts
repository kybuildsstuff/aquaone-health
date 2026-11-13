// Calendar dates in the owner's own timezone. A "day" in the app (one check-in,
// one care plan) is her local day, stored as YYYY-MM-DD.
export const DEFAULT_TZ = "America/New_York";

export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

export function localDate(tz: string, at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: safeTimezone(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function localHour(tz: string, at: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone(tz), hour: "numeric", hourCycle: "h23" }).format(at);
  return Number(h);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function weekdayShort(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

// "today", "yesterday", "3 days ago"
export function relativeDay(date: string, today: string): string {
  const n = daysBetween(date, today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
}

export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Consecutive days with activity, ending today, or yesterday when today has nothing yet
// (so the streak doesn't read 0 every morning before she checks in).
export function streakDays(active: Iterable<string>, today: string): number {
  const days = new Set(active);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}
