import { z } from "zod";
import { memberRoute } from "@/lib/api.server";
import { createShareLink } from "@/lib/report.server";

// Makes a share link for her cat's vet report. Answers { path: "/r/<token>", expiresAt }.
export async function POST(request: Request) {
  return memberRoute("report_share", request, z.object({}), (supabase) => createShareLink(supabase));
}
