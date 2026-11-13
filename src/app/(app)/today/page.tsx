import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadToday } from "@/lib/screens.server";
import { banner } from "@/lib/kidney-watch-copy";
import { words } from "@/lib/cat";
import { Drop } from "@/components/ui";
import { TabScreen } from "@/components/TabBar";
import { AlertBanner } from "@/components/watch";
import CheckInCard from "./CheckInCard";
import CarePlanCard from "./CarePlanCard";

export const metadata = { title: "Today · AquaOne Health" };
export const dynamic = "force-dynamic";

export default async function Today() {
  const t = await loadToday(await supabaseServer());
  if (!t) redirect("/onboarding");

  const { cat, status } = t;
  const w = words(cat.pronoun);
  const alert = banner(status, cat);
  const firstDay = t.dayNumber <= 1;
  const learning = status.status === "learning";

  return (
    <TabScreen>
      <header className="flex items-center justify-between gap-3 pt-[max(20px,env(safe-area-inset-top))] pr-5 pl-6">
        <div className="flex flex-col gap-0.5 pt-1.5">
          <p className="text-sm leading-4.5 font-medium text-slate">{firstDay ? "Welcome" : t.greeting}</p>
          <h1 className="text-3xl leading-8.75 font-medium tracking-[-0.02em]">{firstDay ? `${cat.name}'s first day` : `${cat.name}'s day`}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 whitespace-nowrap" title="Days in a row with a check-in or a care task">
            <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden>
              <path d="M7 1c.5 2.5 4.5 4.5 4.5 8.5a4.5 4.5 0 0 1-9 0C2.5 7 4 6 4.5 4.5 5.5 6 6 6 6.5 5 6.8 3.6 6.8 2.4 7 1z" fill="#5369EE" />
            </svg>
            <span className="text-sm leading-4.5 font-bold">{firstDay ? "Day 1" : `${t.streak} ${t.streak === 1 ? "day" : "days"}`}</span>
          </span>
          <Link href="/account" aria-label="Account" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lilac text-lg leading-5.5 font-semibold">
            {cat.name.charAt(0).toUpperCase()}
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-5">
        {alert ? <AlertBanner {...alert} /> : null}
        <CheckInCard catName={cat.name} initial={t.todayCheckIn} />
        <CarePlanCard tasks={t.plan.tasks.map(({ id, title, detail }) => ({ id, title, detail }))} initialDone={t.plan.doneIds} />

        {learning ? (
          <Link href="/watch" className="flex flex-col gap-3 rounded-[22px] bg-lilac-soft px-4.5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] leading-4.5 font-bold">Learning {cat.name}&apos;s normal</span>
              <span className="text-[13px] font-bold text-blue">{Math.min(status.checkins_total, 7)} of 7</span>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < status.checkins_total ? "bg-blue" : "bg-white"}`} />
              ))}
            </div>
            <p className="text-sm leading-5 text-[#2E3F9E]">Check in daily for a week and Kidney Watch learns what&apos;s normal for {cat.name}.</p>
          </Link>
        ) : (
          <div className="flex gap-3">
            <Link href="/watch" className="flex flex-1 flex-col gap-2.5 rounded-[22px] bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] leading-4 font-bold">Kidney Watch</span>
                <span className={`size-2 shrink-0 rounded-full ${status.status === "steady" ? "bg-green" : status.status === "red" ? "bg-red" : "bg-[#F2C94C]"}`} />
              </div>
              <div className="flex h-8.5 shrink-0 items-end gap-1">
                {t.recentDrinking.map((d, i) => (
                  <span key={i} className={`flex-1 rounded-[3px] ${d === "more" ? "h-7 bg-blue" : d === "less" ? "h-2.5 bg-[#93A0D8]" : "h-4.5 bg-[#DCE1FB]"}`} />
                ))}
              </div>
              <span className={`text-[13px] leading-4 font-semibold ${status.status === "steady" ? "text-green" : status.status === "red" ? "text-red" : "text-[#B07A00]"}`}>
                {status.status === "steady" ? `Steady, in ${w.poss} normal` : status.status === "red" ? "Go to a vet now" : "Worth a vet check"}
              </span>
            </Link>
            <div className="flex flex-1 flex-col gap-2.5 rounded-[22px] bg-lilac-soft p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] leading-4 font-bold">AquaOne</span>
                <Drop size={12} color="#5369EE" />
              </div>
              <span className="text-[22px] leading-6.5 font-semibold">Fresh water</span>
              <span className="text-[13px] leading-4 font-medium text-[#2E3F9E]">Top up the tank daily to keep it fresh.</span>
            </div>
          </div>
        )}
      </div>
    </TabScreen>
  );
}
