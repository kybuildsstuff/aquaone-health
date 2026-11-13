import { memberRoute } from "@/lib/api.server";
import { saveCheckIn } from "@/lib/app-data.server";
import { checkInSchema } from "@/lib/kidney-watch";

// Saves today's drinking check-in (one per local day; a second tap changes it), then
// recomputes Kidney Watch and opens or resolves alerts on the server.
export async function POST(request: Request) {
  return memberRoute("check_in", request, checkInSchema, (supabase, input) => saveCheckIn(supabase, input.drinking));
}
