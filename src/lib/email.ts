// The app's own emails (decision 10: Resend, sent from our app). Pure: templates and the
// rules for who gets what and when, so they are unit-tested. Sending lives in email.server.ts.
import { safeTimezone } from "@/lib/dates";

export const APP_URL = "https://app.trypurestream.com";
export const FROM = "AquaOne Health <hello@notify.trypurestream.com>";
export const REPLY_TO = "help@trypurestream.com";
export const HELP_EMAIL = "help@trypurestream.com";
export const PRICE = "$19.95";

export type EmailKind = "welcome" | "trial_ending";

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
  const date = longDate(trialEndsAt, tz);
  const account = `${APP_URL}/account`;
  const html = layout({
    preheader: `Your free month ends ${date}. Then ${PRICE} every 30 days.`,
    heading: `Your free month ends ${date}`,
    intro: `From then, AquaOne Health is ${PRICE} every 30 days, on the card you used for your AquaOne. If you'd like to keep it, there's nothing to do.`,
    button: { label: "Manage or cancel", href: account },
    note: "In the app: Account, then Manage or cancel membership.",
    panels: [
      `${label("IF YOU'D RATHER STOP")}Open Account in the app and tap <b>Manage or cancel membership</b> before ${date}, and you won't be charged. You keep full access until then.`,
    ],
  });
  const text = [
    `Your free month ends ${date}.`,
    "",
    `From then, AquaOne Health is ${PRICE} every 30 days, on the card you used for your AquaOne. If you'd like to keep it, there's nothing to do.`,
    "",
    `If you'd rather stop: open Account in the app and tap Manage or cancel membership before ${date}, and you won't be charged. You keep full access until then.`,
    account,
    "",
    `Questions? Just reply, or write to ${HELP_EMAIL}.`,
  ].join("\n");
  return { subject: `Your free month of AquaOne Health ends ${date}`, html, text };
}
