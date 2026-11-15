import { z } from "zod";
import { memberRoute } from "@/lib/api.server";
import { deletePanel } from "@/lib/bloodwork.server";

// Deletes one of her lab panels, its results and its photo.
export async function POST(request: Request) {
  return memberRoute("bloodwork_delete", request, z.object({ panelId: z.string().uuid() }), (supabase, input) => deletePanel(supabase, input.panelId));
}
