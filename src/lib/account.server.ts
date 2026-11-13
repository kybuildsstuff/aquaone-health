import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findMember } from "@/lib/members.server";
import { safeTimezone } from "@/lib/dates";
import type { ActionResult } from "@/lib/app-data.server";
import { catUpdate, membershipView, type CatEdit, type ReminderInput } from "@/lib/account";

// Account reads and writes. Her cat and reminder settings go through HER client (row-level
// security); the members row is read with the service role, as everywhere else (findMember).

export type AccountCat = {
  id: string;
  name: string;
  pronoun: "he" | "she" | "they";
  age_years: number | null;
  start_weight_lb: number | null;
  lives: "indoor" | "outdoor" | "both" | null;
  food: "dry" | "wet" | "mix" | null;
  conditions: string[];
  vet_name: string | null;
  vet_phone: string | null;
};

const CAT_COLUMNS = "id, name, pronoun, age_years, start_weight_lb, lives, food, conditions, vet_name, vet_phone";

export async function loadCat(supabase: SupabaseClient): Promise<AccountCat | null> {
  const { data, error } = await supabase.from("cats").select(CAT_COLUMNS).order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(`cat read failed: ${error.message}`);
  if (!data) return null;
  return {
    ...(data as AccountCat),
    age_years: data.age_years == null ? null : Number(data.age_years),
    start_weight_lb: data.start_weight_lb == null ? null : Number(data.start_weight_lb),
  };
}

export async function loadPrefs(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("reminder_prefs").select("by_email, checkin_time, timezone").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`reminder_prefs read failed: ${error.message}`);
  return data as { by_email: boolean; checkin_time: string; timezone: string } | null;
}

export async function loadAccount(supabase: SupabaseClient) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) return null;
  const [cat, prefs, member] = await Promise.all([loadCat(supabase), loadPrefs(supabase, user.id), findMember(user.email)]);
  const tz = safeTimezone(prefs?.timezone);
  return { email: user.email, cat, prefs, tz, membership: membershipView(member, tz) };
}

// Saves her edits to her own cat. The cat is found with her client, so another member's cat
// can never be the target; the update is also scoped by owner through RLS.
export async function updateCat(supabase: SupabaseClient, input: CatEdit): Promise<ActionResult<{ catId: string }>> {
  const cat = await loadCat(supabase);
  if (!cat) return { ok: false, status: 409, error: "no_cat" };
  const { data, error } = await supabase.from("cats").update(catUpdate(input, cat.conditions)).eq("id", cat.id).select("id");
  if (error) return { ok: false, status: 500, error: "save_failed", detail: error.message };
  if (!data?.length) return { ok: false, status: 409, error: "no_cat" };
  return { ok: true, data: { catId: cat.id } };
}

export async function updateReminders(supabase: SupabaseClient, input: ReminderInput): Promise<ActionResult<Record<string, never>>> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, status: 401, error: "signed_out" };
  const { error } = await supabase
    .from("reminder_prefs")
    .upsert({ user_id: auth.user.id, by_email: input.byEmail, by_text: false, checkin_time: input.checkinTime });
  if (error) return { ok: false, status: 500, error: "save_failed", detail: error.message };
  return { ok: true, data: {} };
}
