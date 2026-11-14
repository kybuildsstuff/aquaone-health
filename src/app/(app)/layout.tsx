import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { findMember, linkMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";

// Every app screen sits behind this: signed in, and a member with access today.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  const userId = data?.claims.sub;
  if (!email || !userId) redirect("/sign-in");

  const member = await findMember(email);
  if (!membershipAllows(member).allowed) redirect("/membership-ended");
  if (member && !member.auth_user_id) await linkMember(userId, email);

  return <>{children}</>;
}
