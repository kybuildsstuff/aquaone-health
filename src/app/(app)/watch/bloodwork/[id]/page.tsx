import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getContext } from "@/lib/app-data.server";
import { explainPanel, signLabPhoto } from "@/lib/bloodwork.server";
import { BackLink } from "@/components/watch";
import ShownCat from "@/components/ShownCat";
import { PanelView } from "../PanelView";
import DeletePanel from "./DeletePanel";

export const metadata = { title: "Lab results · AquaOne Health" };
export const dynamic = "force-dynamic";

const fullDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// One lab report, explained. RLS means only her own panels are found; it may belong to another of
// her cats (an old link), so the cat's name comes from the panel.
export default async function PanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await supabaseServer();
  const ctx = await getContext(supabase);
  if (!ctx) redirect("/onboarding");
  const { data: owner } = await supabase.from("lab_panels").select("cat_id, cats(name)").eq("id", id).maybeSingle();
  if (!owner) notFound();
  const catName = (Array.isArray(owner.cats) ? owner.cats[0]?.name : (owner.cats as { name: string } | null)?.name) ?? ctx.cat.name;
  const p = await explainPanel(supabase, id, catName, ctx.today);
  if (!p) notFound();
  const photo = await signLabPhoto(p.photo_path);

  return (
    <div className="page-in flex min-h-dvh flex-col gap-4 px-5 pt-[max(20px,env(safe-area-inset-top))] pb-12">
      <ShownCat id={p.catId} />
      <header className="flex items-center gap-3">
        <BackLink href="/watch/bloodwork" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm leading-4.5 font-medium text-slate">{catName}&apos;s lab results{p.previousOn ? `, compared with ${fullDate(p.previousOn)}` : ""}</p>
          <h1 className="text-[24px] leading-7.5 font-medium tracking-[-0.02em]">{fullDate(p.taken_on)}</h1>
        </div>
      </header>
      <PanelView p={p} catName={catName} />
      <div className="flex flex-col items-center gap-3 pt-1">
        {photo ? (
          <a href={photo} target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-blue">
            See the original report
          </a>
        ) : null}
        <DeletePanel panelId={p.id} />
      </div>
    </div>
  );
}
