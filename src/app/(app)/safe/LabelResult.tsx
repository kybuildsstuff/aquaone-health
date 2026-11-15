import Link from "next/link";
import { EMERGENCY_VET_MAPS_URL } from "@/lib/cat";
import type { Severity } from "@/lib/safe";
import { PoisonLineButtons, SeverityBadge } from "./parts";

// Label Scan's answer (Ky, 15 Nov): the product, each ingredient on our list with its level, and
// everything else plainly marked "not on our list" (which is not the same as safe).

export type LabelAnswer = {
  kind: "label";
  product: string;
  readable: "full" | "partial" | "none";
  flagged: { ingredient: string; id: string; name: string; severity: Severity; summary: string }[];
  unlisted: string[];
  listedSafe: number;
  worst: Severity | null;
  subj?: string;
};

// "safe" (green) only when every ingredient is on our list as safe; "unknown" (grey) when nothing
// worrying was found but some ingredients aren't on our list, because not listed never means safe.
const HERO: Record<Severity | "unknown", { bg: string; eyebrow: string; title: string; sub: string; text: string }> = {
  emergency: { bg: "bg-red", eyebrow: "text-[#FFE1E6]", title: "text-white", sub: "text-[#FFE1E6]", text: "Contains something dangerous to cats" },
  toxic: { bg: "bg-red", eyebrow: "text-[#FFE1E6]", title: "text-white", sub: "text-[#FFE1E6]", text: "Contains something toxic to cats" },
  mild: { bg: "bg-amber", eyebrow: "text-[#7A5300]", title: "text-amber-ink", sub: "text-[#5C4500]", text: "Contains something to be careful with" },
  safe: { bg: "bg-[#E6F6EF]", eyebrow: "text-[#14583D]", title: "text-[#0E3B29]", sub: "text-[#14583D]", text: "Every ingredient is on our list as safe for cats" },
  unknown: { bg: "bg-[#EEF0F4]", eyebrow: "text-slate", title: "text-navy", sub: "text-slate", text: "None of these ingredients are on our list. That doesn't mean they're safe: check with your vet, or ask." },
};

export default function LabelResult({ answer, onAgain }: { answer: LabelAnswer; onAgain: () => void }) {
  if (answer.readable === "none") {
    return (
      <div className="flex flex-col gap-3 rounded-[22px] bg-white p-5">
        <p className="text-[17px] leading-6 font-semibold text-navy">We couldn&apos;t read that label.</p>
        <p className="text-[15px] leading-5.5 text-slate">Try again closer, with the ingredient list flat, in focus and in good light. Or type the product or ingredient name above.</p>
        <button type="button" onClick={onAgain} className="mt-1 flex h-12 items-center justify-center rounded-full bg-navy text-[15px] font-semibold text-white">
          Scan again
        </button>
      </div>
    );
  }
  // Green only when every ingredient was read and every one is on our list as safe.
  const allSafe = answer.readable === "full" && answer.unlisted.length === 0 && answer.listedSafe > 0;
  const hero = HERO[answer.worst ?? (allSafe ? "safe" : "unknown")];
  const subj = answer.subj ?? "she";
  const heroText =
    !answer.worst && !allSafe && answer.listedSafe > 0
      ? "Nothing here is on our list as a danger, but some ingredients aren't on our list at all. That doesn't mean they're safe: check with your vet, or ask."
      : hero.text;
  const danger = answer.worst === "toxic" || answer.worst === "emergency";
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex flex-col gap-1.5 rounded-[22px] px-5 py-4.5 ${hero.bg}`}>
        <span className={`text-xs leading-4 font-bold tracking-[0.08em] ${hero.eyebrow}`}>FROM YOUR LABEL PHOTO</span>
        <h2 className={`text-[22px] leading-7 font-bold ${hero.title}`}>{answer.product}</h2>
        <p className={`text-[15px] leading-5 font-semibold ${hero.sub}`}>{heroText}</p>
      </div>

      {answer.readable === "partial" && (
        <p className="rounded-[18px] bg-amber px-4 py-3 text-sm leading-5 text-amber-ink">Part of the list was cut off or blurry, so we may have missed something. A closer photo of the whole list gives a full answer.</p>
      )}

      {answer.flagged.length > 0 && (
        <div className="flex flex-col rounded-[22px] bg-white px-4.5 py-1">
          {answer.flagged.map((f, i) => (
            <Link key={`${f.id}-${i}`} href={`/safe/item/${f.id}?via=photo`} className={`flex flex-col gap-1.5 py-3.5 ${i > 0 ? "border-t border-[#F1EFEB]" : ""}`}>
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-[15px] leading-5 font-semibold text-navy">{f.ingredient}</span>
                <SeverityBadge severity={f.severity} />
              </span>
              <span className="text-sm leading-5 text-slate">{f.summary}</span>
              <span className="text-sm leading-5 font-semibold text-blue">What to do →</span>
            </Link>
          ))}
        </div>
      )}

      {danger && (
        <div className="flex flex-col gap-2.5 rounded-[22px] bg-white p-4.5">
          <p className="text-[15px] leading-5.5 font-semibold text-navy">If {subj === "they" ? "they\u2019ve" : `${subj}\u2019s`} eaten, licked or touched it, call now:</p>
          <PoisonLineButtons />
          <a href={EMERGENCY_VET_MAPS_URL} target="_blank" rel="noopener noreferrer" className="text-center text-sm leading-5 font-semibold text-red underline">
            Find an emergency vet
          </a>
        </div>
      )}

      {answer.unlisted.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-[22px] bg-white p-4.5">
          <span className="text-xs leading-4 font-bold tracking-[0.08em] text-slate">NOT ON OUR LIST</span>
          <p className="text-sm leading-5 text-navy">{answer.unlisted.join(", ")}</p>
          <p className="text-xs leading-4.5 text-slate">Not being on our list doesn&apos;t mean an ingredient is safe. If you&apos;re unsure, ask your vet or use Ask.</p>
        </div>
      )}

      <div className="flex gap-2.5">
        <button type="button" onClick={onAgain} className="flex h-13.5 flex-1 items-center justify-center rounded-full bg-navy text-[15px] leading-4.5 font-semibold text-white">
          Scan another
        </button>
        <Link href="/ask" className="flex h-13.5 flex-1 items-center justify-center rounded-full border-[1.5px] border-line bg-white text-[15px] leading-4.5 font-semibold text-navy">
          Ask about it
        </Link>
      </div>
    </div>
  );
}
