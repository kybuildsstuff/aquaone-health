import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import OnboardingFlow from "./OnboardingFlow";

export const metadata = { title: "Welcome · AquaOne Health" };

export default async function OnboardingPage() {
  const supabase = await supabaseServer();
  const { count } = await supabase.from("cats").select("id", { count: "exact", head: true });
  if (count && count > 0) redirect("/today");
  return <OnboardingFlow />;
}
