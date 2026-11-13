import { memberRoute } from "@/lib/api.server";
import { catEditSchema } from "@/lib/account";
import { updateCat } from "@/lib/account.server";

// Saves the Edit cat screen to her own cat (her client, row-level security).
export async function POST(request: Request) {
  return memberRoute("account_cat", request, catEditSchema, updateCat);
}
