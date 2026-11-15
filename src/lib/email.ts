// The app's own emails (decision 10: Resend, sent from our app). Pure: templates and the
// rules for who gets what and when, so they are unit-tested. Sending lives in email.server.ts.
import { safeTimezone } from "@/lib/dates";

export const APP_URL = "https://app.trypurestream.com";
export const FROM = "AquaOne Health <hello@notify.trypurestream.com>";
export const REPLY_TO = "help@trypurestream.com";
export const HELP_EMAIL = "help@trypurestream.com";
export const PRICE = "$19.95";

// "monthly:<charge date>", "nudge:<yyyy-mm>" and "alert:<alert id>" make those emails once per cycle,
// month or alert under the same unique (member, kind) claim.
export type EmailKind = "welcome" | "trial_ending" | `monthly:${string}` | `nudge:${string}` | `alert:${string}`;

export type EmailMember = {
  id: string;
  email: string;
  shopify_customer_id: string | null;
  status: "trial" | "active" | "past_due" | "cancelled" | "ended";
  trial_ends_at: string | null;
  paid_through: string | null;
  created_at: string;
};

export type Message = { subject: string; html: string; text: string };

const HOUR = 3600_000;

// Rows marked TEST are never emailed by the app (only by the opt-in live test script), and
// addresses on the reserved .invalid domain (the test suites' throwaway members) can't receive mail.
export function emailable(m: Pick<EmailMember, "email" | "shopify_customer_id">): boolean {
  if (m.shopify_customer_id === "TEST") return false;
  return !/\.invalid$/i.test(m.email.trim());
}

// Trial-ending: sent once, by the daily run, when her free month ends more than 1 and at most
// 3 days from now. With one run a day the first run inside the window is the one 2-3 days out;
// the extra day only catches a missed run. email_log's unique claim makes it exactly once.
export function trialEndingWindow(now: Date): { after: string; atMost: string } {
  return {
    after: new Date(now.getTime() + 24 * HOUR).toISOString(),
    atMost: new Date(now.getTime() + 72 * HOUR).toISOString(),
  };
}

export function trialEndingDue(m: EmailMember, now: Date): boolean {
  if (m.status !== "trial" || !m.trial_ends_at || !emailable(m)) return false;
  const ends = new Date(m.trial_ends_at).getTime();
  const { after, atMost } = trialEndingWindow(now);
  return ends > new Date(after).getTime() && ends <= new Date(atMost).getTime();
}

// Welcome catch-up (the daily run): a member who can use the app, created in the last 7 days,
// still without a welcome (the webhook send failed or the row came from the nightly reconcile).
export const WELCOME_CATCH_UP_DAYS = 7;

export function longDate(iso: string, tz?: string | null): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone(tz), weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}

// ---- Templates -------------------------------------------------------------------------------
// The look of the "Login email" design: off-white page, navy card, white pill button.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(opts: { preheader: string; heading: string; intro: string; button: { label: string; href: string }; note?: string; panels: string[] }) {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#F1EFEB;font-family:${font};color:#071D3C">
<div style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFEB"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="background:#071D3C;border-radius:24px;padding:36px 28px;text-align:center">
<img src="${APP_URL}/icon-192.png" width="64" height="64" alt="AquaOne Health" style="display:inline-block;border:0;border-radius:18px">
<h1 style="margin:22px 0 12px;font-size:28px;line-height:33px;font-weight:500;color:#FFFFFF">${esc(opts.heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#C9D1E3">${opts.intro}</p>
<a href="${esc(opts.button.href)}" style="display:block;background:#FFFFFF;color:#071D3C;text-decoration:none;font-size:17px;font-weight:600;line-height:56px;border-radius:999px">${esc(opts.button.label)}</a>
${opts.note ? `<p style="margin:16px 0 0;font-size:13px;line-height:18px;color:#8A93A8">${opts.note}</p>` : ""}
</td></tr>
${opts.panels.map((p) => `<tr><td style="height:12px"></td></tr><tr><td style="background:#FFFFFF;border-radius:18px;padding:20px 22px;font-size:15px;line-height:22px">${p}</td></tr>`).join("\n")}
<tr><td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:18px;color:#8A93A8">AquaOne Health by PureStream. Questions? Just reply, or write to <a href="mailto:${HELP_EMAIL}" style="color:#5369EE">${HELP_EMAIL}</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

const label = (s: string) => `<div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:#5369EE;margin-bottom:8px">${s}</div>`;

export function welcomeEmail(): Message {
  const signIn = `${APP_URL}/sign-in`;
  const inside = [
    "A daily care plan built for your cat",
    "Kidney Watch: a quick daily check-in that learns their normal drinking",
    "Ask: questions about your cat, any hour",
    "Is it safe? for plants, foods and household things",
    "A vet report you can share in one tap",
  ];
  const html = layout({
    preheader: "Your cat's health companion is ready. Sign in with your email, no password.",
    heading: "You're in.",
    intro: "AquaOne Health, your cat's own health companion, comes with your AquaOne. Tap below and enter this email address. We'll send you a 6-digit code. No password, no app store.",
    button: { label: "Open AquaOne Health", href: signIn },
    note: `Or go to ${APP_URL.replace("https://", "")} on your phone.`,
    panels: [
      `${label("PUT IT ON YOUR HOME SCREEN")}On iPhone, open the link in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. On Android, open it in Chrome, tap the <b>&#8942;</b> menu, then <b>Add to Home screen</b>. It then opens like an app.`,
      `${label("WHAT'S INSIDE")}${inside.map((i) => `&middot; ${i}`).join("<br>")}`,
      `<span style="color:#5B6478">Free for your first 30 days, then ${PRICE} every 30 days. Cancel any time from Account in the app. AquaOne Health is guidance, not a vet: if you're worried about your cat right now, call your vet.</span>`,
    ],
  });
  const text = [
    "You're in.",
    "",
    "AquaOne Health, your cat's own health companion, comes with your AquaOne. Open the link below and enter this email address. We'll send you a 6-digit code. No password, no app store.",
    "",
    `Open AquaOne Health: ${signIn}`,
    "",
    "Put it on your Home Screen: on iPhone, open the link in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome, tap the menu, then Add to Home screen.",
    "",
    "What's inside:",
    ...inside.map((i) => `- ${i}`),
    "",
    `Free for your first 30 days, then ${PRICE} every 30 days. Cancel any time from Account in the app.`,
    "AquaOne Health is guidance, not a vet: if you're worried about your cat right now, call your vet.",
    "",
    `Questions? Just reply, or write to ${HELP_EMAIL}.`,
  ].join("\n");
  return { subject: "Your AquaOne Health is ready", html, text };
}

export function trialEndingEmail(trialEndsAt: string, tz?: string | null): Message {
  // Without her timezone, the date is given in Hawaii time: the earliest calendar date anywhere in
  // the US, so "cancel before <date>" is never a day too late for her (audit, 15 Nov).
  const date = longDate(trialEndsAt, tz ?? "Pacific/Honolulu");
  const account = `${APP_URL}/account`;
  const html = layout({
    preheader: `Your free month ends ${date}. Then ${PRICE} every 30 days.`,
    heading: `Your free month ends ${date}`,
    intro: `From then, AquaOne Health is ${PRICE} every 30 days, on the card you used for your AquaOne. If you'd like to keep it, there's nothing to do.`,
    button: { label: "Manage or cancel", href: account },
    note: "In the app: Account, then Cancel membership.",
    panels: [
      `${label("IF YOU'D RATHER STOP")}Open Account in the app and tap <b>Cancel membership</b> before ${date}, and you won't be charged. You keep full access until then.`,
    ],
  });
  const text = [
    `Your free month ends ${date}.`,
    "",
    `From then, AquaOne Health is ${PRICE} every 30 days, on the card you used for your AquaOne. If you'd like to keep it, there's nothing to do.`,
    "",
    `If you'd rather stop: open Account in the app and tap Cancel membership before ${date}, and you won't be charged. You keep full access until then.`,
    account,
    "",
    `Questions? Just reply, or write to ${HELP_EMAIL}.`,
  ].join("\n");
  return { subject: `Your free month of AquaOne Health ends ${date}`, html, text };
}

// ---- Retention v1 emails (Ky, 15 Nov): monthly summary, nudge, Kidney Watch alert -------------------
// Only five kinds of email ever go out: welcome, trial ending, these three. No daily or weekly email.

const DAY = 24 * HOUR;

// The next charge: the end of the free month while in trial, the paid-through date once paying.
export function nextChargeAt(m: Pick<EmailMember, "status" | "trial_ends_at" | "paid_through">): string | null {
  if (m.status === "trial") return m.trial_ends_at ?? m.paid_through;
  if (m.status === "active") return m.paid_through ?? m.trial_ends_at;
  return null;
}

// Monthly summary: once per billing cycle, when the next charge is more than 2 and at most 3 days
// away (the daily run finds it once; a missed run is caught the next day by the once-only claim).
export function monthlyWindow(now: Date): { after: string; atMost: string } {
  return { after: new Date(now.getTime() + 2 * DAY).toISOString(), atMost: new Date(now.getTime() + 4 * DAY).toISOString() };
}

export function monthlyDue(m: EmailMember, now: Date, prefsOn = true): boolean {
  const at = nextChargeAt(m);
  if (!prefsOn || !at || !emailable(m)) return false;
  const t = new Date(at).getTime();
  const { after, atMost } = monthlyWindow(now);
  return t > new Date(after).getTime() && t <= new Date(atMost).getTime();
}

export const monthlyKind = (m: Pick<EmailMember, "status" | "trial_ends_at" | "paid_through">) => `monthly:${(nextChargeAt(m) ?? "").slice(0, 10)}` as const;

// Nudge: one email when none of her cats has had a check-in for 5 days, at most once a calendar
// month, never in her first 5 days, only while she can use the app and has it switched on.
export const NUDGE_QUIET_DAYS = 5;

export function nudgeDue(m: EmailMember, lastCheckInAt: string | null, now: Date, prefsOn = true): boolean {
  if (!prefsOn || !emailable(m) || (m.status !== "trial" && m.status !== "active")) return false;
  if (now.getTime() - new Date(m.created_at).getTime() < NUDGE_QUIET_DAYS * DAY) return false;
  const last = lastCheckInAt ? new Date(lastCheckInAt).getTime() : new Date(m.created_at).getTime();
  return now.getTime() - last >= NUDGE_QUIET_DAYS * DAY;
}

export const nudgeKind = (now: Date) => `nudge:${now.toISOString().slice(0, 7)}` as const;

export type SummaryCat = {
  name: string;
  checkIns: number;
  drinking: string;
  weight: string;
  breathing: string;
  steady: boolean;
  ageYears: number | null;
  openAlert: string | null;
};

const tile = (k: string, v: string, good: boolean) =>
  `<td style="background:#13294B;border-radius:12px;padding:9px 10px;width:33%"><div style="font-size:11px;line-height:14px;color:#8FA0C4">${esc(k)}</div><div style="font-size:14px;line-height:18px;font-weight:600;color:${good ? "#7FE0B4" : "#FFFFFF"}">${esc(v)}</div></td>`;

// "One thing for next month": from fixed rules, never from the model, and never a diagnosis.
export function oneThing(cats: SummaryCat[], month: string): string {
  const flagged = cats.find((c) => c.openAlert);
  if (flagged) return `${flagged.name}'s Kidney Watch has flagged a change (${flagged.openAlert!.toLowerCase()}). If it carries on, call your vet and share the report.`;
  const senior = cats.filter((c) => (c.ageYears ?? 0) >= 11).sort((a, b) => (b.ageYears ?? 0) - (a.ageYears ?? 0))[0];
  if (senior) return `Book ${senior.name}'s kidney check. Cats 11 and over are usually checked every 6 to 12 months, and the report is ready to bring.`;
  const quiet = cats.find((c) => c.checkIns < 10);
  if (quiet) return `Check in on ${quiet.name} each day in ${month}. The more check-ins, the sooner Kidney Watch learns ${quiet.name}'s normal.`;
  return `Keep the daily check-ins going in ${month}. A steady record is what makes a change easy to spot.`;
}

export function monthlySummaryEmail(cats: SummaryCat[], opts: { nextMonth: string; checkInsTotal: number; days: number; trialCharge?: { date: string } | null }): Message {
  const names = cats.map((c) => c.name);
  const who = names.length <= 1 ? (names[0] ?? "Your cat") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const steady = cats.every((c) => c.steady);
  const subject = `${who}'s month${steady ? ": all steady" : ""}`;
  const headline = steady ? (cats.length > 1 ? "A steady month for all of them." : `${who} had a steady month.`) : "Here's how the month went.";
  const intro = `You checked in on ${opts.checkInsTotal} of ${opts.days} days.${steady ? " Drinking, weight and breathing all stayed in their normal range." : ""}`;
  const thing = oneThing(cats, opts.nextMonth);
  const report = `${APP_URL}/report`;
  const catBlocks = cats
    .map((c) => `<div style="margin:14px 0 6px;font-size:13px;font-weight:600;color:#FFFFFF;text-align:left">${esc(c.name)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 -6px"><tr>${tile("Drinking", c.drinking, c.drinking === "Normal")}${tile("Weight", c.weight, c.steady)}${tile("Breathing", c.breathing, c.steady && c.breathing !== "Not counted")}</tr></table>`)
    .join("");
  const billing = opts.trialCharge
    ? `<span style="color:#5B6478">Your free month ends ${esc(opts.trialCharge.date)}. From then it's ${PRICE} every 30 days; there's nothing to do to keep it. To stop, open Account in the app and tap <b>Cancel membership</b> before ${esc(opts.trialCharge.date)}.</span>`
    : null;
  const html = layout({
    preheader: `${intro} One thing for ${opts.nextMonth}: ${thing}`,
    heading: headline,
    intro: `${esc(intro)}${catBlocks}`,
    button: { label: "Open the vet report", href: report },
    panels: [`${label(`ONE THING FOR ${opts.nextMonth.toUpperCase()}`)}${esc(thing)}`, ...(billing ? [billing] : []), `<span style="color:#8A93A8;font-size:13px">You're getting this once a month as an AquaOne Health member. Turn it off in the app under Account, then Emails.</span>`],
  });
  const text = [
    headline,
    "",
    intro,
    "",
    ...cats.map((c) => `${c.name}: drinking ${c.drinking}, weight ${c.weight}, breathing ${c.breathing}`),
    "",
    `One thing for ${opts.nextMonth}: ${thing}`,
    "",
    `Open the vet report: ${report}`,
    ...(opts.trialCharge ? ["", `Your free month ends ${opts.trialCharge.date}. From then it's ${PRICE} every 30 days; there's nothing to do to keep it. To stop, open Account in the app and tap Cancel membership before ${opts.trialCharge.date}.`] : []),
    "",
    "You're getting this once a month as an AquaOne Health member. Turn it off in the app under Account, then Emails.",
  ].join("\n");
  return { subject, html, text };
}

export function nudgeEmail(catNames: string[]): Message {
  const who = catNames.length === 1 ? catNames[0] : catNames.length > 1 ? `${catNames.slice(0, -1).join(", ")} and ${catNames.at(-1)}` : "your cat";
  const today = `${APP_URL}/today`;
  const heading = `We haven't heard about ${who} in ${NUDGE_QUIET_DAYS} days`;
  const intro = `Kidney Watch learns ${catNames.length > 1 ? "each cat's" : `${who}'s`} normal from your check-ins. One tap tells us how much ${who === "your cat" ? "they" : who} drank today: less, normal or more.`;
  const html = layout({
    preheader: intro,
    heading,
    intro: esc(intro),
    button: { label: "Check in now", href: today },
    panels: [`<span style="color:#8A93A8;font-size:13px">We send this at most once a month. Turn it off in the app under Account, then Emails.</span>`],
  });
  const text = [heading, "", intro, "", `Check in now: ${today}`, "", "We send this at most once a month. Turn it off in the app under Account, then Emails."].join("\n");
  return { subject: `How's ${who} drinking this week?`, html, text };
}

// The Kidney Watch alert email reuses the app's own alert wording (headline and what-to-do), never
// new medical copy (brief: retention-v1, rulings). Red alerts lead with calling the vet.
export function alertEmail(opts: { catName: string; headline: string; whatToDo: string; red: boolean; catId: string }): Message {
  const url = `${APP_URL}/watch`;
  const heading = opts.headline;
  const html = layout({
    preheader: `Kidney Watch: ${opts.headline}`,
    heading,
    intro: esc(opts.red ? `This is worth acting on today. ${opts.whatToDo}` : opts.whatToDo),
    button: { label: "See what to do", href: url },
    panels: [`<span style="color:#8A93A8;font-size:13px">AquaOne Health doesn't diagnose. If ${esc(opts.catName)} seems unwell, call your vet. Kidney Watch alerts are always on.</span>`],
  });
  const text = [heading, "", opts.red ? `This is worth acting on today. ${opts.whatToDo}` : opts.whatToDo, "", `See what to do: ${url}`, "", `AquaOne Health doesn't diagnose. If ${opts.catName} seems unwell, call your vet.`].join("\n");
  return { subject: `Kidney Watch: ${opts.headline}`, html, text };
}
