"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The bottom tab bar from the Paper designs: Today, Watch, Ask (raised), Safe?, Report.
const TABS = [
  { href: "/today", label: "Today", icon: (on: boolean) => <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" fill={on ? "#071D3C" : "none"} stroke={on ? "none" : "#8A93A8"} strokeWidth="2" strokeLinejoin="round" /> },
  { href: "/watch", label: "Watch", icon: (on: boolean) => <path d="M3 12h4l2-5 4 10 2-5h6" fill="none" stroke={on ? "#071D3C" : "#8A93A8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> },
  { href: "/ask", label: "Ask", icon: null },
  { href: "/safe", label: "Safe?", icon: (on: boolean) => <path d="M12 3L4 6.5V12c0 5 3.5 8.5 8 9.5 4.5-1 8-4.5 8-9.5V6.5z" fill="none" stroke={on ? "#071D3C" : "#8A93A8"} strokeWidth="2" strokeLinejoin="round" /> },
  {
    href: "/report",
    label: "Report",
    icon: (on: boolean) => (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2.5" fill="none" stroke={on ? "#071D3C" : "#8A93A8"} strokeWidth="2" />
        <path d="M9 8h6M9 12h6M9 16h3" stroke={on ? "#071D3C" : "#8A93A8"} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] items-start justify-around border-t border-[#EFEDE9] bg-white/95 px-3 pt-2.5 pb-[max(30px,env(safe-area-inset-bottom))] backdrop-blur">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(`${t.href}/`);
        if (!t.icon) {
          return (
            <Link key={t.href} href={t.href} className="-mt-5.5 flex w-16 shrink-0 flex-col items-center gap-1" aria-current={on ? "page" : undefined}>
              <span className="flex size-13.5 items-center justify-center rounded-full bg-blue shadow-[0_8px_20px_rgba(83,105,238,0.4)]">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 6h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" fill="#fff" />
                </svg>
              </span>
              <span className="text-[11px] leading-3.5 font-semibold text-blue">{t.label}</span>
            </Link>
          );
        }
        return (
          <Link key={t.href} href={t.href} className="flex w-16 shrink-0 flex-col items-center gap-1" aria-current={on ? "page" : undefined}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
              {t.icon(on)}
            </svg>
            <span className={`text-[11px] leading-3.5 ${on ? "font-bold text-navy" : "font-medium text-[#8A93A8]"}`}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// A tab screen: content plus room for the fixed tab bar.
export function TabScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-36">
      <div className="page-in flex flex-1 flex-col">{children}</div>
      <TabBar />
    </div>
  );
}
