import Link from "next/link";
import { BackLink } from "@/components/watch";

// Shared pieces of the Account screens (Paper: Account, Edit cat, Reminders, About and legal).

export function ScreenHeader({ title, back, action }: { title: string; back: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 pt-[max(20px,env(safe-area-inset-top))] pb-2">
      <BackLink href={back} />
      <h1 className="flex-1 text-[18px] leading-6 font-semibold">{title}</h1>
      {action}
    </header>
  );
}

export function Chevron() {
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden className="shrink-0">
      <path d="M1.5 1.5l5 5-5 5" stroke="#8A93A8" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RowLink({ href, title, value, sub, external }: { href: string; title: string; value?: string; sub?: string; external?: boolean }) {
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] leading-5 font-semibold">{title}</span>
        {sub ? <span className="text-[14px] leading-[18px] text-slate">{sub}</span> : null}
      </span>
      {value ? <span className="max-w-[45%] truncate text-[14px] text-slate">{value}</span> : null}
      <Chevron />
    </>
  );
  const cls = "flex min-h-[54px] items-center gap-3 border-b border-[#EFEDE9] py-3 last:border-b-0";
  return external ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

export function RowGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col rounded-[22px] bg-white px-[18px] py-1">{children}</div>;
}
