import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { membershipAllows, normaliseEmail } from "@/lib/membership";
import {
  FROM,
  REPLY_TO,
  WELCOME_CATCH_UP_DAYS,
  emailable,
  trialEndingDue,
  trialEndingEmail,
  trialEndingWindow,
  welcomeEmail,
  type EmailKind,
  type EmailMember,
  type Message,
} from "@/lib/email";

// Sending the app's emails through Resend, each logged in email_log and each sent at most once
// per member and kind: a send first claims its email_log row (a unique index on live claims),
// then calls Resend with an idempotency key, then records the outcome.

const MEMBER_COLUMNS = "id, email, shopify_customer_id, status, trial_ends_at, paid_through, created_at, auth_user_id";
type MemberWithUser = EmailMember & { auth_user_id: string | null };

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

// One email through Resend's API. Never logs the key or the body.
export async function sendViaResend(to: string, msg: Message, idempotencyKey?: string): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: msg.subject, html: msg.html, text: msg.text }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { id?: string; name?: string; message?: string } | null;
    if (!res.ok) return { ok: false, error: `resend ${res.status} ${body?.name ?? ""} ${body?.message ?? ""}`.trim() };
    return { ok: true, id: body?.id ?? null };
  } catch (e) {
    return { ok: false, error: `resend exception ${(e as Error).message}` };
  }
}

export type OnceOutcome = "sent" | "already_sent" | "not_emailable" | "failed";

// Claims (member, kind) in email_log, sends, and records the result. A second call for the
// same member and kind finds the claim and sends nothing.
export async function sendOnce(member: EmailMember, kind: EmailKind, msg: Message): Promise<OnceOutcome> {
  if (!emailable(member)) return "not_emailable";
  const admin = supabaseAdmin();
  const { data: claim, error } = await admin
    .from("email_log")
    .insert({ member_id: member.id, to_email: member.email, kind, status: "sending" })
    .select("id")
    .single();
  if (error?.code === "23505") return "already_sent";
  if (error || !claim) throw new Error(`email_log claim failed: ${error?.message ?? "no row"}`);

  const result = await sendViaResend(member.email, msg, `${kind}/${member.id}`);
  const { error: logError } = await admin
    .from("email_log")
    .update(result.ok ? { status: "sent", provider_id: result.id } : { status: "failed" })
    .eq("id", claim.id);
  if (logError) console.error("email_log_failed update", kind, member.id, logError.message);
  if (!result.ok) {
    console.error("email_send_failed", kind, member.id, result.error);
    return "failed";
  }
  console.log("email_sent", kind, member.id);
  return "sent";
}

async function memberByEmail(email: string): Promise<MemberWithUser | null> {
  const { data, error } = await supabaseAdmin().from("members").select(MEMBER_COLUMNS).eq("email", normaliseEmail(email)).maybeSingle();
  if (error) throw new Error(`members lookup failed: ${error.message}`);
  return data as MemberWithUser | null;
}

function welcomeDue(m: EmailMember, now: Date) {
  return emailable(m) && membershipAllows(m, now).allowed;
}

// Called after the Loop webhook writes a membership. Sends the welcome the first time a member
// can use the app. Never throws: a failed welcome must not make Loop retry the webhook (the
// daily run picks it up instead).
export async function sendWelcomeIfDue(email: string, now = new Date()): Promise<OnceOutcome | "not_due" | "error"> {
  try {
    const m = await memberByEmail(email);
    if (!m || !welcomeDue(m, now)) return "not_due";
    return await sendOnce(m, "welcome", welcomeEmail());
  } catch (e) {
    console.error("email_send_failed welcome exception", (e as Error).message);
    return "error";
  }
}

async function timezoneFor(authUserId: string | null): Promise<string | null> {
  if (!authUserId) return null;
  const { data } = await supabaseAdmin().from("reminder_prefs").select("timezone").eq("user_id", authUserId).maybeSingle();
  return (data?.timezone as string | undefined) ?? null;
}

export type DailyEmailSummary = { trialEnding: Record<string, number>; welcome: Record<string, number>; errors: number };

// The daily cron: trial-ending reminders, then the welcome catch-up. `onlyEmails` narrows both
// reads to the given members; the tests use it so they never touch real members' rows.
export async function runDailyEmails(now = new Date(), opts: { onlyEmails?: string[] } = {}): Promise<DailyEmailSummary> {
  const admin = supabaseAdmin();
  const summary: DailyEmailSummary = { trialEnding: {}, welcome: {}, errors: 0 };
  const count = (bucket: Record<string, number>, k: string) => (bucket[k] = (bucket[k] ?? 0) + 1);

  const { after, atMost } = trialEndingWindow(now);
  const scoped = <Q extends { in: (c: string, v: string[]) => Q }>(q: Q): Q => (opts.onlyEmails ? q.in("email", opts.onlyEmails) : q);
  const trials = await scoped(admin
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("status", "trial")
    .gt("trial_ends_at", after)
    .lte("trial_ends_at", atMost)
    .or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST"));
  if (trials.error) throw new Error(`trial members read failed: ${trials.error.message}`);
  for (const m of (trials.data ?? []) as MemberWithUser[]) {
    if (!trialEndingDue(m, now)) continue; // the same rule the query expresses, checked in code too
    try {
      count(summary.trialEnding, await sendOnce(m, "trial_ending", trialEndingEmail(m.trial_ends_at!, await timezoneFor(m.auth_user_id))));
    } catch (e) {
      summary.errors++;
      console.error("email_send_failed trial_ending exception", m.id, (e as Error).message);
    }
  }

  const since = new Date(now.getTime() - WELCOME_CATCH_UP_DAYS * 86400_000).toISOString();
  const recent = await scoped(admin
    .from("members")
    .select(MEMBER_COLUMNS)
    .gte("created_at", since)
    .or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST"));
  if (recent.error) throw new Error(`recent members read failed: ${recent.error.message}`);
  const ids = (recent.data ?? []).map((m) => m.id as string);
  const welcomed = new Set<string>();
  if (ids.length) {
    const logs = await admin.from("email_log").select("member_id").eq("kind", "welcome").in("status", ["sending", "sent"]).in("member_id", ids);
    if (logs.error) throw new Error(`email_log read failed: ${logs.error.message}`);
    for (const l of logs.data ?? []) welcomed.add(l.member_id as string);
  }
  for (const m of (recent.data ?? []) as MemberWithUser[]) {
    if (welcomed.has(m.id) || !welcomeDue(m, now)) continue;
    try {
      count(summary.welcome, await sendOnce(m, "welcome", welcomeEmail()));
    } catch (e) {
      summary.errors++;
      console.error("email_send_failed welcome exception", m.id, (e as Error).message);
    }
  }
  summary.errors += (summary.trialEnding.failed ?? 0) + (summary.welcome.failed ?? 0);
  return summary;
}
