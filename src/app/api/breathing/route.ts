import { memberRoute } from "@/lib/api.server";
import { saveBreathing } from "@/lib/app-data.server";
import { breathingSchema } from "@/lib/kidney-watch";

// Saves a 30-second sleeping breathing count as breaths a minute, then recomputes Kidney Watch.
export async function POST(request: Request) {
  return memberRoute("breathing", request, breathingSchema, (supabase, input) => saveBreathing(supabase, input.breaths));
}
