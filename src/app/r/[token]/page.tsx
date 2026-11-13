import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSharedReport } from "@/lib/report.server";
import { dayLabel } from "@/lib/report";
import { ReportDetails, ReportSummaryCard } from "@/app/(app)/report/ReportBody";

// The public, read-only report behind a share link: no sign-in, one cat, nothing else reachable.
// Unknown, revoked and expired links all get the same 404. Never indexed; the token never
// leaves in a Referer header.
export const metadata: Metadata = {
  title: "Vet report · AquaOne Health",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let shared: Awaited<ReturnType<typeof loadSharedReport>>;
  try {
    shared = await loadSharedReport(token);
  } catch (e) {
    console.error("shared_report_failed exception", e instanceof Error ? e.message : String(e));
    throw e;
  }
  if (!shared) {
    console.error("shared_report_failed not_found");
    notFound();
  }
  const r = shared.report;
  const pdfHref = `/r/${token}/pdf`;

  return (
    <div className="flex min-h-dvh flex-col gap-4 px-5 pt-[max(26px,env(safe-area-inset-top))] pb-12">
      <header className="flex flex-col gap-0.5 px-1">
        <p className="text-sm leading-4.5 font-medium text-slate">Shared by {r.cat.name}&apos;s owner · AquaOne Health</p>
        <h1 className="text-3xl leading-8.75 font-medium tracking-[-0.02em]">{r.cat.name}&apos;s vet report</h1>
      </header>
      <ReportSummaryCard r={r} pdfHref={pdfHref} />
      <a href={pdfHref} className="flex h-13.5 items-center justify-center rounded-full bg-navy text-[15px] leading-4.5 font-semibold text-white">
        Open the PDF
      </a>
      <ReportDetails r={r} />
      <p className="px-2.5 text-center text-xs leading-4.25 text-[#8A93A8]">
        Recorded at home by {r.cat.name}&apos;s owner. This link stops working on {dayLabel(shared.expiresAt.slice(0, 10), true)}.
      </p>
    </div>
  );
}
