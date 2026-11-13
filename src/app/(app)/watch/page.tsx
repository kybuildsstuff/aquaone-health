import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadWatch } from "@/lib/screens.server";
import { statusLine } from "@/lib/kidney-watch-copy";
import { BREATHING_RED_OVER } from "@/lib/kidney-watch";
import { relativeDay } from "@/lib/dates";
import { Check, Drop } from "@/components/ui";
import { TabScreen } from "@/components/TabBar";
import { LearningRing } from "@/components/watch";

export const metadata = { title: "Kidney Watch · AquaOne Health" };
export const dynamic = "force-dynamic";

const DOT = { normal: "bg-[#C9D1FB]", more: "bg-blue", less: "bg-navy" } as const;

export default async function Watch() {
  const k = await loadWatch(await supabaseServer());
  if (!k) redirect("/onboarding");
  const { cat, status } = k;
  const line = statusLine(status, cat);
  const age = cat.age_years == null ? null : Number(cat.age_years);
  const daysWithCheckIn = k.last14.filter((d) => d.drinking).length;

  const drinkingLabel =
    status.status === "learning"
      ? { text: `${status.checkins_total} ${status.checkins_total === 1 ? "day" : "days"} so far`, cls: "text-navy" }
      : status.reasons.includes("drinking_more")
        ? { text: "More than usual", cls: "text-[#B07A00]" }
        : status.reasons.includes("drinking_less")
          ? { text: "Less than usual", cls: "text-[#B07A00]" }
          : { text: "Normal", cls: "text-green" };
  const drinkingAlert = status.reasons.includes("drinking_more") || status.reasons.includes("drinking_less");

  const latestWeight = k.weighIns.at(-1);
  const weightDown = status.reasons.includes("weight_down_5pct");
  const pct = status.weight_change_pct;
  const weightNote = !latestWeight
    ? { text: "Weigh in once to start", cls: "text-slate font-medium" }
    : weightDown
      ? { text: `Down ${Math.abs(pct!)}% in 4 weeks`, cls: "text-[#B07A00]" }
      : pct != null
        ? { text: pct > 0 ? `Up ${pct}% in 4 weeks` : "Steady over 4 weeks", cls: "text-green" }
        : { text: `Weighed ${relativeDay(latestWeight.date, k.today)}`, cls: "text-slate font-medium" };

  const breathRed = k.breathing != null && k.breathing.bpm > BREATHING_RED_OVER;

  return (
    <TabScreen>
      <header className="flex flex-col gap-0.5 px-6 pt-[max(26px,env(safe-area-inset-top))]">
        <p className="text-sm leading-4.5 font-medium text-slate">
          {status.status === "learning" ? `Day ${k.dayNumber} · building ${cat.name}'s baseline` : `Learned from ${status.checkins_total} days of check-ins`}
        </p>
        <h1 className="text-3xl leading-8.75 font-medium tracking-[-0.02em]">Kidney Watch</h1>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-4.5">
        {status.status === "amber" || status.status === "red" ? (
          <div className={`flex flex-col gap-3 rounded-3xl border-[1.5px] px-5 py-4.5 ${status.status === "red" ? "border-red bg-[#FDECEE]" : "border-[#F2C94C] bg-amber"}`}>
            <div className="flex items-center gap-3.5">
              <span className={`flex size-13 shrink-0 items-center justify-center rounded-full ${status.status === "red" ? "bg-[#B4233A33]" : "bg-[#F2C94C59]"}`}>
                <span className={`flex size-8.5 items-center justify-center rounded-full text-lg font-extrabold ${status.status === "red" ? "bg-red text-white" : "bg-[#F2C94C] text-amber-ink"}`}>!</span>
              </span>
              <span className="flex flex-col gap-0.75">
                <span className={`text-xl leading-6.25 font-semibold ${status.status === "red" ? "text-[#5C1020]" : "text-amber-ink"}`}>{line.title}</span>
                <span className={`text-sm leading-4.75 ${status.status === "red" ? "text-[#7A1F2E]" : "text-[#5C4500]"}`}>{line.sub}</span>
              </span>
            </div>
            <Link
              href="/watch/alert"
              className={`flex h-11.5 items-center justify-center rounded-full text-[15px] font-semibold ${status.status === "red" ? "bg-red text-white" : "bg-amber-ink text-amber"}`}
            >
              See what to do
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-3xl bg-navy px-5 py-4.5">
            {status.status === "learning" ? (
              <LearningRing done={status.checkins_total} />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#1F9D6B33]">
                <span className="flex size-10 items-center justify-center rounded-full bg-green">
                  <Check size={16} color="#071D3C" />
                </span>
              </span>
            )}
            <span className="flex flex-col gap-1">
              <span className="text-xl leading-6.25 font-semibold text-white">{line.title}</span>
              <span className="text-sm leading-5 text-[#B9C3DA]">{line.sub}</span>
            </span>
          </div>
        )}

        <div className={`flex flex-col gap-3 rounded-[22px] bg-white px-4.5 py-4 ${drinkingAlert ? "border-[1.5px] border-[#F2C94C]" : ""}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Drop size={13} color="#5369EE" />
              <span className="text-[15px] leading-4.5 font-bold">Drinking</span>
            </span>
            <span className={`text-[13px] leading-4 font-semibold ${drinkingLabel.cls}`}>{drinkingLabel.text}</span>
          </div>
          <div className="flex items-center justify-between" aria-label={`${daysWithCheckIn} check-ins in the last 14 days`}>
            {k.last14.map((d, i) => (
              <span
                key={d.date}
                title={`${d.date}: ${d.drinking ?? "no check-in"}`}
                className={`size-4 shrink-0 rounded-full ${d.drinking ? DOT[d.drinking] : i === 13 ? "border-2 border-blue bg-white" : "bg-line"}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {(["normal", "more", "less"] as const).map((x) => (
              <span key={x} className="flex items-center gap-1.5 text-xs leading-4 text-slate">
                <span className={`size-2 rounded-full ${DOT[x]}`} />
                {x.charAt(0).toUpperCase() + x.slice(1)}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-xs leading-4 text-slate">
              <span className="size-2 rounded-full bg-line" />
              Missed
            </span>
            <span className="ml-auto text-xs leading-4 text-[#8A93A8]">Last 14 days</span>
          </div>
        </div>

        <div className="flex gap-3">
          <div className={`flex flex-1 flex-col gap-2 rounded-[22px] bg-white p-4 ${weightDown ? "border-[1.5px] border-[#F2C94C]" : ""}`}>
            <span className="text-[13px] leading-4 font-bold">Weight</span>
            <span className="text-2xl leading-7 font-semibold tracking-[-0.01em]">
              {latestWeight ? (
                <>
                  {latestWeight.catLb.toFixed(1)} <span className="text-[14px] font-medium text-slate">lb</span>
                </>
              ) : (
                "—"
              )}
            </span>
            <Sparkline values={k.weighIns.map((x) => x.catLb)} />
            <span className={`text-xs leading-4 font-semibold ${weightNote.cls}`}>{weightNote.text}</span>
            <Link href="/watch/weigh-in" className="flex justify-center rounded-xl bg-lilac-soft py-2.25 text-[13px] leading-4 font-semibold text-[#2E3F9E]">
              {latestWeight ? "Weigh in" : "Weigh in now"}
            </Link>
          </div>
          <div className={`flex flex-1 flex-col gap-2 rounded-[22px] bg-white p-4 ${breathRed ? "border-[1.5px] border-red" : ""}`}>
            <span className="text-[13px] leading-4 font-bold">Breathing</span>
            <span className="text-2xl leading-7 font-semibold tracking-[-0.01em]">
              {k.breathing ? (
                <>
                  {k.breathing.bpm} <span className="text-[14px] font-medium text-slate">/min</span>
                </>
              ) : (
                "—"
              )}
            </span>
            <div className="flex flex-col gap-1 py-1.25">
              <div className="relative flex h-1.5 overflow-hidden rounded-full bg-[#EFEDE9]">
                <span className="absolute inset-y-0 left-1/3 w-1/3 bg-[#C9F0DE]" />
                {k.breathing ? (
                  <span
                    className={`absolute top-0 size-1.5 rounded-full ${breathRed ? "bg-red" : "bg-green"}`}
                    style={{ left: `${Math.min(97, (k.breathing.bpm / 45) * 100)}%` }}
                  />
                ) : null}
              </div>
              <span className="text-[11px] leading-3.5 text-[#8A93A8]">Normal 15–30</span>
            </div>
            <span className={`text-xs leading-4 font-semibold ${!k.breathing ? "font-medium text-slate" : breathRed ? "text-red" : "text-green"}`}>
              {!k.breathing ? "Count once to start" : `${breathRed ? "Over 30" : "Normal"}, ${relativeDay(k.breathing.date, k.today)}`}
            </span>
            <Link href="/watch/breathing" className="flex justify-center rounded-xl bg-lilac-soft py-2.25 text-[13px] leading-4 font-semibold text-[#2E3F9E]">
              Count now
            </Link>
          </div>
        </div>

        {age != null && age >= 7 ? (
          <div className="flex items-center gap-3.5 rounded-[22px] bg-lilac-soft px-4.5 py-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-white">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                <rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="#5369EE" strokeWidth="2" />
                <path d="M4 10h16M9 3v4M15 3v4" stroke="#5369EE" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] leading-4.5 font-bold">Kidney check due</span>
              <span className="text-[13px] leading-4.5 text-[#2E3F9E]">At {Math.floor(age)}, vets suggest a blood and urine check every 6–12 months.</span>
            </span>
          </div>
        ) : null}

        <p className="px-2.5 py-0.5 text-center text-xs leading-4.25 text-[#8A93A8]">
          Not a diagnosis. If something shifts, we&apos;ll tell you calmly and help you prepare for the vet.
        </p>
      </div>
    </TabScreen>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <svg width="100%" height="30" viewBox="0 0 130 30" preserveAspectRatio="none" aria-hidden>
        <path d="M2 15 H128" stroke="#E4E2DE" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="128" cy="15" r="3" fill={values.length ? "#5369EE" : "#E4E2DE"} />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.5); // a flat line for small wobbles
  const pts = values.map((v, i) => [2 + (i * 126) / (values.length - 1), 26 - ((v - min) / span) * 20] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width="100%" height="30" viewBox="0 0 130 30" preserveAspectRatio="none" aria-hidden>
      <path d={pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} fill="none" stroke="#5369EE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="4" fill="#5369EE" />
    </svg>
  );
}
