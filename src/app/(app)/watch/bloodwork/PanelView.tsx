import { POSITION_TEXT, changeText, type Position } from "@/lib/bloodwork";
import type { ExplainedPanel } from "@/lib/bloodwork.server";

const fullDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const CHIP: Record<Exclude<Position, null>, string> = {
  above: "bg-amber text-amber-ink",
  below: "bg-amber text-amber-ink",
  within: "bg-[#E6F6EE] text-[#17714D]",
};

// One lab report, explained: shared by the app screen and (later) the vet report.
export function PanelView({ p, catName }: { p: ExplainedPanel; catName: string }) {
  return (
    <div className="flex flex-col gap-3">
      {p.readable === "partial" ? (
        <p className="rounded-2xl bg-amber px-4 py-3 text-[14px] leading-5 text-amber-ink">Some of the report was hard to read, so a few results may be missing. Check the numbers against the paper.</p>
      ) : null}
      {!p.date_from_report ? <p className="px-1 text-[13px] leading-4.5 text-slate">We couldn&apos;t find a date on the report, so it&apos;s dated the day you added it.</p> : null}

      {p.questions.length > 0 ? (
        <section className="flex flex-col gap-2.5 rounded-[22px] bg-navy px-5 py-4.5 text-white" aria-label="Questions for your vet">
          <span className="text-xs font-bold tracking-[0.08em] text-lilac">{p.questions.length === 1 ? "A QUESTION" : `${p.questions.length} QUESTIONS`} FOR YOUR VET</span>
          <ol className="flex flex-col gap-2.5">
            {p.questions.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] leading-[22px]">
                <span className="font-bold text-lilac">{i + 1}</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {p.groups.map((g) => (
        <section key={g.group} className="flex flex-col rounded-[22px] bg-white px-4.5 py-1" aria-label={g.group}>
          <span className="pt-3.5 pb-1 text-xs font-bold tracking-[0.08em] text-slate">{g.group.toUpperCase()}</span>
          {g.results.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 border-t border-[#EFEDE9] py-3 first-of-type:border-t-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[16px] leading-5.5 font-semibold">{r.label}</span>
                <span className="shrink-0 text-[16px] leading-5.5 font-bold">
                  {r.value_text}
                  {r.unit ? <span className="text-[13px] font-medium text-slate"> {r.unit}</span> : null}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {r.position ? <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CHIP[r.position]}`}>{POSITION_TEXT[r.position]}</span> : null}
                {r.ref_low != null || r.ref_high != null ? (
                  <span className="text-[12px] text-slate">
                    Lab range {r.ref_low ?? "–"}–{r.ref_high ?? "–"}
                  </span>
                ) : null}
                {r.change ? <span className={`text-[13px] font-semibold ${r.change.direction === "same" ? "text-[#17714D]" : "text-navy"}`}>{changeText(r.change)}</span> : null}
              </div>
              <p className="text-[14px] leading-5 text-[#4A5568]">{r.about ?? `Ask your vet what ${r.name} measures for ${catName}.`}</p>
            </div>
          ))}
        </section>
      ))}

      <p className="px-2.5 text-center text-xs leading-4.25 text-[#8A93A8]">
        Results from {fullDate(p.taken_on)}
        {p.lab_name ? `, ${p.lab_name}` : ""}. Not a diagnosis: the lab&apos;s range is a guide, and your vet reads what it means for {catName}.
      </p>
    </div>
  );
}
