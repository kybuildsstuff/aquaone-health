"use client";
import { useEffect, useState } from "react";
import { LOOP_PORTAL_URL } from "@/lib/account";
import { Chevron } from "./parts";

// "Manage or cancel membership" (Paper: Cancel sheet). Cancelling runs in Loop's own customer
// portal on the PureStream store (decision 1); this sheet says what happens, then opens it.
export default function ManageMembership({
  label,
  state,
  accessUntil,
  catName,
  email,
}: {
  label: string;
  state: string;
  accessUntil: string | null;
  catName: string | null;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const canCancel = state === "trial" || state === "active";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-[64px] items-center gap-3 rounded-[22px] bg-white px-[18px] py-3.5 text-left">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[16px] leading-5 font-semibold">{label}</span>
          <span className="text-[14px] leading-[18px] text-slate">In your PureStream account, where you&apos;re billed</span>
        </span>
        <Chevron />
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="manage-title">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-[#071D3C]/45" onClick={() => setOpen(false)} />
          <div className="relative flex w-full max-w-[480px] flex-col gap-4 rounded-t-[28px] bg-white px-6 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
            <span className="mx-auto h-1 w-10 rounded-full bg-line" aria-hidden />
            {canCancel ? (
              <>
                <h2 id="manage-title" className="pt-2 text-[24px] leading-[30px] font-semibold tracking-[-0.01em]">
                  Cancel your membership?
                </h2>
                <p className="text-[16px] leading-6 text-slate">
                  {accessUntil
                    ? `Cancel before ${accessUntil} and you won't be charged. You keep full access until then.`
                    : "You won't be charged again, and you keep full access to the end of what you've already got."}
                </p>
                <div className="flex flex-col gap-2.5 rounded-2xl bg-paper px-4 py-3.5">
                  <span className="text-xs font-bold tracking-[0.08em] text-slate">{accessUntil ? `AFTER ${accessUntil.toUpperCase()}` : "AFTERWARDS"}</span>
                  <Bullet>Kidney Watch, Ask and Is it safe? stop</Bullet>
                  <Bullet>{catName ? `${catName}'s` : "Your cat's"} history is kept, so it&apos;s here if you come back</Bullet>
                </div>
              </>
            ) : (
              <h2 id="manage-title" className="pt-2 text-[24px] leading-[30px] font-semibold tracking-[-0.01em]">
                Manage your membership
              </h2>
            )}
            <p className="text-[15px] leading-[22px] text-slate">
              Your membership is billed through the PureStream store. Sign in there with <b className="font-semibold text-navy">{email}</b>, then choose{" "}
              {canCancel ? "Cancel subscription" : "your AquaOne Health subscription"}.
            </p>
            <a
              href={LOOP_PORTAL_URL}
              target="_blank"
              rel="noopener"
              className={`flex h-14 items-center justify-center rounded-full text-[17px] font-semibold text-white ${canCancel ? "bg-red" : "bg-navy"}`}
            >
              {canCancel ? "Continue to cancel" : "Open my PureStream account"}
            </a>
            <button type="button" onClick={() => setOpen(false)} className="h-11 text-[16px] font-semibold">
              {canCancel ? "Keep it" : "Close"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2.5 text-[15px] leading-[21px]">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#8A93A8]" aria-hidden />
      {children}
    </span>
  );
}
