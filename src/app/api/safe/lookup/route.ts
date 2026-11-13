import { memberRoute } from "@/lib/api.server";
import { lookupSchema } from "@/lib/safe";
import { recordSearchLookup } from "@/lib/safe.server";

// Logs a typed lookup she opened: the item she picked, or null for "not on our list".
export async function POST(request: Request) {
  return memberRoute("safe_lookup", request, lookupSchema, (supabase, input) => recordSearchLookup(supabase, input.q, input.itemId));
}
