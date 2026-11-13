import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAlert } from "@/lib/screens.server";
import { EMERGENCY_VET_MAPS_URL, VET_MAPS_URL, capital, telHref, vetLabel, words } from "@/lib/cat";
import { weekdayShort } from "@/lib/dates";
import type { KwReason } from "@/lib/kidney-watch";
import { BackLink } from "@/components/watch";
import { Check } from "@/components/ui";

export const metadata = { title: "What to do · AquaOne Health" };
export const dynamic = "force-dynamic";

const AMBER_TITLE: Record<Exclude<KwReason, "breathing_over_30">, (n: string) => string> = {
  drinking_more: (n) => `${n} is drinking more`,
  drinking_less: (n) => `${n} is drinking less`,
  weight_down_5pct: (n) => `${n} has lost weight`,
};

export default async function AlertPage() {
  const a = await loadAlert(await supabaseServer());
  if (!a) redirect("/onboarding");
  const { cat, status } = a;
  const w = words(cat.pronoun);
  const vet = vetLabel(cat.vet_name);
  const tel = telHref(cat.vet_phone);

  if (status.status === "red") {
    return (
      <div className="flex min-h-dvh flex-col bg-[#FDECEE] px-5 pt-[max(20px,env(safe-area-inset-top))] pb-10">
        <div className="pt-2">
          <BackLink href="/watch" />
        </div>
        <p className="pt-6 text-xs font-extrabold tracking-[0.08em] text-red">GO TO A VET NOW</p>
        <h1 className="pt-2 text-[30px] leading-[35px] font-medium tracking-[-0.02em] text-[#5C1020]">{cat.name} needs a vet now</h1>
        <p className="pt-3 text-[17px] leading-6 text-[#7A1F2E]">
          {capital(w.poss)} breathing count was {status.latest_breaths} a minute at rest. Over 30 at rest is a reason to see a vet now, any hour. Don&apos;t wait for
          morning.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a href={EMERGENCY_VET_MAPS_URL} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center rounded-full bg-red text-[17px] font-semibold text-white">
            Find an emergency vet
          </a>
          {tel ? (
            <a href={tel} className="flex h-14 items-center justify-center rounded-full bg-white text-[17px] font-semibold text-[#5C1020]">
              Call {vet}
            </a>
          ) : null}
        </div>
        <div className="mt-6 flex flex-col gap-2 rounded-[22px] bg-white px-4.5 py-4">
          <p className="text-[15px] font-bold">On the way</p>
          <p className="text-[14px] leading-5 text-slate">
            Keep {w.obj} calm and somewhere quiet. Use a carrier, and call ahead so the clinic is ready. If {w.subj === "they" ? "they're" : `${w.subj}'s`} breathing with{" "}
            {w.poss} mouth open, go straight away.
          </p>
        </div>
        {status.reasons.length > 1 ? (
          <p className="mt-4 px-1 text-[14px] leading-5 text-[#7A1F2E]">Kidney Watch also noticed a change in drinking or weight. Mention it to the vet.</p>
        ) : null}
        <div className="mt-auto flex flex-col items-center gap-2 pt-8">
          <Link href="/watch/breathing" className="text-[15px] font-semibold text-[#7A1F2E] underline underline-offset-4">
            Counted while {w.subj} {w.subj === "they" ? "were" : "was"} awake? Count again while {w.isAsleep}.
          </Link>
          <p className="text-center text-[13px] text-[#8A93A8]">Guidance, not a diagnosis. Your vet has the final word.</p>
        </div>
      </div>
    );
  }

  const reasons = status.reasons.filter((r): r is Exclude<KwReason, "breathing_over_30"> => r !== "breathing_over_30");
  if (status.status !== "amber" || reasons.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-10">
        <div className="pt-2">
          <BackLink href="/watch" />
        </div>
        <h1 className="pt-6 text-[30px] leading-[35px] font-medium tracking-[-0.02em]">Nothing needs doing</h1>
        <p className="pt-3 text-[17px] leading-6 text-slate">Kidney Watch hasn&apos;t noticed anything that needs a vet. Keep the daily check-in going.</p>
      </div>
    );
  }

  const first = reasons[0];
  const drinkingKind = first === "drinking_less" ? "less" : "more";
  const drinkingCount = drinkingKind === "more" ? status.more_in_last_7 : status.less_in_last_7;

  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-10">
      <div className="pt-2">
        <BackLink href="/watch" />
      </div>
      <h1 className="pt-6 pb-4 text-[30px] leading-[35px] font-medium tracking-[-0.02em]">{AMBER_TITLE[first](cat.name)}</h1>

      <div className="flex flex-col gap-3">
        {first !== "weight_down_5pct" ? (
          <div className="flex flex-col gap-3 rounded-[22px] bg-white px-4.5 py-4">
            <div className="flex h-20 items-end justify-between gap-2">
              {a.last7.map((c) => {
                const hit = c.drinking === drinkingKind;
                return (
                  <span key={c.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className={`w-full rounded-xl ${hit ? "h-14 bg-blue" : "h-6 bg-[#C9D1FB]"}`} />
                    <span className="text-[11px] font-semibold text-slate">{weekdayShort(c.date)}</span>
                  </span>
                );
              })}
            </div>
            <p className="text-[14px] leading-5">
              <span className="font-bold">
                {drinkingCount} &quot;{drinkingKind}&quot; days
              </span>{" "}
              <span className="text-slate">in the last 7 check-ins.</span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 rounded-[22px] bg-white px-4.5 py-4">
            <p className="text-[26px] font-semibold tracking-tight">Down {Math.abs(status.weight_change_pct ?? 0)}%</p>
            <p className="text-[14px] text-slate">Against the weigh-in about 4 weeks earlier.</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-[22px] bg-lilac-soft px-4.5 py-4">
          <p className="text-xs font-bold tracking-[0.08em] text-blue">WHY IT&apos;S WORTH A CHECK</p>
          {reasons.map((r) => (
            <p key={r} className="text-[15px] leading-5.5">
              {r === "drinking_more"
                ? `Drinking more has many causes, from warm weather or a food change to ${w.poss} kidneys, thyroid or blood sugar. Only a vet can tell which, and early is easier.`
                : r === "drinking_less"
                  ? `Drinking less can come from a food change or more water in wet food, or from not feeling well. Only a vet can tell which.`
                  : `Slow weight loss has many causes, from diet to teeth, thyroid or kidneys. Only a vet can tell which, and early is easier.`}
            </p>
          ))}
        </div>

        <div className="flex flex-col rounded-[22px] bg-white px-4.5 py-1">
          <Step n={1} text="Book a vet visit this week" action={tel ? { href: tel, label: `Call ${vet}` } : { href: VET_MAPS_URL, label: "Find a vet", external: true }} />
          <Step n={2} text={reasons.includes("weight_down_5pct") ? "Weigh in again next week" : "Keep the daily check-in going"} />
          <Step done text="Kidney Watch keeps watching" />
        </div>

        <p className="px-1 pt-1 text-[14px] leading-5 text-[#8E2335]">
          <span className="font-bold">Go to a vet now, any hour,</span> if {w.subj} {w.subj === "they" ? "stop" : "stops"} eating, {w.subj === "they" ? "keep" : "keeps"}{" "}
          vomiting, or {w.subj === "they" ? "strain" : "strains"} to pee with little coming out.
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        {tel ? (
          <a href={tel} className="flex h-14 items-center justify-center rounded-full bg-navy text-[17px] font-semibold text-white">
            Call {vet}
          </a>
        ) : (
          <a href={VET_MAPS_URL} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center rounded-full bg-navy text-[17px] font-semibold text-white">
            Find a vet near me
          </a>
        )}
        <p className="text-center text-[13px] text-[#8A93A8]">Guidance, not a diagnosis. Your vet has the final word.</p>
      </div>
    </div>
  );
}

function Step({ n, text, done, action }: { n?: number; text: string; done?: boolean; action?: { href: string; label: string; external?: boolean } }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#F1EFEB] py-3.5 last:border-b-0">
      {done ? (
        <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-green">
          <Check />
        </span>
      ) : (
        <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] font-bold text-white">{n}</span>
      )}
      <span className="flex-1 text-[15px] font-semibold">{text}</span>
      {action ? (
        <a href={action.href} {...(action.external ? { target: "_blank", rel: "noreferrer" } : {})} className="text-[13px] font-bold text-blue">
          {action.label}
        </a>
      ) : null}
    </div>
  );
}
