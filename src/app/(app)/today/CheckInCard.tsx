"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drop } from "@/components/ui";
import { actionErrorMessage } from "@/lib/kidney-watch";

type Drink = "less" | "normal" | "more";
const OPTIONS: { value: Drink; label: string }[] = [
  { value: "less", label: "Less" },
  { value: "normal", label: "Normal" },
  { value: "more", label: "More" },
];

// The daily drinking check-in. One answer per day; tapping another answer changes it.
// The server recomputes Kidney Watch, then the page refreshes to show any alert.
export default function CheckInCard({ catName, initial }: { catName: string; initial: Drink | null }) {
  const router = useRouter();
  const [value, setValue] = useState<Drink | null>(initial);
  const [busy, setBusy] = useState<Drink | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(drinking: Drink) {
    setBusy(drinking);
    setError(null);
    const res = await fetch("/api/check-ins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drinking }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setValue(drinking);
      router.refresh();
      return;
    }
    const body = res ? await res.json().catch(() => ({})) : {};
    setError(actionErrorMessage(res ? res.status : null, body.error));
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-3xl bg-navy p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-[0.08em] text-lilac">{value ? "CHECKED IN TODAY" : "DAILY CHECK-IN · 10 SEC"}</span>
        <Drop size={16} color="#5369EE" />
      </div>
      <p className="text-xl leading-6.5 font-medium text-white">How much did {catName} drink since yesterday?</p>
      <div className="flex gap-2">
        {OPTIONS.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={busy !== null}
              onClick={() => choose(o.value)}
              className={`flex flex-1 justify-center rounded-[14px] py-3.25 text-[15px] leading-4.5 font-semibold transition active:scale-[0.98] ${
                on ? "bg-blue text-white" : "bg-navy-2 text-white"
              } ${busy === o.value ? "opacity-60" : ""}`}
            >
              {busy === o.value ? "Saving…" : o.label}
            </button>
          );
        })}
      </div>
      {value && !error ? <p className="text-[13px] text-[#B9C3DA]">Thanks. Kidney Watch is updated. Tap another answer to change it.</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-[#FDECEE] px-3.5 py-2.5 text-[14px] text-[#8E2335]">{error}</p> : null}
    </div>
  );
}
