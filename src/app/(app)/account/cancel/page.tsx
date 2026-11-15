import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAccount } from "@/lib/account.server";
import { loadReportData } from "@/lib/report.server";
import { ALERT_TITLES } from "@/lib/report";
import { LOOP_PORTAL_URL } from "@/lib/account";
import { halfPriceCents, money } from "@/lib/cancel-flow";
import CancelFlow, { type RecordRow } from "./CancelFlow";

export const metadata = { title: "Cancel membership · AquaOne Health" };
export const dynamic = "force-dynamic";

const PRICE_CENTS = 1995;

// Boards 22.1–23.1: the in-app cancel flow. Only a member in her free month or paying gets here;
// everyone else goes back to Account, where "Manage membership" opens the store portal as before.
export default async function CancelPage() {
  const supabase = await supabaseServer();
  const a = await loadAccount(supabase);
  if (!a) return null;
  const m = a.membership;
  if (m.state !== "trial" && m.state !== "active") redirect("/account");

  const cat = a.cat;
  const report = cat ? await loadReportData(supabase, cat.id, a.tz) : null;
  const name = cat?.name ?? "your cat";
  const rows: RecordRow[] = [];
  if (report) {
    rows.push({ label: `${name}'s drinking`, value: report.drinking.checkIns ? report.drinking.label : "Not checked in yet", good: report.drinking.label === "Normal" });
    const lb = report.weight.latestLb ?? report.cat.startEstimateLb;
    rows.push({ label: `${name}'s weight`, value: lb != null ? `${report.weight.latestLb != null ? "" : "about "}${lb} lb` : "Not weighed yet" });
    const alerts = report.alerts;
    rows.push({
      label: "Changes flagged",
      value: alerts.length === 0 ? "None" : `${alerts.length} · ${(ALERT_TITLES[alerts[0].kind] ?? "a change").toLowerCase()}`,
    });
    rows.push({ label: "Vet report", value: "Ready to share" });
  }

  return (
    <CancelFlow
      catName={cat?.name ?? null}
      otherCats={a.cats.filter((c) => c.id !== cat?.id).map((c) => c.name)}
      catId={cat?.id ?? null}
      checkIns={report?.drinking.checkIns ?? 0}
      periodDays={report?.period.days ?? 30}
      rows={rows}
      chargeDate={m.date}
      priceLabel={money(PRICE_CENTS)}
      halfLabel={money(halfPriceCents(PRICE_CENTS))}
      saveLabel={money(PRICE_CENTS - halfPriceCents(PRICE_CENTS))}
      portalUrl={LOOP_PORTAL_URL}
    />
  );
}
