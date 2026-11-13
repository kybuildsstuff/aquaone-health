// Pure logic for Account and the app's emails: the membership card's words for every status,
// the edit-cat rules, and who gets which email when. No network, no database.
import { describe, expect, it } from "vitest";
import { catEditSchema, catUpdate, membershipView, reminderSchema, reminderSummary, timeLabel, LOOP_PORTAL_URL } from "../src/lib/account";
import { emailable, trialEndingDue, trialEndingEmail, welcomeEmail, type EmailMember } from "../src/lib/email";

const NOW = new Date("2026-11-20T15:00:00Z");
const day = 86400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("membership card", () => {
  it("says the right thing for every status", () => {
    const trial = membershipView({ status: "trial", trial_ends_at: "2026-12-17T12:00:00Z", paid_through: null }, "America/New_York");
    expect([trial.badge, trial.headline, trial.dateLabel]).toEqual(["Free month", "Free until Dec 17", "Dec 17"]);
    expect(trial.sub).toContain("$19.95 every 30 days");
    expect(trial.manageLabel).toBe("Manage or cancel membership");

    const active = membershipView({ status: "active", trial_ends_at: "2026-12-17T12:00:00Z", paid_through: "2027-01-16T12:00:00Z" });
    expect([active.badge, active.headline]).toEqual(["Active", "Renews on Jan 16"]);

    // Cancelled keeps access to the later of the paid-through date and the free-month end.
    const cancelledInTrial = membershipView({ status: "cancelled", trial_ends_at: "2026-12-17T12:00:00Z", paid_through: null });
    expect([cancelledInTrial.badge, cancelledInTrial.headline]).toEqual(["Cancelled", "Full access until Dec 17"]);
    const cancelledPaid = membershipView({ status: "cancelled", trial_ends_at: "2026-12-17T12:00:00Z", paid_through: "2027-01-16T12:00:00Z" });
    expect(cancelledPaid.headline).toBe("Full access until Jan 16");
    expect(cancelledPaid.manageLabel).toBe("Manage membership");

    expect(membershipView({ status: "past_due", trial_ends_at: null, paid_through: null }).headline).toMatch(/didn't go through/);
    expect(membershipView({ status: "ended", trial_ends_at: null, paid_through: null }).headline).toMatch(/ended/);
    expect(membershipView(null).state).toBe("none");
    // Missing dates never print "Invalid Date" or "null".
    for (const s of ["trial", "active", "cancelled"] as const) {
      const v = membershipView({ status: s, trial_ends_at: null, paid_through: null });
      expect(`${v.headline} ${v.sub}`).not.toMatch(/Invalid|null|undefined/);
    }
  });

  it("shows the date in her own timezone", () => {
    const m = { status: "trial" as const, trial_ends_at: "2026-12-17T03:00:00Z", paid_through: null };
    expect(membershipView(m, "America/Los_Angeles").headline).toBe("Free until Dec 16");
    expect(membershipView(m, "Asia/Singapore").headline).toBe("Free until Dec 17");
  });

  it("cancel goes to Loop's portal on the store", () => {
    expect(LOOP_PORTAL_URL).toMatch(/^https:\/\/trypurestream\.com\/a\/loop_subscriptions\//);
  });
});

describe("edit cat", () => {
  const good = { name: " Milo ", pronoun: "he", ageYears: 11, weight: 10.6, weightUnit: "lb", lives: "indoor", food: "mix", conditions: ["kidney", "dental"], vetName: "Dr. Lane", vetPhone: "(555) 013-4471" };

  it("accepts a valid profile and trims the name", () => {
    const p = catEditSchema.safeParse(good);
    expect(p.success).toBe(true);
    expect(p.data?.name).toBe("Milo");
  });

  it("rejects what the screen must never save", () => {
    const bad: Record<string, unknown>[] = [
      { name: "   " },
      { name: "x".repeat(61) },
      { pronoun: "it" },
      { ageYears: -1 },
      { ageYears: 31 },
      { weight: 0 },
      { weight: -1 },
      { weight: 61 },
      { lives: "garden" },
      { food: "raw" },
      { conditions: ["kidney", "made_up"] },
      { conditions: ["other:free text"] },
      { vetPhone: "call me maybe" },
      { vetName: "x".repeat(81) },
    ];
    for (const over of bad) expect(catEditSchema.safeParse({ ...good, ...over }).success, JSON.stringify(over)).toBe(false);
  });

  it("converts kg to lb, clears empty vet fields and keeps old free-text conditions", () => {
    const row = catUpdate(catEditSchema.parse({ ...good, weight: 5, weightUnit: "kg", vetName: "", vetPhone: "", conditions: ["kidney", "kidney"] }), ["urinary", "other:hairballs"]);
    expect(row.start_weight_lb).toBe(11.02);
    expect([row.vet_name, row.vet_phone]).toEqual([null, null]);
    expect(row.conditions).toEqual(["kidney", "other:hairballs"]);
    expect(catUpdate(catEditSchema.parse({ ...good, weight: null })).start_weight_lb).toBeNull();
  });
});

describe("reminder settings", () => {
  it("accepts only the offered times", () => {
    expect(reminderSchema.safeParse({ byEmail: true, checkinTime: "12:00" }).success).toBe(true);
    expect(reminderSchema.safeParse({ byEmail: true, checkinTime: "03:00" }).success).toBe(false);
    expect(reminderSchema.safeParse({ byEmail: "yes", checkinTime: "08:00" }).success).toBe(false);
  });
  it("summarises them for the Account row", () => {
    expect(reminderSummary({ by_email: true, checkin_time: "08:00:00" })).toBe("Email · 8 am");
    expect(reminderSummary({ by_email: false, checkin_time: "08:00:00" })).toBe("Off");
    expect(reminderSummary(null)).toBe("Off");
    expect(timeLabel("19:30:00")).toBe("7:30 pm");
  });
});

const member = (over: Partial<EmailMember> = {}): EmailMember => ({
  id: "m1",
  email: "jane@example.com",
  shopify_customer_id: "123",
  status: "trial",
  trial_ends_at: iso(NOW.getTime() + 2.5 * day),
  paid_through: null,
  created_at: iso(NOW.getTime() - 27.5 * day),
  ...over,
});

describe("who gets emails", () => {
  it("never TEST rows or undeliverable .invalid addresses", () => {
    expect(emailable(member())).toBe(true);
    expect(emailable(member({ shopify_customer_id: "TEST" }))).toBe(false);
    expect(emailable(member({ email: "loop-x@test.invalid" }))).toBe(false);
    expect(trialEndingDue(member({ shopify_customer_id: "TEST" }), NOW)).toBe(false);
  });

  it("trial-ending is only for trials, never active, cancelled, past_due or ended", () => {
    expect(trialEndingDue(member(), NOW)).toBe(true);
    for (const status of ["active", "cancelled", "past_due", "ended"] as const) expect(trialEndingDue(member({ status }), NOW)).toBe(false);
    expect(trialEndingDue(member({ trial_ends_at: null }), NOW)).toBe(false);
  });

  // Property: with one run a day at any time of day, every trial falls in the window on at
  // least one run (no gaps), the first such run is 2-3 days before it ends, and a trial is
  // in the window on at most three runs (email_log's claim turns that into exactly one send).
  it("the daily window has no gaps and first fires 2-3 days out", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const firstRun = NOW.getTime() + rand() * day;
      const ends = firstRun + 4 * day + rand() * 20 * day;
      const m = member({ trial_ends_at: iso(ends) });
      const due: number[] = [];
      for (let k = 0; k < 30; k++) {
        const run = firstRun + k * day + (rand() - 0.5) * 3600_000; // cron jitter within the hour
        if (trialEndingDue(m, new Date(run))) due.push(ends - run);
      }
      expect(due.length).toBeGreaterThanOrEqual(1);
      expect(due.length).toBeLessThanOrEqual(3);
      expect(due[0]).toBeGreaterThan(1.9 * day);
      expect(due[0]).toBeLessThanOrEqual(3 * day);
    }
  });
});

describe("email copy", () => {
  const banned = /plaque|tartar|diagnos(e|is) your|cures?\b/i;

  it("welcome: sign-in button, Home Screen tip, what's inside, help address, price", () => {
    const w = welcomeEmail();
    expect(w.subject).toBe("Your AquaOne Health is ready");
    for (const body of [w.html, w.text]) {
      expect(body).toContain("https://app.trypurestream.com/sign-in");
      expect(body).toMatch(/Add to Home Screen/);
      expect(body).toMatch(/Kidney Watch/);
      expect(body).toContain("help@trypurestream.com");
      expect(body).toContain("$19.95 every 30 days");
      expect(body).not.toMatch(banned);
    }
  });

  it("trial-ending: the date in her timezone, the price, how to cancel, help address", () => {
    const t = trialEndingEmail("2026-12-17T03:00:00Z", "America/Los_Angeles");
    expect(t.subject).toBe("Your free month of AquaOne Health ends Wednesday, December 16");
    for (const body of [t.html, t.text]) {
      expect(body).toContain("Wednesday, December 16");
      expect(body).toContain("$19.95 every 30 days");
      expect(body).toContain("https://app.trypurestream.com/account");
      expect(body).toMatch(/Manage or cancel membership/);
      expect(body).toContain("help@trypurestream.com");
      expect(body).not.toMatch(banned);
    }
  });
});
