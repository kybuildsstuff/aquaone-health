import { z } from "zod";
import { memberRoute } from "@/lib/api.server";
import { revokeShareLinks } from "@/lib/report.server";

// Stops every live share link for her cat's report.
export async function POST(request: Request) {
  return memberRoute("report_share_revoke", request, z.object({}), (supabase) => revokeShareLinks(supabase));
}
