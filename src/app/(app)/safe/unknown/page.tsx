import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getSafeCat, searchItems } from "@/lib/safe.server";
import { unknownMessage, type Severity } from "@/lib/safe";
import { EMERGENCY_VET_MAPS_URL } from "@/lib/cat";
import { BackLink, CheckAnotherRow, FromPhotoPill, PhoneIcon, PoisonLineButtons, SeverityBadge, SourceNote } from "../parts";

export const metadata = { title: "Is it safe? · AquaOne Health" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Not on our list (decision 6): the fixed answer, the poison lines, and any near matches to pick from.
export default async function SafeUnknown({ searchParams }: { searchParams: Promise<{ q?: string; via?: string; c?: string }> }) {
  const { q = "", via, c = "" } = await searchParams;
  const query = q.slice(0, 120);
  const supabase = await supabaseServer();
  const cat = await getSafeCat(supabase);
  const fromPhoto = via === "photo";

  // Near matches: from the photo route's candidates, or a fresh search of what she typed.
  let near: { id: string; name: string; severity: Severity }[] = [];
  const ids = c.split(",").filter((id) => UUID.test(id)).slice(0, 4);
  if (ids.length) {
    const { data, error } = await supabase.from("safety_items").select("id, name, severity").in("id", ids);
    if (error) console.error("safe_unknown_failed candidates", error.message);
    near = (data ?? []) as typeof near;
  } else if (query.trim().length >= 2) {
    near = (await searchItems(supabase, query, 4)).filter((m) => m.score >= 0.55);
  }

  return (
    <div className="flex min-h-dvh flex-col pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-3.5 bg-navy px-6 pt-[max(26px,env(safe-area-inset-top))] pb-6.5">
        <div className="flex items-center justify-between">
          <BackLink light />
          {fromPhoto && <FromPhotoPill />}
        </div>
        <div className="flex items-center gap-2 pt-1.5">
          <span className="rounded-full bg-white px-2.75 py-1.25 text-xs leading-4 font-extrabold tracking-[0.08em] text-navy">NOT ON OUR LIST</span>
        </div>
        <h1 className="text-[40px] leading-11 font-semibold tracking-[-0.02em] text-white wrap-anywhere">{query.trim() || (fromPhoto ? "Your photo" : "This one")}</h1>
        <p className="text-base leading-5.75 text-[#C9D1E3]">{unknownMessage(cat?.pronoun)}</p>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-5 pt-5">
        <PoisonLineButtons />
        <a href={EMERGENCY_VET_MAPS_URL} target="_blank" rel="noreferrer" className="flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-red text-base leading-5 font-bold text-white">
          <PhoneIcon size={17} />
          Find the nearest emergency vet
        </a>

        {near.length > 0 && (
          <div className="flex flex-col rounded-[22px] bg-white px-4.5 py-1">
            <span className="pt-3 pb-1 text-xs leading-4 font-bold tracking-[0.08em] text-[#6B7590]">{fromPhoto ? "COULD IT BE ONE OF THESE?" : "DID YOU MEAN"}</span>
            {near.map((n) => (
              <Link key={n.id} href={`/safe/item/${n.id}${fromPhoto ? "?via=photo" : ""}`} className="flex items-center justify-between gap-3 border-t border-[#F1EFEB] py-3">
                <span className="truncate text-[15px] leading-4.5 font-semibold text-navy">{n.name}</span>
                <SeverityBadge severity={n.severity} />
              </Link>
            ))}
          </div>
        )}

        <CheckAnotherRow />
        <SourceNote source="our list, built from the ASPCA Animal Poison Control lists and published veterinary guidance" />
      </div>
    </div>
  );
}
