import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getContext } from "@/lib/app-data.server";
import WeighInFlow from "./WeighInFlow";

export const metadata = { title: "Weigh-in · AquaOne Health" };
export const dynamic = "force-dynamic";

export default async function WeighInPage() {
  const supabase = await supabaseServer();
  const ctx = await getContext(supabase);
  if (!ctx) redirect("/onboarding");
  const { data: last } = await supabase
    .from("weigh_ins")
    .select("date, cat_lb")
    .eq("cat_id", ctx.cat.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return <WeighInFlow catName={ctx.cat.name} lastLb={last ? Number(last.cat_lb) : null} />;
}
