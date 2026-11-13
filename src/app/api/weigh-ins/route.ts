import { memberRoute } from "@/lib/api.server";
import { saveWeighIn } from "@/lib/app-data.server";
import { weighInSchema } from "@/lib/kidney-watch";

// Saves a two-reading weigh-in (her alone, then holding the cat), then recomputes Kidney Watch.
export async function POST(request: Request) {
  return memberRoute("weigh_in", request, weighInSchema, (supabase, input) => saveWeighIn(supabase, input));
}
