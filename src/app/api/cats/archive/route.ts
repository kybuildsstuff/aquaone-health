import { memberRoute } from "@/lib/api.server";
import { catIdSchema } from "@/lib/cats";
import { archiveCat } from "@/lib/cats-actions.server";

// Every cat in the house: archive one of her cats (RLS keeps it to her own).
export async function POST(request: Request) {
  return memberRoute("cat_archive", request, catIdSchema, (supabase, input) => archiveCat(supabase, input.catId));
}
