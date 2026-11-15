import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadBloodwork } from "@/lib/bloodwork.server";
import { BackLink } from "@/components/watch";
import ShownCat from "@/components/ShownCat";
import CatSwitcher from "@/components/CatSwitcher";
import AddLabReport from "./AddLabReport";

export const metadata = { title: "Bloodwork · AquaOne Health" };
export const dynamic = "force-dynamic";

const fullDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// Bloodwork, explained (Ky, 15 Nov): her chosen cat's lab reports, newest first.
export default async function BloodworkPage() {
  const b = await loadBloodwork(await supabaseServer());
  if (!b) redirect("/onboarding");

  return (
    <div key={b.cat.id} className="page-in flex min-h-dvh flex-col gap-4 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-12">
      <ShownCat id={b.cat.id} />
      <header className="flex items-center gap-3">
        <BackLink href="/watch" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm leading-4.5 font-medium text-slate">Explained in plain English</p>
          <h1 className="text-[26px] leading-8 font-medium tracking-[-0.02em]">{b.cat.name}&apos;s bloodwork</h1>
        </div>
      </header>
      <CatSwitcher cats={b.cats} currentId={b.cat.id} />

      <AddLabReport catName={b.cat.name} first={b.panels.length === 0} />

      {b.panels.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-[22px] bg-white px-5 py-4.5">
          <p className="text-[16px] leading-6 font-semibold">How it works</p>
          <p className="text-[15px] leading-[22px] text-[#2D3748]">
            Take a photo of the results sheet from the vet, flat and in good light. We read each result, say what it measures, and next time show what moved, with a few questions to take to your vet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col rounded-[22px] bg-white px-4.5 py-1">
          {b.panels.map((p, i) => (
            <Link key={p.id} href={`/watch/bloodwork/${p.id}`} className={`flex items-center gap-3 py-3.5 ${i ? "border-t border-[#EFEDE9]" : ""}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] leading-5.5 font-semibold">
                  {fullDate(p.taken_on)}
                  {p.lab_name ? <span className="font-normal text-slate"> · {p.lab_name}</span> : null}
                </span>
                <span className={`text-[13px] leading-4.5 ${p.outside ? "font-semibold text-[#B07A00]" : "text-slate"}`}>
                  {p.results} {p.results === 1 ? "result" : "results"}
                  {p.outside ? ` · ${p.outside} outside the lab's range` : ""}
                </span>
              </span>
              <span className="text-[15px] font-semibold text-blue">Open</span>
            </Link>
          ))}
        </div>
      )}

      <p className="px-2.5 text-center text-xs leading-4.25 text-[#8A93A8]">
        Not a diagnosis. We explain what each test measures and how it moved; your vet reads what it means for {b.cat.name}.
      </p>
    </div>
  );
}
