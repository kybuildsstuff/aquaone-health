"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Drop, PrimaryButton } from "@/components/ui";

const MESSAGES: Record<string, React.ReactNode> = {
  not_found: (
    <>
      We couldn&apos;t find a membership for this email. Use the email from your AquaOne order, or{" "}
      <a className="font-semibold text-blue underline" href="https://trypurestream.com">get AquaOne Health with your fountain</a>.
    </>
  ),
  ended: "Your membership has ended. Rejoin any time from trypurestream.com.",
  past_due: "Your last payment didn't go through. Check your card on your order email, then try again.",
  rate_limited: "Too many tries. Wait a minute, then try again.",
  link_expired: "That sign-in link has expired. Send yourself a new one.",
  invalid_email: "That doesn't look like an email address.",
  send_failed: "We couldn't send the email just now. Try again in a minute.",
};

export default function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      router.push(`/check-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      return;
    }
    const body = res ? await res.json().catch(() => ({})) : {};
    setError(body.error ?? "send_failed");
  }

  return (
    <form onSubmit={submit} className="flex min-h-dvh flex-col px-7 pt-16 pb-10">
      <div className="flex flex-1 flex-col gap-7">
        <div className="flex size-16 items-center justify-center rounded-[18px] bg-navy">
          <Drop size={24} color="#5369EE" />
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[32px] leading-[37px] font-medium tracking-tight">Welcome back</h1>
          <p className="text-[17px] leading-6 text-slate">
            Enter the email you used for your AquaOne order. We&apos;ll send you a sign-in code. No password needed.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex h-[62px] items-center gap-3 rounded-[18px] border-2 border-blue bg-white px-[18px] shadow-[0_0_0_5px_rgba(83,105,238,0.10)]">
            <span className="sr-only">Email</span>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="3" stroke="#5B6478" strokeWidth="2" fill="none" />
              <path d="M4 7l8 6 8-6" stroke="#5B6478" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-transparent text-[17px] font-medium outline-none placeholder:text-[#8A93A8]"
            />
          </label>
          {error && MESSAGES[error] ? (
            <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[14px] leading-5 text-[#8E2335]">
              {MESSAGES[error]}
            </p>
          ) : null}
          <PrimaryButton type="submit" disabled={busy}>{busy ? "Sending…" : "Send my sign-in code"}</PrimaryButton>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 text-[14px]">
        <span className="text-slate">Don&apos;t have AquaOne Health yet?</span>
        <a href="https://trypurestream.com" className="font-bold text-blue">See how it works</a>
      </div>
    </form>
  );
}
