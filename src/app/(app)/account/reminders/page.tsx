import { supabaseServer } from "@/lib/supabase/server";
import { loadPrefs } from "@/lib/account.server";
import RemindersForm from "./RemindersForm";

export const metadata = { title: "Reminders · AquaOne Health" };
export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const prefs = data.user ? await loadPrefs(supabase, data.user.id) : null;
  const time = (prefs?.checkin_time ?? "08:00").slice(0, 5);
  return <RemindersForm initial={{ byEmail: prefs?.by_email ?? true, checkinTime: (["08:00", "12:00", "19:00"].includes(time) ? time : "08:00") as "08:00" }} />;
}
