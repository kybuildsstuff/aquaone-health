import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCat } from "@/lib/account.server";
import { CONDITIONS } from "@/lib/onboarding";
import EditCatForm from "./EditCatForm";

export const metadata = { title: "Edit cat · AquaOne Health" };
export const dynamic = "force-dynamic";

export default async function EditCatPage() {
  const cat = await loadCat(await supabaseServer());
  if (!cat) redirect("/onboarding");
  const presetIds = new Set<string>(CONDITIONS.map((c) => c.id));
  return (
    <EditCatForm
      initial={{
        name: cat.name,
        pronoun: cat.pronoun,
        ageYears: cat.age_years ?? 0,
        weight: cat.start_weight_lb,
        weightUnit: "lb",
        lives: cat.lives ?? "indoor",
        food: cat.food ?? "dry",
        conditions: cat.conditions.filter((c) => presetIds.has(c)),
        vetName: cat.vet_name ?? "",
        vetPhone: cat.vet_phone ?? "",
      }}
    />
  );
}
