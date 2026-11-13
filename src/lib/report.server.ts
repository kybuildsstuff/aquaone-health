import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getContext, type ActionResult } from "@/lib/app-data.server";
import { addDays, localDate, safeTimezone } from "@/lib/dates";
import { buildReport, reportPeriod, REPORT_DAYS, SHARE_LINK_DAYS, SHARE_TOKEN_BYTES, SHARE_TOKEN_PATTERN, type Report, type ReportInput } from "@/lib/report";

const fail = (status: number, error: string, detail?: string) => ({ ok: false as const, status, error, detail });

export const hashShareToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
export const newShareToken = () => randomBytes(SHARE_TOKEN_BYTES).toString("base64url");

// Reads one cat's report rows. Every query is pinned to catId: with her own client RLS also
// limits it to her cats; with the service role (the public share page) catId is the only
// scope, and it comes from a valid share link, never from the request.
export async function loadReportData(client: SupabaseClient, catId: string, tz: string, at: Date = new Date(), days = REPORT_DAYS): Promise<Report | null> {
  const today = localDate(tz, at);
  const { from, to } = reportPeriod(today, days);
  // Timestamps are read a day wider on each side, then cut to her local days in buildReport.
  const fromTs = `${addDays(from, -1)}T00:00:00Z`;
  const toTs = `${addDays(to, 2)}T00:00:00Z`;

  const [cat, checkIns, weighIns, breathing, alerts] = await Promise.all([
    client
      .from("cats")
      .select("id, name, pronoun, age_years, breed, lives, food, conditions, vet_name, vet_phone, start_weight_lb")
      .eq("id", catId)
      .maybeSingle(),
    client.from("check_ins").select("date, drinking").eq("cat_id", catId).gte("date", from).lte("date", to),
    client.from("weigh_ins").select("date, cat_lb, created_at").eq("cat_id", catId).gte("date", from).lte("date", to),
    client.from("breathing_counts").select("taken_at, breaths_per_min").eq("cat_id", catId).gte("taken_at", fromTs).lt("taken_at", toTs),
    client
      .from("alerts")
      .select("kind, level, opened_at, resolved_at")
      .eq("cat_id", catId)
      .lt("opened_at", toTs)
      .or(`resolved_at.is.null,resolved_at.gte.${fromTs}`),
  ]);
  if (cat.error) throw new Error(`report cat read failed: ${cat.error.message}`);
  for (const [name, r] of [["check_ins", checkIns], ["weigh_ins", weighIns], ["breathing_counts", breathing], ["alerts", alerts]] as const) {
    if (r.error) throw new Error(`report ${name} read failed: ${r.error.message}`);
  }
  if (!cat.data) return null;

  return buildReport(
    {
      cat: cat.data as ReportInput["cat"],
      tz,
      today,
      checkIns: (checkIns.data ?? []) as ReportInput["checkIns"],
      weighIns: (weighIns.data ?? []) as ReportInput["weighIns"],
      breathing: (breathing.data ?? []) as ReportInput["breathing"],
      alerts: (alerts.data ?? []) as ReportInput["alerts"],
    },
    days,
  );
}

// Her own report, with her own session (RLS applies).
export async function loadOwnReport(supabase: SupabaseClient, at: Date = new Date()) {
  const ctx = await getContext(supabase, at);
  if (!ctx) return null;
  const [report, links] = await Promise.all([
    loadReportData(supabase, ctx.cat.id, ctx.tz, at),
    supabase
      .from("report_shares")
      .select("expires_at")
      .eq("cat_id", ctx.cat.id)
      .is("revoked_at", null)
      .gt("expires_at", at.toISOString())
      .order("expires_at", { ascending: false }),
  ]);
  if (links.error) throw new Error(`report_shares read failed: ${links.error.message}`);
  if (!report) return null;
  return { report, activeLinks: links.data?.length ?? 0, latestLinkExpires: (links.data?.[0]?.expires_at as string | undefined) ?? null };
}

// The cat a share token opens, or null when it is malformed, unknown, revoked or expired.
// Service role, justified: the person opening the link is not signed in, so RLS has no user
// to scope by. The token hash is the whole authority, and it yields exactly one cat id.
export async function resolveShareToken(token: string, at: Date = new Date()): Promise<{ catId: string; expiresAt: string } | null> {
  if (!SHARE_TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await supabaseAdmin()
    .from("report_shares")
    .select("cat_id, expires_at")
    .eq("token_hash", hashShareToken(token))
    .is("revoked_at", null)
    .gt("expires_at", at.toISOString())
    .maybeSingle();
  if (error) throw new Error(`share lookup failed: ${error.message}`);
  return data ? { catId: data.cat_id as string, expiresAt: data.expires_at as string } : null;
}

// The report behind a share link, in the owner's timezone. Null means "not found" (404).
export async function loadSharedReport(token: string, at: Date = new Date()) {
  const share = await resolveShareToken(token, at);
  if (!share) return null;
  const admin = supabaseAdmin();
  const { data: cat, error } = await admin.from("cats").select("owner_id").eq("id", share.catId).maybeSingle();
  if (error) throw new Error(`shared cat read failed: ${error.message}`);
  if (!cat) return null;
  const { data: prefs } = await admin.from("reminder_prefs").select("timezone").eq("user_id", cat.owner_id).maybeSingle();
  const report = await loadReportData(admin, share.catId, safeTimezone(prefs?.timezone), at);
  return report ? { report, expiresAt: share.expiresAt } : null;
}

// Makes a new share link for her cat, with her own session (RLS: only her own cat, as herself).
export async function createShareLink(supabase: SupabaseClient, at: Date = new Date()): Promise<ActionResult<{ path: string; expiresAt: string }>> {
  const ctx = await getContext(supabase, at);
  if (!ctx) return fail(409, "no_cat");
  const token = newShareToken();
  const expiresAt = new Date(at.getTime() + SHARE_LINK_DAYS * 86400000).toISOString();
  const { error } = await supabase
    .from("report_shares")
    .insert({ cat_id: ctx.cat.id, created_by: ctx.userId, token_hash: hashShareToken(token), expires_at: expiresAt });
  if (error) return fail(500, "save_failed", `report_share_insert: ${error.message}`);
  return { ok: true, data: { path: `/r/${token}`, expiresAt } };
}

// Stops every live link for her cat.
export async function revokeShareLinks(supabase: SupabaseClient, at: Date = new Date()): Promise<ActionResult<{ revoked: number }>> {
  const ctx = await getContext(supabase, at);
  if (!ctx) return fail(409, "no_cat");
  const { data, error } = await supabase
    .from("report_shares")
    .update({ revoked_at: at.toISOString() })
    .eq("cat_id", ctx.cat.id)
    .is("revoked_at", null)
    .select("id");
  if (error) return fail(500, "save_failed", `report_share_revoke: ${error.message}`);
  return { ok: true, data: { revoked: data?.length ?? 0 } };
}
