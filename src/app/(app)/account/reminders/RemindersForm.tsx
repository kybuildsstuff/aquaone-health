"use client";
import { useState } from "react";
import { saveErrorMessage } from "@/lib/onboarding";
import type { ReminderInput } from "@/lib/account";
import { ScreenHeader } from "../parts";

// Email settings (Paper board 35.1, retention v1). Email is the only channel; texts are "Coming soon".
// Kidney Watch alerts and billing notices always come; the monthly summary and the 5-day nudge can be
// switched off. Each change saves at once.
export default function RemindersForm({ initial, email }: { initial: ReminderInput; email: string }) {
  const [prefs, setPrefs] = useState<ReminderInput>(initial);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: ReminderInput) {
    const before = prefs;
    setPrefs(next);
    setNote(null);
    let status: number | null = null;
    let code: string | undefined;
    try {
      const res = await fetch("/api/account/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...next, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      status = res.status;
      code = (await res.json().catch(() => ({}))).error;
      if (res.ok) return setNote({ ok: true, text: "Saved" });
    } catch {
      status = null;
    }
    setPrefs(before);
    setNote({ ok: false, text: saveErrorMessage(status, code) });
  }

  return (
    <div className="flex min-h-dvh flex-col gap-3 px-5 pb-12">
      <ScreenHeader title="Emails" back="/account" />

      <p className="pt-2 text-xs font-bold tracking-[0.08em] text-slate">HOW WE REACH YOU</p>
      <div className="flex gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-[18px] border-2 border-blue bg-white px-4 py-3.5">
          <span className="text-[15px] font-semibold">Email</span>
          <span className="truncate text-[12px] text-slate">{email}</span>
        </div>
        <div className="flex flex-1 flex-col gap-1 rounded-[18px] border-2 border-line bg-[#F4F3F1] px-4 py-3.5">
          <span className="text-[15px] font-semibold text-[#8A93A8]">Text</span>
          <span className="self-start rounded-full bg-lilac-soft px-2 py-0.5 text-[11px] font-bold text-blue">Coming soon</span>
        </div>
      </div>

      <p className="pt-3 text-xs font-bold tracking-[0.08em] text-slate">WHAT WE SEND</p>
      <div className="flex flex-col rounded-[22px] bg-white px-[18px] py-0.5">
        <div className="flex items-center gap-3 py-3.5">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Kidney Watch alerts</span>
            <span className="text-[13px] leading-[17px] text-slate">Only when something changes</span>
          </span>
          <span className="rounded-full bg-[#E8F6E9] px-2.5 py-1 text-[12px] font-bold text-[#2F8F3A]">Always on</span>
        </div>
        <div className="flex items-center gap-3 border-t border-[#F1EFEB] py-3.5">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Monthly summary</span>
            <span className="text-[13px] leading-[17px] text-slate">How each cat&apos;s month went, once a month</span>
          </span>
          <Toggle on={prefs.monthlySummary ?? true} label="Monthly summary" onChange={(v) => save({ ...prefs, monthlySummary: v })} />
        </div>
        <div className="flex items-center gap-3 border-t border-[#F1EFEB] py-3.5">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">A nudge if we miss you</span>
            <span className="text-[13px] leading-[17px] text-slate">If there&apos;s no check-in for 5 days, at most once a month</span>
          </span>
          <Toggle on={prefs.nudge ?? true} label="Nudge if we miss you" onChange={(v) => save({ ...prefs, nudge: v })} />
        </div>
      </div>

      {note ? (
        <p role="status" className={`text-center text-[14px] ${note.ok ? "text-green" : "text-red"}`}>
          {note.text}
        </p>
      ) : null}
      <p className="px-3 pt-2 text-center text-[12px] leading-[17px] text-[#8A93A8]">
        That&apos;s all we send. Billing notices, like the reminder before your first charge, always come through.
      </p>
    </div>
  );
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition ${on ? "bg-blue" : "bg-[#E4E2DE]"}`}
    >
      <span className={`absolute top-[3px] size-6 rounded-full bg-white shadow transition-all ${on ? "left-[23px]" : "left-[3px]"}`} />
    </button>
  );
}
