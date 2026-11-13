import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { membershipAllows, normaliseEmail, type GateResult, type MemberRow } from "@/lib/membership";

export async function findMember(email: string): Promise<(MemberRow & { id: string; auth_user_id: string | null }) | null> {
  const { data, error } = await supabaseAdmin()
    .from("members")
    .select("id, status, paid_through, trial_ends_at, auth_user_id")
    .eq("email", normaliseEmail(email))
    .maybeSingle();
  if (error) throw new Error(`members lookup failed: ${error.message}`);
  return data;
}

// Links the member row to the signed-in auth user the first time she signs in.
export async function linkMember(userId: string, email: string) {
  const { error } = await supabaseAdmin()
    .from("members")
    .update({ auth_user_id: userId })
    .eq("email", normaliseEmail(email))
    .is("auth_user_id", null);
  if (error) throw new Error(`members link failed: ${error.message}`);
}

export async function gateForEmail(email: string): Promise<GateResult> {
  return membershipAllows(await findMember(email));
}
