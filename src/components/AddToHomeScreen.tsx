"use client";
import { Drop, PrimaryButton } from "@/components/ui";

const KEY = "aquaone:a2hs-dismissed";

// Shown once, only in iPhone/iPad Safari when the app isn't already on the Home Screen.
export function shouldOfferAddToHomeScreen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(KEY)) return false;
  } catch {
    // Private mode: offer it; dismissal just won't be remembered.
  }
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return iOS && safari && !standalone;
}

function dismiss() {
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {}
}

export default function AddToHomeScreen({ catName, onDone }: { catName: string; onDone: () => void }) {
  const finish = () => {
    dismiss();
    onDone();
  };
  const steps = [
    {
      text: (
        <>Tap <b>Share</b> at the bottom of Safari</>
      ),
      icon: (
        <svg width="16" height="18" viewBox="0 0 24 26" aria-hidden>
          <path d="M12 16V3M7 8l5-5 5 5M6 12H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1" stroke="#5369EE" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      text: (
        <>Choose <b>Add to Home Screen</b></>
      ),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="#5369EE" strokeWidth="2" fill="none" />
          <path d="M12 8v8M8 12h8" stroke="#5369EE" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
    { text: <>Tap <b>Add</b> in the top corner</>, icon: null },
  ];

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-10 pb-8">
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col items-center gap-4 rounded-[26px] bg-[linear-gradient(160deg,#C9D1FB_0%,#EEF0FD_100%)] py-6">
          <div className="flex gap-[18px]">{[0, 1, 2, 3].map((i) => <div key={i} className="size-14 rounded-[14px] bg-white/60" />)}</div>
          <div className="flex items-start gap-[18px]">
            <div className="size-14 rounded-[14px] bg-white/60" />
            <div className="flex flex-col items-center gap-1">
              <div className="flex size-14 items-center justify-center rounded-[14px] bg-navy shadow-[0_0_0_3px_#fff,0_10px_24px_rgba(7,29,60,0.3)]">
                <Drop size={20} color="#5369EE" />
              </div>
              <span className="text-[10px] font-semibold">AquaOne</span>
            </div>
            <div className="size-14 rounded-[14px] bg-white/60" />
            <div className="size-14 rounded-[14px] bg-white/60" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[33px] font-medium tracking-tight">Put {catName} on your Home Screen</h1>
          <p className="text-base leading-[23px] text-slate">One tap to open, just like an app. Takes 10 seconds.</p>
        </div>
        <ol className="flex flex-col rounded-[22px] bg-white px-[18px] py-1">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3.5 border-b border-[#F1EFEB] py-3.5 last:border-b-0">
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
              <span className="flex-1 text-[15px]">{s.text}</span>
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-lilac-soft empty:bg-transparent">{s.icon}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-1.5 pt-6">
        <PrimaryButton onClick={finish}>Done, I&apos;ve added it</PrimaryButton>
        <button onClick={finish} className="h-11 text-[15px] font-semibold text-slate">Maybe later</button>
      </div>
    </div>
  );
}
