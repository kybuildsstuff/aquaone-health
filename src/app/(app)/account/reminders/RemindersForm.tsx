"use client";
import { useState } from "react";
import { saveErrorMessage } from "@/lib/onboarding";
import { CHECKIN_TIMES, type ReminderInput } from "@/lib/account";
import { ScreenHeader } from "../parts";

// Reminder settings (Paper: Reminders). Email on or off and the check-in time; texts are
// "Coming soon" (decisions: text reminders come after launch). Each change saves at once.
export default function RemindersForm({ initial }: { initial: ReminderInput }) {
  const [prefs, setPrefs] = useState<ReminderInput>(initial);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: ReminderInput) {
    const before = prefs;
    setPrefs(next);
    setNote(null);
    let status: number | null = null;
    let code: string | undefined;
    try {
      const res = await fetch("/api/account/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
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
    <div className="flex min-h-dvh flex-col gap-3.5 px-5 pb-12">
      <ScreenHeader title="Reminders" back="/account" />

      <p className="pt-2 text-xs font-bold tracking-[0.08em] text-slate">HOW WE REACH YOU</p>
      <div className="flex gap-2.5">
        <div className="flex flex-1 items-center justify-between rounded-[18px] border-[1.5px] border-line bg-white px-4 py-4 opacity-70">
          <span className="flex flex-col">
            <span className="text-[16px] font-semibold">Text</span>
            <span className="text-[12px] font-semibold text-blue">Coming soon</span>
          </span>
          <Toggle on={false} disabled label="Text reminders" onChange={() => {}} />
        </div>
        <div className={`flex flex-1 items-center justify-between rounded-[18px] border-[1.5px] bg-white px-4 py-4 ${prefs.byEmail ? "border-blue" : "border-line"}`}>
          <span className="text-[16px] font-semibold">Email</span>
          <Toggle on={prefs.byEmail} label="Email reminders" onChange={(v) => save({ ...prefs, byEmail: v })} />
        </div>
      </div>

      <p className="pt-3 text-xs font-bold tracking-[0.08em] text-slate">DAILY CHECK-IN</p>
      <div className="flex flex-col gap-3 rounded-[22px] bg-white px-[18px] py-4">
        <span className="text-[15px] text-slate">The time we remind you to check in each day</span>
        <div className="flex gap-2">
          {CHECKIN_TIMES.map((t) => {
            const on = prefs.checkinTime === t.value;
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() => !on && save({ ...prefs, checkinTime: t.value })}
                className={`flex-1 rounded-xl py-3 text-[15px] ${on ? "border-[1.5px] border-blue bg-lilac-soft font-semibold" : "border-[1.5px] border-line font-medium text-slate"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {note ? (
        <p role="status" className={`text-center text-[14px] ${note.ok ? "text-green" : "text-red"}`}>
          {note.text}
        </p>
      ) : null}
      <p className="px-4 pt-2 text-center text-[13px] leading-[18px] text-[#8A93A8]">
        Billing notices, like the email 3 days before your first charge, always come through.
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
