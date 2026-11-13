import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { listCategory } from "@/lib/safe.server";
import { CATEGORY_LABEL, isCategory } from "@/lib/safe";
import { TabScreen } from "@/components/TabBar";
import { BackLink, SeverityBadge } from "../../parts";

export const metadata = { title: "Is it safe? · AquaOne Health" };
export const dynamic = "force-dynamic";

// Everything on our list in one category, A to Z (the category tiles on the Safe? home).
export default async function SafeBrowse({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const items = await listCategory(await supabaseServer(), category);

  return (
    <TabScreen>
      <div className="flex flex-col gap-4 px-5 pt-[max(26px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <BackLink />
          <div className="flex flex-col">
            <h1 className="text-3xl leading-8.75 font-medium tracking-[-0.02em]">{CATEGORY_LABEL[category]}</h1>
            <p className="text-sm leading-4.5 font-medium text-slate">{items.length} on our list · search to jump to one</p>
          </div>
        </div>
        <div className="flex flex-col rounded-[22px] bg-white px-4.5 py-1">
          {items.map((it, i) => (
            <Link key={it.id} href={`/safe/item/${it.id}`} className={`flex items-center justify-between gap-3 py-3 ${i > 0 ? "border-t border-[#F1EFEB]" : ""}`}>
              <span className="truncate text-[15px] leading-4.5 font-semibold text-navy">{it.name}</span>
              <SeverityBadge severity={it.severity} />
            </Link>
          ))}
        </div>
      </div>
    </TabScreen>
  );
}
