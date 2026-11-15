import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import OnboardingFlow from "./OnboardingFlow";
import { MAX_CATS } from "@/lib/cats";

export const metadata = { title: "Welcome · AquaOne Health" };

// ?add=1 adds another cat (Every cat in the house, up to MAX_CATS); otherwise first-time onboarding.
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const supabase = await supabaseServer();
  const { count } = await supabase.from("cats").select("id", { count: "exact", head: true }).is("archived_at", null);
  const add = (await searchParams).add === "1";
  if (add && count && count > 0) {
    if (count >= MAX_CATS) redirect("/account");
    return <OnboardingFlow addMode />;
  }
  if (count && count > 0) redirect("/today");
  return <OnboardingFlow />;
}
