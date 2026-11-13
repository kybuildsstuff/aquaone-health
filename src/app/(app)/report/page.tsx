import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadOwnReport } from "@/lib/report.server";
import { pdfFileName } from "@/lib/report";
import { TabScreen } from "@/components/TabBar";
import { ReportDetails, ReportSummaryCard } from "./ReportBody";
import ShareReport from "./ShareReport";

export const metadata = { title: "Report · AquaOne Health" };
export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const own = await loadOwnReport(await supabaseServer());
  if (!own) redirect("/onboarding");
  const { report: r } = own;

  return (
    <TabScreen>
      <div className="flex flex-col gap-4 px-5 pt-[max(26px,env(safe-area-inset-top))]">
        <header className="flex flex-col gap-0.5 px-1">
          <p className="text-sm leading-4.5 font-medium text-slate">Ready for {r.cat.vet}</p>
          <h1 className="text-3xl leading-8.75 font-medium tracking-[-0.02em]">{r.cat.name}&apos;s vet report</h1>
        </header>
        <ReportSummaryCard r={r} pdfHref="/api/report/pdf" />
        <ShareReport catName={r.cat.name} vet={r.cat.vet} pdfFile={pdfFileName(r.cat.name)} activeLinks={own.activeLinks} latestLinkExpires={own.latestLinkExpires} />
        <ReportDetails r={r} />
      </div>
    </TabScreen>
  );
}
