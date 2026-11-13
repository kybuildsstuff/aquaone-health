import { memberRoute } from "@/lib/api.server";
import { setCareTaskDone } from "@/lib/app-data.server";
import { careTaskSchema } from "@/lib/kidney-watch";

// Ticks or unticks one of today's care tasks.
export async function POST(request: Request) {
  return memberRoute("care_plan", request, careTaskSchema, (supabase, input) => setCareTaskDone(supabase, input.taskId, input.done));
}
