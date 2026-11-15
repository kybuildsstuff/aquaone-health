// Retention v1 emails (Ky, 15 Nov): when the monthly summary and the nudge are due, what they say,
// and the alert email. Pure rules and templates.
import { describe, expect, it } from "vitest";
import {
  alertEmail,
  emailable,
  monthlyDue,
  monthlyKind,
  monthlySummaryEmail,
  nextChargeAt,
  nudgeDue,
  nudgeEmail,
  nudgeKind,
  oneThing,
  type EmailMember,
  type SummaryCat,
} from "../src/lib/email";
import { emailsSummary, reminderSchema } from "../src/lib/account";

const banned = /plaque|tartar|diagnos(e|is) your|cures?\b|prevents?\b|AI vet|a change from (her|his) normal/i;
const NOW = new Date("2026-12-14T15:00:00Z");
const day = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * day).toISOString();
const member = (over: Partial<EmailMember> = {}): EmailMember => ({
  id: "m1",
  email: "jane@example.com",
  shopify_customer_id: "123",
  status: "trial",
  trial_ends_at: iso(3),
  paid_through: null,
  created_at: iso(-27),
  ...over,
});
const cat = (over: Partial<SummaryCat> = {}): SummaryCat => ({ name: "Milo", checkIns: 27, drinking: "Normal", weight: "10.6 lb", breathing: "22/min", steady: true, ageYears: 8, openAlert: null, ...over });

describe("monthly summary timing", () => {
  it("is due once, when the next charge is more than 2 and at most 4 days away", () => {
    expect(monthlyDue(member({ trial_ends_at: iso(3) }), NOW)).toBe(true);
    expect(monthlyDue(member({ trial_ends_at: iso(2) }), NOW)).toBe(false);
    expect(monthlyDue(member({ trial_ends_at: iso(5) }), NOW)).toBe(false);
    expect(monthlyDue(member({ status: "active", trial_ends_at: iso(-27), paid_through: iso(3) }), NOW)).toBe(true);
  });

  it("is never sent to cancelled or ended members, test rows, or when she switched it off", () => {
    expect(monthlyDue(member({ status: "cancelled" }), NOW)).toBe(false);
    expect(monthlyDue(member({ shopify_customer_id: "TEST" }), NOW)).toBe(false);
    expect(monthlyDue(member(), NOW, false)).toBe(false);
  });

  it("is keyed to the charge date, so each cycle gets exactly one", () => {
    expect(monthlyKind(member({ trial_ends_at: "2026-12-17T03:00:00Z" }))).toBe("monthly:2026-12-17");
    expect(nextChargeAt(member({ status: "active", paid_through: "2027-01-16T03:00:00Z" }))).toBe("2027-01-16T03:00:00Z");
  });
});

describe("nudge timing", () => {
  it("is due after 5 quiet days, not in her first 5 days, and once per calendar month", () => {
    expect(nudgeDue(member(), iso(-5), NOW)).toBe(true);
    expect(nudgeDue(member(), iso(-4), NOW)).toBe(false);
    expect(nudgeDue(member({ created_at: iso(-3) }), null, NOW)).toBe(false);
    expect(nudgeDue(member({ created_at: iso(-6) }), null, NOW)).toBe(true);
    expect(nudgeKind(NOW)).toBe("nudge:2026-12");
  });

  it("respects her switch and only goes to members who can use the app", () => {
    expect(nudgeDue(member(), iso(-9), NOW, false)).toBe(false);
    expect(nudgeDue(member({ status: "cancelled" }), iso(-9), NOW)).toBe(false);
    expect(nudgeDue(member({ email: "x@test.invalid" }), iso(-9), NOW)).toBe(false);
    expect(emailable({ email: "x@test.invalid", shopify_customer_id: "1" })).toBe(false);
  });
});

describe("one thing for next month", () => {
  it("follows fixed rules: a flagged change first, then a senior kidney check, then more check-ins", () => {
    expect(oneThing([cat({ openAlert: "Drinking more than usual" })], "January")).toMatch(/flagged a change.*call your vet/);
    expect(oneThing([cat({ ageYears: 12 })], "January")).toMatch(/Book Milo's kidney check/);
    expect(oneThing([cat({ checkIns: 4 })], "January")).toMatch(/Check in on Milo each day in January/);
    expect(oneThing([cat()], "January")).toMatch(/Keep the daily check-ins going in January/);
  });
});

describe("templates", () => {
  it("monthly summary: every cat, the check-in count, the report link, a way to switch it off", () => {
    const e = monthlySummaryEmail([cat(), cat({ name: "Luna", weight: "8.9 lb", breathing: "Not counted", ageYears: 3 })], { nextMonth: "December", checkInsTotal: 27, days: 30 });
    expect(e.subject).toBe("Milo and Luna's month: all steady");
    for (const body of [e.html, e.text]) {
      expect(body).toContain("27 of 30 days");
      expect(body).toContain("Luna");
      expect(body).toContain("https://app.trypurestream.com/report");
      expect(body).toMatch(/Turn it off in the app/);
      expect(body).not.toMatch(banned);
    }
  });

  it("monthly summary in the free month carries the billing notice, so it can stand in for the trial-ending email", () => {
    const e = monthlySummaryEmail([cat()], { nextMonth: "December", checkInsTotal: 27, days: 30, trialCharge: { date: "Wednesday, December 16" } });
    for (const body of [e.html, e.text]) {
      expect(body).toContain("Your free month ends Wednesday, December 16");
      expect(body).toContain("$19.95 every 30 days");
      expect(body).toMatch(/Cancel membership/);
    }
  });

  it("nudge: names the cats, links to Today, says it's at most once a month", () => {
    const e = nudgeEmail(["Milo"]);
    expect(e.subject).toBe("How's Milo drinking this week?");
    for (const body of [e.html, e.text]) {
      expect(body).toContain("https://app.trypurestream.com/today");
      expect(body).toMatch(/at most once a month/);
      expect(body).not.toMatch(banned);
    }
  });

  it("alert: the app's own headline and what-to-do, never a diagnosis", () => {
    const amber = alertEmail({ catName: "Milo", headline: "Milo has been drinking more on 5 of the last 7 check-ins.", whatToDo: "Worth a vet check this week. Not an emergency.", red: false, catId: "c1" });
    expect(amber.subject).toBe("Kidney Watch: Milo has been drinking more on 5 of the last 7 check-ins.");
    const red = alertEmail({ catName: "Milo", headline: "Milo's breathing count was 36 a minute at rest.", whatToDo: "Over 30 a minute at rest needs a vet now, any hour.", red: true, catId: "c1" });
    expect(red.text).toMatch(/worth acting on today/);
    for (const body of [amber.html, amber.text, red.html, red.text]) {
      expect(body).toContain("doesn't diagnose");
      expect(body).not.toMatch(banned);
    }
  });
});

describe("email settings", () => {
  it("accepts the two switches and still accepts older saves without them", () => {
    expect(reminderSchema.safeParse({ byEmail: true, checkinTime: "08:00", monthlySummary: false, nudge: true }).success).toBe(true);
    expect(reminderSchema.safeParse({ byEmail: true, checkinTime: "08:00" }).success).toBe(true);
    expect(reminderSchema.safeParse({ byEmail: true, checkinTime: "08:00", nudge: "yes" }).success).toBe(false);
  });

  it("summarises them on the Account row", () => {
    expect(emailsSummary(null)).toBe("All on");
    expect(emailsSummary({ monthly_summary_on: false, checkin_on: false })).toBe("Alerts only");
    expect(emailsSummary({ monthly_summary_on: true, checkin_on: false })).toBe("Summary on");
  });
});
