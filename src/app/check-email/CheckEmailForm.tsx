"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PrimaryButton } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

const RESEND_AFTER = 45;

export default function CheckEmailForm() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (err) {
      setBusy(false);
      setError("That code didn't work. Check it, or send a new one.");
      return;
    }
    const res = await fetch("/api/auth/link", { method: "POST" }).catch(() => null);
    const body = res?.ok ? await res.json() : { next: "/start" };
    router.replace(body.next ?? "/start");
  }

  async function resend() {
    setWait(RESEND_AFTER);
    setError(null);
    const res = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (!res?.ok) setError("We couldn't resend just now. Try again in a minute.");
  }

  return (
    <form onSubmit={verify} className="flex min-h-dvh flex-col px-7 pt-16 pb-10">
      <div className="flex flex-1 flex-col gap-7">
        <div className="flex size-16 items-center justify-center rounded-[18px] bg-navy">
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="3" stroke="#5369EE" strokeWidth="2" fill="none" />
            <path d="M4 7l8 6 8-6" stroke="#5369EE" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[32px] leading-[37px] font-medium tracking-tight">Check your email</h1>
          <p className="text-[17px] leading-6 text-slate">
            We sent a 6-digit code to <span className="font-bold text-navy">{email}</span>. Type it here, or tap the link in the email.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <input
            aria-label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            className="h-[62px] rounded-[18px] border-2 border-blue bg-white px-[18px] text-center text-[28px] font-semibold tracking-[0.4em] outline-none shadow-[0_0_0_5px_rgba(83,105,238,0.10)] placeholder:text-[#C9CED9]"
          />
          {error ? (
            <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[14px] leading-5 text-[#8E2335]">{error}</p>
          ) : null}
          <PrimaryButton type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</PrimaryButton>
          <div className="flex flex-col gap-1.5 rounded-2xl bg-white px-4 py-3.5">
            <span className="text-[14px] font-bold">Not there?</span>
            <span className="text-[14px] leading-5 text-slate">
              Check spam or promotions.{" "}
              {wait > 0 ? (
                <>You can resend in <span className="font-bold text-blue">0:{String(wait).padStart(2, "0")}</span>.</>
              ) : (
                <button type="button" onClick={resend} className="font-bold text-blue underline">Send a new code</button>
              )}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 text-[14px]">
        <span className="text-slate">Wrong email?</span>
        <Link href={`/sign-in?email=${encodeURIComponent(email)}`} className="font-bold text-blue">Change it</Link>
      </div>
    </form>
  );
}
