import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { findMember, linkMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";

// Every app screen sits behind this: signed in, and a member with access today.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) redirect("/sign-in");

  const member = await findMember(user.email);
  if (!membershipAllows(member).allowed) redirect("/membership-ended");
  if (member && !member.auth_user_id) await linkMember(user.id, user.email);

  return <>{children}</>;
}
