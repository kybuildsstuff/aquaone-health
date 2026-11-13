import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getItem, getSafeCat } from "@/lib/safe.server";
import { fillCatWords } from "@/lib/safe";
import { EMERGENCY_VET_MAPS_URL, telHref, VET_MAPS_URL, vetLabel } from "@/lib/cat";
import { BackLink, CheckAnotherRow, FromPhotoPill, GoodToKnow, PhoneIcon, PoisonLineButtons, SourceNote, SproutIcon, Steps } from "../../parts";

export const metadata = { title: "Is it safe? · AquaOne Health" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One answer from our list (Paper "17 Safe? · toxic" and "18 Safe? · safe"; caution uses the amber tone).
export default async function SafeItem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ via?: string }> }) {
  const { id } = await params;
  const { via } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await supabaseServer();
  const [item, cat] = await Promise.all([getItem(supabase, id), getSafeCat(supabase)]);
  if (!item) notFound();

  const fill = (s: string) => fillCatWords(s, cat);
  const steps = fill(item.what_to_do).split("\n").map((s) => s.trim()).filter(Boolean);
  const catName = cat?.name ?? "your cat";
  const fromPhoto = via === "photo";
  const danger = item.severity === "toxic" || item.severity === "emergency";
  const vetTel = telHref(cat?.vet_phone);

  const hero = {
    emergency: { bg: "bg-red", badge: "bg-white text-red", label: "TOXIC TO CATS", title: "text-white", sub: "text-[#FFE1E6]" },
    toxic: { bg: "bg-red", badge: "bg-white text-red", label: "TOXIC TO CATS", title: "text-white", sub: "text-[#FFE1E6]" },
    mild: { bg: "bg-amber", badge: "bg-[#C98A00] text-white", label: "CAUTION", title: "text-amber-ink", sub: "text-[#5C4500]" },
    safe: { bg: "bg-[#E6F6EF]", badge: "bg-green text-white", label: "SAFE FOR CATS", title: "text-[#0E3B29]", sub: "text-[#14583D]" },
  }[item.severity];

  return (
    <div className="flex min-h-dvh flex-col pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className={`flex flex-col gap-3.5 px-6 pt-[max(26px,env(safe-area-inset-top))] pb-6.5 ${hero.bg}`}>
        <div className="flex items-center justify-between">
          <BackLink light={danger} />
          {fromPhoto && <FromPhotoPill />}
        </div>
        <div className="flex items-center gap-2 pt-1.5">
          <span className={`rounded-full px-2.75 py-1.25 text-xs leading-4 font-extrabold tracking-[0.08em] ${hero.badge}`}>{hero.label}</span>
          {item.severity === "emergency" && <span className="rounded-full bg-white/16 px-2.75 py-1.25 text-xs leading-4 font-extrabold tracking-[0.08em] text-white">EMERGENCY</span>}
        </div>
        <h1 className={`text-[40px] leading-11 font-semibold tracking-[-0.02em] ${hero.title}`}>{item.name}</h1>
        <p className={`text-base leading-5.75 ${hero.sub}`}>{fill(item.summary)}</p>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-5 pt-5">
        {danger && (
          <>
            <Steps title={`IF ${catName.toUpperCase()} TOUCHED OR ATE ANY`} steps={steps} tone="red" />
            {item.severity === "emergency" ? (
              <a href={EMERGENCY_VET_MAPS_URL} target="_blank" rel="noreferrer" className="flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-red text-base leading-5 font-bold text-white">
                <PhoneIcon size={17} />
                Find the nearest emergency vet
              </a>
            ) : vetTel ? (
              <a href={vetTel} className="flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-red text-base leading-5 font-bold text-white">
                <PhoneIcon size={17} />
                Call {vetLabel(cat?.vet_name)}
              </a>
            ) : (
              <a href={VET_MAPS_URL} target="_blank" rel="noreferrer" className="flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-red text-base leading-5 font-bold text-white">
                <PhoneIcon size={17} />
                Find a vet near you
              </a>
            )}
            <PoisonLineButtons />
            {item.category === "plant" && (
              <div className="flex items-center gap-2.5 rounded-[18px] bg-lilac-soft px-4 py-3.5">
                <SproutIcon size={16} color="#5369EE" />
                <span className="flex-1 text-sm leading-4.75 text-[#2E3F9E]">Safe swaps for a cat home: spider plants, Boston ferns, calatheas and moth orchids.</span>
              </div>
            )}
            <SourceNote source={item.source} />
          </>
        )}

        {item.severity === "mild" && (
          <>
            <Steps title={`IF ${catName.toUpperCase()} ATE SOME`} steps={steps} tone="amber" />
            <CheckAnotherRow />
            <SourceNote source={item.source} extra="If you're worried, call your vet or a poison line." />
          </>
        )}

        {item.severity === "safe" && (
          <>
            <GoodToKnow points={steps} />
            <CheckAnotherRow />
            <SourceNote source={item.source} fee={false} extra={`If ${catName} is vomiting or not eating, call your vet.`} />
          </>
        )}

        {item.scientific_name && <p className="text-center text-[11px] leading-3.75 text-[#8A93A8] italic">{item.scientific_name}</p>}
      </div>
    </div>
  );
}
