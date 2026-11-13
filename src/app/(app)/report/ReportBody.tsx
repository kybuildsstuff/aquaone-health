import { BREATHING_NORMAL, DISCLAIMER, breathingSub, dayLabel, drinkingSub, profileLine, type Report } from "@/lib/report";
import { Drop } from "@/components/ui";

// The report itself, shared by her /report screen and the public /r/<token> page (no client state).
// Visual language: the "19 Report" screen in Paper, with the detail sections in the Watch screen's cards.

const DOT = { normal: "bg-[#C9D1FB]", more: "bg-blue", less: "bg-navy" } as const;

export function ReportSummaryCard({ r, pdfHref }: { r: Report; pdfHref: string }) {
  const tiles = [
    { label: "Drinking", value: r.drinking.label, sub: drinkingSub(r), red: false, subRed: false },
    { label: "Weight", value: r.weight.latestLb != null ? `${r.weight.latestLb.toFixed(1)} lb` : "—", sub: r.weight.label, red: false, subRed: false },
    { label: "Breathing", value: r.breathing.latest ? `${r.breathing.latest.bpm}/min` : "—", sub: breathingSub(r), red: Boolean(r.breathing.latest?.red), subRed: r.breathing.red.length > 0 },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-4.5 shadow-[0_14px_34px_#071D3C14]">
      <div className="flex items-start justify-between gap-3 border-b border-[#EFEDE9] pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base leading-5 font-bold">{profileLine(r)}</span>
          <span className="text-xs leading-4 text-slate">
            {r.period.label} · {r.drinking.checkIns} {r.drinking.checkIns === 1 ? "day" : "days"} of {"check\u2011ins"}
          </span>
        </div>
        <a href={pdfHref} className="shrink-0 rounded-md bg-lilac-soft px-2 py-1 text-[10px] leading-3 font-extrabold tracking-[0.08em] text-blue">
          PDF
        </a>
      </div>
      <div className="flex gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="flex min-w-0 flex-1 flex-col gap-0.75 rounded-xl bg-paper p-2.5">
            <span className="text-[11px] leading-3.5 font-semibold text-slate">{t.label}</span>
            <span className={`text-[15px] leading-4.5 font-bold ${t.red ? "text-red" : ""}`}>{t.value}</span>
            <span className={`text-[11px] leading-3.5 ${t.subRed ? "font-semibold text-red" : "text-slate"}`}>{t.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportDetails({ r }: { r: Report }) {
  return (
    <>
      <Section title="Drinking" note={`${r.drinking.checkIns} of ${r.period.days} days`}>
        <div className="flex items-center justify-between" aria-label={`${r.drinking.checkIns} check-ins in ${r.period.days} days`}>
          {r.drinking.days.map((d) => (
            <span
              key={d.date}
              title={`${dayLabel(d.date)}: ${d.drinking ?? "no check-in"}`}
              className={`size-2.25 shrink-0 rounded-full ${d.drinking ? DOT[d.drinking] : "bg-line"}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[11px] leading-3.5 text-[#8A93A8]">
          <span>{dayLabel(r.period.from)}</span>
          <span>{dayLabel(r.period.to)}</span>
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1">
          {(["normal", "more", "less"] as const).map((x) => (
            <span key={x} className="flex items-center gap-1.5 text-xs leading-4 text-slate">
              <span className={`size-2 rounded-full ${DOT[x]}`} />
              {x.charAt(0).toUpperCase() + x.slice(1)} {r.drinking.counts[x]}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs leading-4 text-slate">
            <span className="size-2 rounded-full bg-line" />
            Missed {r.period.days - r.drinking.checkIns}
          </span>
        </div>
      </Section>

      <Section title="Weight" note={r.weight.label}>
        {r.weight.points.length ? (
          <>
            {r.weight.changePct != null && r.weight.since ? (
              <p className={`text-sm leading-5 ${r.weight.changePct <= -5 ? "font-semibold text-[#B07A00]" : "text-slate"}`}>
                {r.weight.changePct > 0 ? "+" : ""}
                {r.weight.changePct}% since {dayLabel(r.weight.since)}
              </p>
            ) : null}
            <ul className="flex flex-col">
              {[...r.weight.points].reverse().slice(0, 8).map((p, i) => (
                <li key={`${p.date}-${i}`} className="flex justify-between border-t border-[#F1EFEB] py-2 text-sm leading-4.5 first:border-t-0">
                  <span className="text-slate">{dayLabel(p.date, true)}</span>
                  <span className="font-semibold">{p.lb.toFixed(2)} lb</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm leading-5 text-slate">No weigh-ins in this period.</p>
        )}
        {r.cat.startEstimateLb != null ? <p className="text-xs leading-4 text-[#8A93A8]">Estimate at sign-up: {r.cat.startEstimateLb.toFixed(1)} lb (not weighed).</p> : null}
      </Section>

      <Section title="Breathing" note={`Normal ${BREATHING_NORMAL.low}–${BREATHING_NORMAL.high}`}>
        {r.breathing.counts.length ? (
          <>
            <BreathingChart r={r} />
            {r.breathing.red.length ? (
              <div className="flex flex-col gap-1 rounded-xl bg-[#FDECEE] px-3 py-2.5">
                <span className="text-xs leading-4 font-extrabold tracking-[0.06em] text-red">OVER 30 AT REST</span>
                {r.breathing.red.map((b) => (
                  <span key={b.at} className="flex justify-between text-sm leading-5 text-[#5C1020]">
                    <span>
                      {dayLabel(b.date)}, {b.time}
                    </span>
                    <span className="font-semibold">{b.bpm}/min</span>
                  </span>
                ))}
                <span className="text-xs leading-4 text-[#7A1F2E]">Kept on the report even when a later recount was normal.</span>
              </div>
            ) : null}
            <p className="text-xs leading-4 text-slate">
              {r.breathing.counts.length} {r.breathing.counts.length === 1 ? "count" : "counts"} while asleep, range {r.breathing.min}–{r.breathing.max} a minute. Latest {r.breathing.latest!.bpm}, {dayLabel(r.breathing.latest!.date)}.
            </p>
          </>
        ) : (
          <p className="text-sm leading-5 text-slate">No breathing counts in this period.</p>
        )}
      </Section>

      <Section title="Kidney Watch alerts" note={r.alerts.length ? `${r.alerts.length}` : "None"}>
        {r.alerts.length ? (
          <ul className="flex flex-col">
            {r.alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 border-t border-[#F1EFEB] py-2.5 first:border-t-0">
                <span className={`mt-1.25 size-2 shrink-0 rounded-full ${a.level === "red" ? "bg-red" : "bg-[#F2C94C]"}`} />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-4.5 font-semibold">{a.title}</span>
                  <span className="text-xs leading-4 text-slate">
                    Opened {dayLabel(a.openedOn)} · {a.resolvedOn ? `cleared ${dayLabel(a.resolvedOn)}` : "still open"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-5 text-slate">No Kidney Watch alerts in this period.</p>
        )}
      </Section>

      <Section title="Profile">
        <dl className="flex flex-col">
          {[
            ["Conditions", r.cat.conditions.length ? r.cat.conditions.join(", ") : "None noted"],
            ["Food", r.cat.food],
            ["Lives", r.cat.lives],
            ["Vet", r.cat.vetSaved ? `${r.cat.vet}${r.cat.vetPhone ? `, ${r.cat.vetPhone}` : ""}` : "Not saved"],
          ]
            .filter((x): x is [string, string] => Boolean(x[1]))
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-t border-[#F1EFEB] py-2 text-sm leading-4.5 first:border-t-0">
                <dt className="text-slate">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
        </dl>
      </Section>

      <p className="px-2.5 py-0.5 text-center text-xs leading-4.25 font-semibold text-slate">{DISCLAIMER}</p>
    </>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-white px-4.5 py-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          {title === "Drinking" ? <Drop size={13} color="#5369EE" /> : null}
          <h2 className="text-[15px] leading-4.5 font-bold">{title}</h2>
        </span>
        {note ? <span className="text-[13px] leading-4 font-semibold text-slate">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

// Every count in the period, oldest first, against the 15–30 band. Red dots are over 30.
function BreathingChart({ r }: { r: Report }) {
  const counts = r.breathing.counts;
  const top = Math.max(45, ...counts.map((c) => c.bpm + 5));
  const y = (bpm: number) => 60 - (Math.min(bpm, top) / top) * 56;
  const x = (i: number) => (counts.length === 1 ? 160 : 8 + (i * 304) / (counts.length - 1));
  return (
    <svg width="100%" viewBox="0 0 320 64" className="block h-auto" role="img" aria-label={`Breathing counts, ${counts.length}`}>
      <rect x="0" y="0" width="320" height="64" rx="8" fill="#F9F8F7" />
      <rect x="0" y={y(BREATHING_NORMAL.high)} width="320" height={y(BREATHING_NORMAL.low) - y(BREATHING_NORMAL.high)} fill="#C9F0DE" />
      {counts.map((c, i) => (
        <circle key={c.at} cx={x(i)} cy={y(c.bpm)} r="3.5" fill={c.red ? "#B4233A" : "#1F9D6B"} />
      ))}
    </svg>
  );
}
