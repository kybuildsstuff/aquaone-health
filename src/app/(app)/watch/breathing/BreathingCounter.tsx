"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseButton } from "@/components/watch";
import { actionErrorMessage, BREATHING_RED_OVER, BREATHING_SECONDS, breathsPerMinute } from "@/lib/kidney-watch";
import { words, type Pronoun } from "@/lib/cat";

type Phase = "ready" | "counting" | "done";
const R = 130;
const CIRC = 2 * Math.PI * R;

// A 30-second tap counter: the first tap starts the clock, each tap is one breath.
// The server stores breaths a minute (taps x 2) and recomputes Kidney Watch.
export default function BreathingCounter({ catName, pronoun }: { catName: string; pronoun: Pronoun }) {
  const router = useRouter();
  const w = words(pronoun);
  const [phase, setPhase] = useState<Phase>("ready");
  const [taps, setTaps] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const [keepsAwake, setKeepsAwake] = useState(false);

  // Keep the screen on while counting, where the phone supports it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; setKeepsAwake(true); }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);

  useEffect(() => {
    if (phase !== "counting") return;
    const id = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      if (s >= BREATHING_SECONDS) {
        setElapsed(BREATHING_SECONDS);
        setPhase("done");
      } else setElapsed(s);
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  function tap() {
    if (phase === "done") return;
    if (phase === "ready") {
      startedAt.current = Date.now();
      setPhase("counting");
    }
    setTaps((n) => n + 1);
  }

  function reset() {
    setPhase("ready");
    setTaps(0);
    setElapsed(0);
    setError(null);
  }

  const bpm = breathsPerMinute(taps);
  const high = bpm > BREATHING_RED_OVER;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/breathing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ breaths: taps }),
    }).catch(() => null);
    if (res?.ok) {
      const body = await res.json().catch(() => ({}));
      router.replace(body.status === "red" ? "/watch/alert" : "/watch");
      router.refresh();
      return;
    }
    setBusy(false);
    const body = res ? await res.json().catch(() => ({})) : {};
    setError(actionErrorMessage(res ? res.status : null, body.error));
  }

  const secs = Math.floor(elapsed);
  return (
    <div className="flex min-h-dvh flex-col bg-navy text-white">
      <div className="flex flex-1 flex-col items-center gap-7 px-7 pt-[max(28px,env(safe-area-inset-top))]">
        <div className="flex w-full items-center justify-between">
          <CloseButton href="/watch" dark />
          {keepsAwake ? <span className="text-[13px] font-semibold text-[#8C98B4]">Screen stays on</span> : null}
        </div>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-center text-[28px] leading-8.25 font-medium tracking-[-0.02em]">Count {catName}&apos;s breathing</h1>
          <p className="text-center text-base leading-5.75 text-[#B9C3DA]">
            While {w.isAsleep}. Tap each time {w.poss} chest rises.
          </p>
        </div>

        <button
          type="button"
          onClick={tap}
          disabled={phase === "done"}
          aria-label={phase === "ready" ? "Tap to start counting" : "Tap for each breath"}
          className="relative flex size-70 shrink-0 items-center justify-center rounded-full select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.99]"
        >
          <svg width="280" height="280" viewBox="0 0 280 280" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="140" cy="140" r={R} fill="none" stroke="#13305A" strokeWidth="10" />
            {elapsed > 0 ? <circle cx="140" cy="140" r={R} fill="none" stroke="#5369EE" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(CIRC * elapsed) / BREATHING_SECONDS} ${CIRC}`} /> : null}
          </svg>
          <span className="flex size-55 flex-col items-center justify-center gap-0.5 rounded-full bg-navy-2 shadow-[0_0_60px_rgba(83,105,238,0.35)]">
            {phase === "ready" ? (
              <span className="px-6 text-center text-[22px] leading-7 font-semibold">Tap on the first breath</span>
            ) : phase === "counting" ? (
              <>
                <span className="text-[84px] leading-22 font-semibold tracking-[-0.04em]">{taps}</span>
                <span className="text-[15px] font-semibold text-lilac">breaths · tap</span>
              </>
            ) : (
              <>
                <span className="text-[84px] leading-22 font-semibold tracking-[-0.04em]">{bpm}</span>
                <span className="text-[15px] font-semibold text-lilac">breaths a minute</span>
              </>
            )}
          </span>
        </button>

        <span className="flex items-center gap-2 rounded-full bg-navy-2 px-4 py-2.25">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="13" r="8" fill="none" stroke="#BAC4FF" strokeWidth="2.2" />
            <path d="M12 9v4l2.5 2M9 2h6" stroke="#BAC4FF" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span className="text-[15px] font-semibold">
            0:{String(secs).padStart(2, "0")} <span className="font-medium text-[#8C98B4]">of 0:30</span>
          </span>
        </span>

        {phase === "done" ? (
          <div className="flex w-full flex-col gap-3">
            {taps === 0 ? null : high ? (
              <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[15px] leading-5.5 font-semibold text-[#8E2335]">
                Over 30 a minute at rest. Go to a vet now, any hour.
              </p>
            ) : (
              <p className="rounded-2xl bg-[#1F9D6B33] px-4 py-3 text-[15px] leading-5.5 font-semibold text-[#9FE3C4]">Within the normal range at rest.</p>
            )}
            {error ? <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[14px] text-[#8E2335]">{error}</p> : null}
            <button type="button" onClick={save} disabled={busy} className="flex h-14 w-full items-center justify-center rounded-full bg-white text-[17px] font-semibold text-navy disabled:opacity-50">
              {busy ? "Saving…" : "Save this count"}
            </button>
            <button type="button" onClick={reset} disabled={busy} className="text-[15px] font-semibold text-lilac">
              Count again
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-1.5 px-7 pt-6 pb-11">
        <p className="text-sm leading-4.5 font-semibold text-lilac">Normal at rest: 15–30 a minute</p>
        <p className="text-center text-xs leading-4.25 text-[#8C98B4]">Over 30 at rest, or breathing with {w.poss} mouth open: go to a vet now.</p>
      </div>
    </div>
  );
}
