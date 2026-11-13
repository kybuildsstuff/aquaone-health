// Account: what the membership card says, and the edit-cat and reminder-settings rules.
// Pure, so it is unit-tested; the page and the API routes use these same functions.
import { z } from "zod";
import { CONDITIONS, LB_PER_KG } from "@/lib/onboarding";
import { safeTimezone } from "@/lib/dates";
import { PRICE } from "@/lib/email";
import type { MemberStatus } from "@/lib/membership";

// Cancel and manage go through Loop's own customer portal (decision 1). This store URL is
// Loop's portal behind Shopify's customer sign-in: she signs in with her email (Shopify sends
// a code), then lands on her subscriptions, where Loop's cancel flow runs. Loop's merchant API
// has no "portal URL for this customer" call (only "email her a login link" and an iframe
// session token, both needing a read-and-write customers token we don't hold).
export const LOOP_PORTAL_URL = "https://trypurestream.com/a/loop_subscriptions/customer";

export type MembershipFacts = {
  status: MemberStatus;
  trial_ends_at: string | null;
  paid_through: string | null;
} | null;

export type MembershipView = {
  state: MemberStatus | "none";
  badge: string;
  headline: string;
  sub: string;
  // The date she keeps access until, or is next charged on; null when unknown.
  date: string | null;
  dateLabel: string | null; // the same date, short ("Dec 17")
  manageLabel: string;
};

export function shortDate(iso: string, tz?: string | null): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone(tz), month: "short", day: "numeric" }).format(new Date(iso));
}

const later = (a: string | null, b: string | null) => {
  const ds = [a, b].filter((d): d is string => Boolean(d));
  if (!ds.length) return null;
  return ds.reduce((x, y) => (new Date(y).getTime() > new Date(x).getTime() ? y : x));
};

export function membershipView(m: MembershipFacts, tz?: string | null): MembershipView {
  const v = view(m, tz);
  return { ...v, dateLabel: v.date ? shortDate(v.date, tz) : null };
}

function view(m: MembershipFacts, tz?: string | null): Omit<MembershipView, "dateLabel"> {
  const fmt = (d: string | null) => (d ? shortDate(d, tz) : null);
  if (!m) {
    return { state: "none", badge: "No membership", headline: "We couldn't find your membership", sub: "Write to help@trypurestream.com and we'll sort it out.", date: null, manageLabel: "Manage membership" };
  }
  switch (m.status) {
    case "trial": {
      const d = fmt(m.trial_ends_at);
      return {
        state: "trial",
        badge: "Free month",
        headline: d ? `Free until ${d}` : "Your free month",
        sub: `Then ${PRICE} every 30 days on the card you used for your AquaOne. We'll email you 3 days before.`,
        date: m.trial_ends_at,
        manageLabel: "Manage or cancel membership",
      };
    }
    case "active": {
      const d = fmt(m.paid_through);
      return {
        state: "active",
        badge: "Active",
        headline: d ? `Renews on ${d}` : "Active",
        sub: `${PRICE} every 30 days on the card you used for your AquaOne.`,
        date: m.paid_through,
        manageLabel: "Manage or cancel membership",
      };
    }
    case "cancelled": {
      const until = later(m.paid_through, m.trial_ends_at);
      const d = fmt(until);
      return {
        state: "cancelled",
        badge: "Cancelled",
        headline: d ? `Full access until ${d}` : "Cancelled",
        sub: "You won't be charged again. Changed your mind? You can rejoin any time from your PureStream account.",
        date: until,
        manageLabel: "Manage membership",
      };
    }
    case "past_due":
      return {
        state: "past_due",
        badge: "Payment issue",
        headline: "Your last payment didn't go through",
        sub: "Update your card in your PureStream account to keep AquaOne Health.",
        date: null,
        manageLabel: "Update payment",
      };
    default:
      return { state: "ended", badge: "Ended", headline: "Your membership has ended", sub: "You can rejoin any time from your PureStream account.", date: null, manageLabel: "Manage membership" };
  }
}

// ---- Edit cat ----------------------------------------------------------------------------------

const conditionIds = CONDITIONS.map((c) => c.id) as [string, ...string[]];

export const catEditSchema = z.object({
  name: z.string().trim().min(1, "Add your cat's name").max(60),
  pronoun: z.enum(["he", "she", "they"]),
  ageYears: z.number().min(0).max(30),
  weight: z.number().positive().max(60).nullable(),
  weightUnit: z.enum(["lb", "kg"]),
  lives: z.enum(["indoor", "outdoor", "both"]),
  food: z.enum(["dry", "wet", "mix"]),
  conditions: z.array(z.enum(conditionIds)).max(conditionIds.length),
  vetName: z.string().trim().max(80),
  vetPhone: z.string().trim().max(30).regex(/^[0-9+()\-.\s]*$/, "Use digits only"),
});
export type CatEdit = z.output<typeof catEditSchema>;

// The update for her cats row. Free-text conditions saved by the first onboarding version
// ("other:...") are kept, since this screen has no way to show or change them.
export function catUpdate(input: CatEdit, existingConditions: string[] = []) {
  const lb = input.weight == null ? null : Math.round((input.weightUnit === "kg" ? input.weight * LB_PER_KG : input.weight) * 100) / 100;
  const kept = existingConditions.filter((c) => c.startsWith("other:"));
  return {
    name: input.name,
    pronoun: input.pronoun,
    age_years: input.ageYears,
    start_weight_lb: lb,
    lives: input.lives,
    food: input.food,
    conditions: [...new Set(input.conditions), ...kept],
    vet_name: input.vetName || null,
    vet_phone: input.vetPhone || null,
  };
}

// ---- Reminder settings -------------------------------------------------------------------------

export const CHECKIN_TIMES = [
  { value: "08:00", label: "8 am" },
  { value: "12:00", label: "12 pm" },
  { value: "19:00", label: "7 pm" },
] as const;

export const reminderSchema = z.object({
  byEmail: z.boolean(),
  checkinTime: z.enum(["08:00", "12:00", "19:00"]),
});
export type ReminderInput = z.output<typeof reminderSchema>;

export function timeLabel(t: string | null | undefined): string {
  const hhmm = (t ?? "08:00").slice(0, 5);
  const known = CHECKIN_TIMES.find((c) => c.value === hhmm);
  if (known) return known.label;
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

export function reminderSummary(prefs: { by_email: boolean; checkin_time: string } | null): string {
  if (!prefs || !prefs.by_email) return "Off";
  return `Email · ${timeLabel(prefs.checkin_time)}`;
}
