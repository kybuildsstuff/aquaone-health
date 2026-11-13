import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";
import { loadOwnReport } from "@/lib/report.server";
import { pdfResponse } from "@/lib/report-pdf-response.server";

export const dynamic = "force-dynamic";

// Her own vet report as a PDF (same data as /report). Signed in and a member, like every API route.
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user?.email) {
      console.error("report_pdf_failed signed_out");
      return NextResponse.json({ error: "signed_out" }, { status: 401 });
    }
    if (!membershipAllows(await findMember(user.email)).allowed) {
      console.error("report_pdf_failed not_member", user.id);
      return NextResponse.json({ error: "not_member" }, { status: 403 });
    }
    const own = await loadOwnReport(supabase);
    if (!own) {
      console.error("report_pdf_failed no_cat", user.id);
      return NextResponse.json({ error: "no_cat" }, { status: 409 });
    }
    return await pdfResponse(own.report, "report_pdf");
  } catch (e) {
    console.error("report_pdf_failed exception", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
