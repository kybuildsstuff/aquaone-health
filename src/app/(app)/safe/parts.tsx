import Link from "next/link";
import { POISON_FEE_NOTE, POISON_LINES, SEVERITY_LABEL, type Severity } from "@/lib/safe";

// Pieces shared by the Is it safe? screens (Paper: "16 Safe? home", "17 Safe? · toxic", "18 Safe? · safe").

const BADGE: Record<Severity, string> = {
  emergency: "bg-red",
  toxic: "bg-[#D9485F]",
  mild: "bg-[#C98A00]",
  safe: "bg-green",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] leading-3.5 font-bold tracking-[0.06em] text-white ${BADGE[severity]}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function PhoneIcon({ size = 16, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z"
        fill={color}
      />
    </svg>
  );
}

export function SproutIcon({ size = 22, color = "#1F9D6B", strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21V11M12 11c0-4 3-7 7-7 0 4-3 7-7 7zM12 14c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackLink({ href = "/safe", light }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} aria-label="Back" className={`flex size-10 shrink-0 items-center justify-center rounded-full ${light ? "bg-white/16" : "bg-white"}`}>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
        <path d="M12.5 4L6.5 10l6 6" fill="none" stroke={light ? "#FFFFFF" : "#071D3C"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export function FromPhotoPill() {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white py-1.5 pr-3 pl-1.5">
      <span className="flex size-6.5 items-center justify-center rounded-full bg-[#C9F0DE]">
        <SproutIcon size={13} color="#14583D" strokeWidth={2.2} />
      </span>
      <span className="text-[13px] leading-4 font-semibold text-[#14583D]">From your photo</span>
    </span>
  );
}

// Both poison lines as tap-to-call buttons, with the fee said plainly.
export function PoisonLineButtons() {
  return (
    <>
      {POISON_LINES.map((l) => (
        <a
          key={l.tel}
          href={l.tel}
          className="flex h-13 shrink-0 items-center justify-center gap-2.5 rounded-full border-[1.5px] border-line bg-white text-[15px] leading-4.5 font-semibold text-navy"
        >
          {l.name.replace("Animal Poison Control", "poison line")} · {l.phone}
        </a>
      ))}
    </>
  );
}

export function SourceNote({ source, extra, fee = true }: { source: string; extra?: string; fee?: boolean }) {
  return (
    <p className="text-center text-[11px] leading-3.75 text-[#8A93A8]">
      Source: {source}.{fee ? ` ${POISON_FEE_NOTE}` : ""}
      {extra ? ` ${extra}` : ""}
    </p>
  );
}

// "Toxic steps": numbered, the first sentence of the first step in bold (as in the lily design).
export function Steps({ title, steps, tone }: { title: string; steps: string[]; tone: "red" | "amber" }) {
  const num = tone === "red" ? "bg-[#FDECEE] text-red" : "bg-amber text-[#8A5A00]";
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-white p-4.5">
      <span className={`text-xs leading-4 font-bold tracking-[0.08em] ${tone === "red" ? "text-red" : "text-[#8A5A00]"}`}>{title}</span>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const m = i === 0 && tone === "red" ? s.match(/^([^.;]+[.;])\s*(.*)$/) : null;
          return (
            <li key={i} className="flex items-start gap-3">
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs leading-4 font-bold ${num}`}>{i + 1}</span>
              <span className="text-[15px] leading-5.25 text-navy">
                {m ? (
                  <>
                    <b className="font-bold">{m[1].replace(/;$/, ".")}</b> {m[2] ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : ""}
                  </>
                ) : (
                  s
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function GoodToKnow({ points }: { points: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-white p-4.5">
      <span className="text-xs leading-4 font-bold tracking-[0.08em] text-blue">GOOD TO KNOW</span>
      <ul className="flex flex-col gap-3">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-1.75 size-2 shrink-0 rounded-full bg-blue" />
            <span className="text-[15px] leading-5.25 text-navy">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CheckAnotherRow() {
  return (
    <div className="flex gap-2.5">
      <Link href="/safe" className="flex h-13.5 flex-1 items-center justify-center rounded-full bg-navy text-[15px] leading-4.5 font-semibold text-white">
        Check another
      </Link>
      <Link href="/ask" className="flex h-13.5 flex-1 items-center justify-center rounded-full border-[1.5px] border-line bg-white text-[15px] leading-4.5 font-semibold text-navy">
        Ask about it
      </Link>
    </div>
  );
}
