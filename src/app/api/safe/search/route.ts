import { memberRoute } from "@/lib/api.server";
import { searchSchema } from "@/lib/safe";
import { searchItems } from "@/lib/safe.server";

// Matches what she typed against our own list (names, other names, misspellings). Not logged:
// a lookup is logged when she opens an answer (/api/safe/lookup) or sends a photo.
export async function POST(request: Request) {
  return memberRoute("safe_search", request, searchSchema, async (supabase, input) => ({
    ok: true,
    data: { results: await searchItems(supabase, input.q) },
  }));
}
