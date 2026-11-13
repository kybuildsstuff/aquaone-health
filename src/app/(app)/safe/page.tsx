import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getSafeCat, recentLookups } from "@/lib/safe.server";
import { POISON_LINES } from "@/lib/safe";
import { capital, words } from "@/lib/cat";
import { TabScreen } from "@/components/TabBar";
import { PhoneIcon, SeverityBadge, SproutIcon } from "./parts";
import SafeSearch from "./SafeSearch";

export const metadata = { title: "Is it safe? · AquaOne Health" };
export const dynamic = "force-dynamic";

const TILES = [
  { href: "/safe/browse/plant", label: "Plants", icon: <SproutIcon /> },
  {
    href: "/safe/browse/food",
    label: "Foods",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 11h14l-1.5 8a2 2 0 0 1-2 1.6h-7a2 2 0 0 1-2-1.6zM8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#C98A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/safe/browse/household",
    label: "Household",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M9 3h6v4l2 3v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10l2-3z" fill="none" stroke="#5369EE" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/safe/browse/medicine",
    label: "Medicines",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="4" y="9" width="16" height="7" rx="3.5" transform="rotate(-45 12 12.5)" fill="none" stroke="#D9485F" strokeWidth="2" />
        <path d="M9.2 9.7l5 5" stroke="#D9485F" strokeWidth="2" />
      </svg>
    ),
  },
];

export default async function SafeHome() {
  const supabase = await supabaseServer();
  const cat = await getSafeCat(supabase);
  const recent = cat ? await recentLookups(supabase, cat.id) : [];
  const subj = capital(words(cat?.pronoun).subj);

  return (
    <TabScreen>
      <div className="flex flex-col gap-4.5 px-5 pt-[max(26px,env(safe-area-inset-top))]">
        <header className="flex flex-col gap-0.5 px-1">
          <p className="text-sm leading-4.5 font-medium text-slate">Plants, foods, cleaning products</p>
          <h1 className="text-3xl leading-8.75 font-medium tracking-[-0.02em]">Is it safe for {cat?.name ?? "your cat"}?</h1>
        </header>

        <SafeSearch>
          <div className="grid grid-cols-4 gap-2.5">
            {TILES.map((t) => (
              <Link key={t.href} href={t.href} className="flex flex-col items-center gap-2 rounded-[18px] bg-white py-3.5">
                {t.icon}
                <span className="text-[13px] leading-4 font-semibold text-navy">{t.label}</span>
              </Link>
            ))}
          </div>

          {recent.length > 0 && (
            <div className="flex flex-col rounded-[22px] bg-white px-4.5 py-1">
              <span className="pt-3 pb-1 text-xs leading-4 font-bold tracking-[0.08em] text-[#6B7590]">RECENTLY CHECKED</span>
              {recent.map((r) => (
                <Link
                  key={r.itemId ?? `q-${r.query}`}
                  href={r.itemId ? `/safe/item/${r.itemId}` : `/safe/unknown?q=${encodeURIComponent(r.query)}`}
                  className="flex items-center justify-between gap-3 border-t border-[#F1EFEB] py-3"
                >
                  <span className="truncate text-[15px] leading-4.5 font-semibold text-navy">{r.label}</span>
                  {r.severity ? <SeverityBadge severity={r.severity} /> : <span className="shrink-0 text-[11px] font-bold tracking-[0.06em] text-slate">NOT LISTED</span>}
                </Link>
              ))}
            </div>
          )}

          <a href={POISON_LINES[0].tel} className="flex items-center gap-3.5 rounded-[20px] bg-[#FDECEE] px-4 py-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#D9485F]">
              <PhoneIcon />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm leading-4.5 font-bold text-[#8E2335]">{subj} already ate something?</span>
              <span className="text-[13px] leading-4 text-[#5A1F2A]">Call the ASPCA poison line, 24/7 · {POISON_LINES[0].phone}</span>
              <span className="text-[11px] leading-3.75 text-[#7A3A45]">A consultation fee applies.</span>
            </span>
          </a>
        </SafeSearch>
      </div>
    </TabScreen>
  );
}
