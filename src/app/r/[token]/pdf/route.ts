import { loadSharedReport } from "@/lib/report.server";
import { pdfResponse } from "@/lib/report-pdf-response.server";

export const dynamic = "force-dynamic";

// The PDF behind a share link: no sign-in, the token is the only key, and it opens one cat.
// Unknown, revoked or expired tokens get the same plain 404.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const shared = await loadSharedReport(token);
    if (!shared) {
      console.error("shared_report_pdf_failed not_found");
      return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
    }
    return await pdfResponse(shared.report, "shared_report_pdf");
  } catch (e) {
    console.error("shared_report_pdf_failed exception", e instanceof Error ? e.message : String(e));
    return new Response("Something went wrong", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
