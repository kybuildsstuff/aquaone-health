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
import type { SupabaseClient } from "@supabase/supabase-js";
import { banner, reasonHeadline } from "@/lib/kidney-watch-copy";
import type { KwReason, KwStatus } from "@/lib/kidney-watch";
import type { Pronoun } from "@/lib/cat";
import { alertEmail, longDate, monthlyDue, monthlyKind, monthlySummaryEmail, nudgeDue, nudgeKind, nudgeEmail, nextChargeAt, type SummaryCat } from "@/lib/email";
import { loadReportData } from "@/lib/report.server";

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
  // Read in pages (the API returns at most 1,000 rows per request), soonest trial end first, so if a
  // very large day runs out of time the members closest to their charge are emailed first; the
  // window spans two daily runs and sends are once-only, so the next run picks up the rest.
  const trials: MemberWithUser[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await scoped(admin
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("status", "trial")
      .gt("trial_ends_at", after)
      .lte("trial_ends_at", atMost)
      .or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST"))
      .order("trial_ends_at")
      .order("id")
      .range(from, from + 999);
    if (page.error) throw new Error(`trial members read failed: ${page.error.message}`);
    trials.push(...((page.data ?? []) as MemberWithUser[]));
    if (!page.data || page.data.length < 1000) break;
  }
  for (const m of trials) {
    if (!trialEndingDue(m, now)) continue; // the same rule the query expresses, checked in code too
    try {
      count(summary.trialEnding, await sendOnce(m, "trial_ending", trialEndingEmail(m.trial_ends_at!, await timezoneFor(m.auth_user_id))));
    } catch (e) {
      summary.errors++;
      console.error("email_send_failed trial_ending exception", m.id, (e as Error).message);
    }
  }

  const since = new Date(now.getTime() - WELCOME_CATCH_UP_DAYS * 86400_000).toISOString();
  const recent: MemberWithUser[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await scoped(admin
      .from("members")
      .select(MEMBER_COLUMNS)
      .gte("created_at", since)
      .or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST"))
      .order("id")
      .range(from, from + 999);
    if (page.error) throw new Error(`recent members read failed: ${page.error.message}`);
    recent.push(...((page.data ?? []) as MemberWithUser[]));
    if (!page.data || page.data.length < 1000) break;
  }
  const ids = recent.map((m) => m.id);
  const welcomed = new Set<string>();
  // Ids go in chunks: a thousand ids in one URL is too long for the API.
  for (let i = 0; i < ids.length; i += 150) {
    const logs = await admin.from("email_log").select("member_id").eq("kind", "welcome").in("status", ["sending", "sent"]).in("member_id", ids.slice(i, i + 150));
    if (logs.error) throw new Error(`email_log read failed: ${logs.error.message}`);
    for (const l of logs.data ?? []) welcomed.add(l.member_id as string);
  }
  for (const m of recent) {
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

// ---- Retention v1 -------------------------------------------------------------------------------------

// A Kidney Watch alert that just opened, emailed once per alert. Called from recomputeKidneyWatch
// with her own session (which already proved she owns the cat). Never throws.
export async function emailNewAlert(supabase: SupabaseClient, catId: string, reason: KwReason, status: KwStatus, alertId: string): Promise<OnceOutcome | "skipped" | "error"> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const email = auth.user?.email;
    if (!email) return "skipped";
    const [m, cat] = await Promise.all([memberByEmail(email), supabase.from("cats").select("name, pronoun").eq("id", catId).maybeSingle()]);
    if (!m || !cat.data || !membershipAllows(m).allowed) return "skipped";
    const words = { name: cat.data.name as string, pronoun: cat.data.pronoun as Pronoun };
    const red = reason === "breathing_over_30";
    const b = banner(status, words);
    const whatToDo = red ? "Over 30 a minute at rest needs a vet now, any hour." : (b?.level === "amber" ? b.sub : "Worth a vet check this week. Not an emergency.");
    return await sendOnce(m, `alert:${alertId}`, alertEmail({ catName: words.name, headline: reasonHeadline(reason, status, words), whatToDo, red, catId }));
  } catch (e) {
    console.error("email_send_failed alert exception", alertId, (e as Error).message);
    return "error";
  }
}

type Prefs = { monthly_summary_on: boolean; checkin_on: boolean; timezone: string | null };

async function prefsFor(authUserId: string | null): Promise<Prefs> {
  if (!authUserId) return { monthly_summary_on: true, checkin_on: true, timezone: null };
  const { data } = await supabaseAdmin().from("reminder_prefs").select("monthly_summary_on, checkin_on, timezone").eq("user_id", authUserId).maybeSingle();
  return { monthly_summary_on: data?.monthly_summary_on ?? true, checkin_on: data?.checkin_on ?? true, timezone: (data?.timezone as string | undefined) ?? null };
}

async function catsOf(authUserId: string) {
  const { data, error } = await supabaseAdmin().from("cats").select("id, name, age_years").eq("owner_id", authUserId).is("archived_at", null).order("created_at");
  if (error) throw new Error(`cats read failed: ${error.message}`);
  return (data ?? []) as { id: string; name: string; age_years: number | null }[];
}

export type RetentionSummary = { monthly: Record<string, number>; nudge: Record<string, number>; errors: number };

// The daily cron's retention half: the monthly summary 3 days before each charge, and the
// 5-day nudge. Reads only trial and active members; `onlyEmails` scopes it for the tests.
export async function runRetentionEmails(now = new Date(), opts: { onlyEmails?: string[] } = {}): Promise<RetentionSummary> {
  const admin = supabaseAdmin();
  const summary: RetentionSummary = { monthly: {}, nudge: {}, errors: 0 };
  const count = (bucket: Record<string, number>, k: string) => (bucket[k] = (bucket[k] ?? 0) + 1);
  const members: MemberWithUser[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from("members").select(MEMBER_COLUMNS).in("status", ["trial", "active"]).not("auth_user_id", "is", null).or("shopify_customer_id.is.null,shopify_customer_id.neq.TEST");
    if (opts.onlyEmails) q = q.in("email", opts.onlyEmails);
    const page = await q.order("id").range(from, from + 999);
    if (page.error) throw new Error(`members read failed: ${page.error.message}`);
    members.push(...((page.data ?? []) as MemberWithUser[]));
    if (!page.data || page.data.length < 1000) break;
  }

  for (const m of members) {
    try {
      const prefs = await prefsFor(m.auth_user_id);
      const tz = prefs.timezone ?? "America/New_York";
      const cats = await catsOf(m.auth_user_id!);
      if (!cats.length) continue;

      if (monthlyDue(m, now, prefs.monthly_summary_on)) {
        const rows: SummaryCat[] = [];
        let total = 0;
        let days = 30;
        for (const c of cats) {
          const r = await loadReportData(admin, c.id, tz, now);
          if (!r) continue;
          days = r.period.days;
          total = Math.max(total, r.drinking.checkIns);
          const open = r.alerts.find((a) => !a.resolvedOn);
          const lb = r.weight.latestLb;
          rows.push({
            name: c.name,
            checkIns: r.drinking.checkIns,
            drinking: r.drinking.checkIns ? r.drinking.label : "No check-ins",
            weight: lb != null ? `${lb} lb` : "Not weighed",
            breathing: r.breathing.latest ? `${r.breathing.latest.bpm}/min` : "Not counted",
            steady: !open && r.breathing.red.length === 0 && (r.weight.changePct == null || r.weight.changePct > -5) && r.drinking.label === "Normal",
            ageYears: c.age_years,
            openAlert: open ? open.title : null,
          });
        }
        if (rows.length) {
          const charge = nextChargeAt(m)!;
          const nextMonth = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long" }).format(new Date(new Date(charge).getTime() + 86_400_000));
          // In the free month this email also carries the billing notice, and counts as the trial-ending
          // email, so she gets one email that week rather than two.
          const trialCharge = m.status === "trial" ? { date: longDate(charge, tz) } : null;
          const outcome = await sendOnce(m, monthlyKind(m), monthlySummaryEmail(rows, { nextMonth, checkInsTotal: total, days, trialCharge }));
          count(summary.monthly, outcome);
          if (outcome === "sent" && trialCharge) {
            await admin.from("email_log").insert({ member_id: m.id, to_email: m.email, kind: "trial_ending", status: "sent", provider_id: "in-monthly-summary" });
          }
        }
      }

      if (prefs.checkin_on) {
        const { data: last } = await admin.from("check_ins").select("created_at").in("cat_id", cats.map((c) => c.id)).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (nudgeDue(m, (last?.created_at as string | undefined) ?? null, now, true)) {
          count(summary.nudge, await sendOnce(m, nudgeKind(now), nudgeEmail(cats.map((c) => c.name))));
        }
      }
    } catch (e) {
      summary.errors++;
      console.error("email_send_failed retention exception", m.id, (e as Error).message);
    }
  }
  summary.errors += (summary.monthly.failed ?? 0) + (summary.nudge.failed ?? 0);
  return summary;
}
