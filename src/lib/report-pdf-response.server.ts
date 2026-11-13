import "server-only";
import { renderReportPdf } from "@/lib/report-pdf.server";
import { pdfFileName, type Report } from "@/lib/report";

// The HTTP answer for a report PDF: never cached, never indexed, opened inline with a tidy file name.
export async function pdfResponse(report: Report, route: string): Promise<Response> {
  let bytes: Uint8Array;
  try {
    bytes = await renderReportPdf(report, report.period.to);
  } catch (e) {
    console.error(`${route}_failed render`, e instanceof Error ? e.message : String(e));
    throw e;
  }
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(report.cat.name)}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
