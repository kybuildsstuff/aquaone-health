import Link from "next/link";
import { Drop } from "@/components/ui";

// Pieces shared by Today and the Kidney Watch screens (no client state).

export function AlertBanner({ level, label, headline, sub }: { level: "amber" | "red"; label: string; headline: string; sub: string }) {
  const red = level === "red";
  return (
    <div className={`flex flex-col gap-3 rounded-3xl border-[1.5px] p-4.5 ${red ? "border-red bg-[#FDECEE]" : "border-[#F2C94C] bg-amber"}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${red ? "bg-red" : "bg-[#F2C94C]"}`}>
          {red ? <span className="text-lg leading-5.5 font-extrabold text-white">!</span> : <Drop size={13} color="#4A3300" />}
        </span>
        <span className={`text-xs leading-4 font-extrabold tracking-[0.08em] ${red ? "text-red" : "text-[#7A5300]"}`}>{label}</span>
      </div>
      <p className={`text-[19px] leading-6.25 font-semibold ${red ? "text-[#5C1020]" : "text-amber-ink"}`}>{headline}</p>
      <p className={`text-sm leading-5 ${red ? "text-[#7A1F2E]" : "text-[#5C4500]"}`}>{sub}</p>
      <Link
        href="/watch/alert"
        className={`flex h-12 shrink-0 items-center justify-center rounded-full text-[15px] leading-4.5 font-semibold ${red ? "bg-red text-white" : "bg-amber-ink text-amber"}`}
      >
        See what to do
      </Link>
    </div>
  );
}

export function LearningRing({ done, size = 64 }: { done: number; size?: number }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, done / 7);
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#13305A" strokeWidth="7" />
        {frac > 0 ? <circle cx="32" cy="32" r={r} fill="none" stroke="#5369EE" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} /> : null}
      </svg>
      <span className="relative text-[15px] leading-4.5 font-bold text-white">{Math.min(done, 7)}/7</span>
    </div>
  );
}

export function CloseButton({ href, dark }: { href: string; dark?: boolean }) {
  return (
    <Link href={href} aria-label="Close" className={`flex size-10 shrink-0 items-center justify-center rounded-full ${dark ? "bg-navy-2" : "bg-white"}`}>
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
        <path d="M5 5l10 10M15 5L5 15" stroke={dark ? "#fff" : "#071D3C"} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

export function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="Back" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
        <path d="M12.5 4L6.5 10l6 6" stroke="#071D3C" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
