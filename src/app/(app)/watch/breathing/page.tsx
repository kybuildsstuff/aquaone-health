import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getContext } from "@/lib/app-data.server";
import BreathingCounter from "./BreathingCounter";

export const metadata = { title: "Breathing count · AquaOne Health" };
export const dynamic = "force-dynamic";

export default async function BreathingPage() {
  const ctx = await getContext(await supabaseServer());
  if (!ctx) redirect("/onboarding");
  return <BreathingCounter catName={ctx.cat.name} pronoun={ctx.cat.pronoun} />;
}
