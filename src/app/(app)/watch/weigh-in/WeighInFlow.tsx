"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PrimaryButton } from "@/components/ui";
import { CloseButton } from "@/components/watch";
import { actionErrorMessage, LB_PER_KG, weighInPounds } from "@/lib/kidney-watch";

const parse = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Two readings on her bathroom scale: herself, then holding the cat. The difference is the cat.
export default function WeighInFlow({ catName, lastLb }: { catName: string; lastLb: number | null }) {
  const router = useRouter();
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [own, setOwn] = useState("");
  const [withCat, setWithCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownN = parse(own);
  const withN = parse(withCat);
  const result = ownN && withN ? weighInPounds({ ownerWeight: ownN, withCatWeight: withN, unit }) : null;
  const catLb = result?.ok ? result.catLb : null;
  const shown = catLb == null ? null : unit === "kg" ? catLb / LB_PER_KG : catLb;

  let compare: string | null = null;
  if (catLb != null && lastLb != null) {
    const diffLb = catLb - lastLb;
    const diff = Math.round((unit === "kg" ? diffLb / LB_PER_KG : diffLb) * 10) / 10;
    compare = Math.abs(diffLb) < 0.2 ? "Same as last time" : `${diffLb > 0 ? "Up" : "Down"} ${Math.abs(diff)} ${unit} since last time`;
  }

  async function save() {
    if (!ownN || !withN) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/weigh-ins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerWeight: ownN, withCatWeight: withN, unit }),
    }).catch(() => null);
    if (res?.ok) {
      router.replace("/watch");
      router.refresh();
      return;
    }
    setBusy(false);
    const body = res ? await res.json().catch(() => ({})) : {};
    setError(actionErrorMessage(res ? res.status : null, body.error));
  }

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-[max(20px,env(safe-area-inset-top))] pb-10">
      <div className="flex items-center justify-between pt-2">
        <CloseButton href="/watch" />
        <div className="flex rounded-full bg-[#F1F0ED] p-1">
          {(["lb", "kg"] as const).map((u) => (
            <button key={u} type="button" onClick={() => setUnit(u)} className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold ${unit === u ? "bg-navy text-white" : "text-slate"}`}>
              {u}
            </button>
          ))}
        </div>
      </div>
      <h1 className="pt-6 text-[28px] leading-8.25 font-medium tracking-[-0.02em]">Weigh-in</h1>
      <p className="pt-2 text-base leading-5.75 text-slate">No cat scale needed. Two quick readings on your bathroom scale.</p>

      <div className="flex flex-col gap-3 pt-6">
        <Reading step={1} kicker="Just you" title="Weigh yourself" value={own} onChange={setOwn} unit={unit} done={ownN != null} active={ownN == null} />
        <Reading step={2} kicker="Holding your cat" title={`Now hold ${catName}`} value={withCat} onChange={setWithCat} unit={unit} done={false} active={ownN != null} />

        <div className="mt-2 flex flex-col items-center gap-3 rounded-3xl bg-navy px-6 py-7">
          <span className="text-[13px] font-bold tracking-[0.08em] text-lilac">{catName.toUpperCase()} WEIGHS</span>
          <span className="text-[56px] leading-[60px] font-semibold tracking-[-0.03em] text-white">
            {shown != null ? shown.toFixed(1) : "—"} <span className="text-2xl font-medium text-[#B9C3DA]">{unit}</span>
          </span>
          {result && !result.ok ? (
            <span className="rounded-full bg-[#FDECEE] px-3.5 py-1.5 text-[13px] font-semibold text-[#8E2335]">{actionErrorMessage(400, result.error)}</span>
          ) : compare ? (
            <span className="flex items-center gap-2 rounded-full bg-navy-2 px-3.5 py-1.5 text-[13px] font-semibold text-[#9FE3C4]">
              <span className="size-2 rounded-full bg-[#5FD3A0]" />
              {compare}
            </span>
          ) : null}
        </div>
        <p className="pt-1 text-center text-[13px] text-[#8A93A8]">Tip: same scale, same time of day, before breakfast.</p>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        {error ? <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[14px] text-[#8E2335]">{error}</p> : null}
        <PrimaryButton onClick={save} disabled={busy || !result?.ok}>{busy ? "Saving…" : "Save weigh-in"}</PrimaryButton>
      </div>
    </div>
  );
}

function Reading(props: { step: number; kicker: string; title: string; value: string; onChange: (v: string) => void; unit: string; done: boolean; active: boolean }) {
  return (
    <label className={`flex items-center gap-3.5 rounded-[20px] bg-white px-4.5 py-4 ${props.active ? "border-2 border-blue shadow-[0_0_0_4px_rgba(83,105,238,0.10)]" : "border-2 border-transparent"}`}>
      {props.done ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue">
          <Check />
        </span>
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lilac-soft text-[13px] font-bold text-blue">{props.step}</span>
      )}
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-slate">
          {props.step} · {props.kicker}
        </span>
        <span className="text-[15px] font-semibold">{props.title}</span>
      </span>
      <input
        inputMode="decimal"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="0.0"
        aria-label={props.title}
        className="w-20 bg-transparent text-right text-[24px] font-semibold tracking-tight outline-none placeholder:text-[#C9CED9]"
      />
      <span className="text-[14px] text-slate">{props.unit}</span>
    </label>
  );
}
