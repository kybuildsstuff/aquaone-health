import { memberRoute } from "@/lib/api.server";
import { catIdSchema } from "@/lib/cats";
import { selectCat } from "@/lib/cats-actions.server";

// Every cat in the house: select one of her cats (RLS keeps it to her own).
export async function POST(request: Request) {
  return memberRoute("cat_select", request, catIdSchema, (supabase, input) => selectCat(supabase, input.catId));
}
