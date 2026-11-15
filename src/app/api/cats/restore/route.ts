import { memberRoute } from "@/lib/api.server";
import { catIdSchema } from "@/lib/cats";
import { restoreCat } from "@/lib/cats-actions.server";

// Every cat in the house: restore one of her cats (RLS keeps it to her own).
export async function POST(request: Request) {
  return memberRoute("cat_restore", request, catIdSchema, (supabase, input) => restoreCat(supabase, input.catId));
}
