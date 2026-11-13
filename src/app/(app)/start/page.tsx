import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

// Sends her to onboarding until she has a cat, then to Today.
export default async function Start() {
  const supabase = await supabaseServer();
  const { count } = await supabase.from("cats").select("id", { count: "exact", head: true });
  redirect(count && count > 0 ? "/today" : "/onboarding");
}
