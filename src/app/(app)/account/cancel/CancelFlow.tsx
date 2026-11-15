"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CancelOffer, CancelReason, Step } from "@/lib/cancel-flow";

export type RecordRow = { label: string; value: string; good?: boolean };

type Props = {
  catName: string | null;
  otherCats: string[];
  catId: string | null;
  checkIns: number;
  periodDays: number;
  rows: RecordRow[];
  chargeDate: string | null;
  priceLabel: string;
  halfLabel: string;
  saveLabel: string;
  portalUrl: string;
};

async function call(payload: Record<string, unknown>) {
  const res = await fetch("/api/membership/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error ?? "server_error");
  return data;
}

// Boards 22.1 (before you go) -> 22.2 (reason) -> 22.3 (offer) or 22.5 (her cat has died) -> 22.4 (confirm)
// -> 23 (cancelled) or 23.1 (staying at half price). Loop runs every step underneath.
export default function CancelFlow(p: Props) {
  const router = useRouter();
  const name = p.catName ?? "your cat";
  const [step, setStep] = useState<Step>("before");
  const [reasons, setReasons] = useState<CancelReason[] | null>(null);
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [offer, setOffer] = useState<CancelOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    try {
      await fn();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const toReasons = () =>
    run(async () => {
      if (!reasons) setReasons((await call({ action: "reasons" })).reasons);
      setStep("reason");
    });

  const chooseReason = () =>
    run(async () => {
      if (reasonId == null) return;
      const r = await call({ action: "choose", reasonId });
      setOffer(r.offer);
      setStep(r.step);
    });

  const accept = () =>
    run(async () => {
      if (reasonId == null || !offer) return;
      await call({ action: "accept", reasonId, offerId: offer.id });
      setStep("kept");
      router.refresh();
    });

  const cancel = () =>
    run(async () => {
      if (reasonId == null) return;
      await call({ action: "cancel", reasonId });
      setStep("cancelled");
      router.refresh();
    });

  const removeCat = () =>
    run(async () => {
      if (!p.catId) return;
      const res = await fetch("/api/cats/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catId: p.catId }) });
      if (!res.ok) throw new Error("archive_failed");
      router.push("/today");
      router.refresh();
    });

  const back = () => {
    if (step === "reason") setStep("before");
    else if (step === "offer" || step === "passed") setStep("reason");
    else if (step === "confirm") setStep(offer ? "offer" : "reason");
    else router.push("/account");
  };

  const done = step === "kept" || step === "cancelled";

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-navy">
      {!done ? (
        <div className="flex items-center gap-3 px-5 pt-[max(16px,env(safe-area-inset-top))]">
          <button type="button" onClick={back} aria-label="Back" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden><path d="M12.5 4L6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="text-[17px] leading-[22px] font-semibold">Cancel membership</span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 px-5 pt-[22px]">
        {step === "before" ? (
          <>
            <Head title="Before you go" sub={`Here's what AquaOne Health has learned about ${name} so far.`} />
            <section className="flex flex-col gap-3.5 rounded-[22px] bg-navy p-[18px] text-white">
              <span className="text-xs font-bold tracking-[0.08em] text-lilac">{name.toUpperCase()}&apos;S RECORD</span>
              <span className="text-[22px] leading-7 font-semibold">
                {p.checkIns} check-in{p.checkIns === 1 ? "" : "s"} in {p.periodDays} days
              </span>
              <dl className="flex flex-col">
                {p.rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3 border-t border-[#1E3354] py-[11px] last:pb-0">
                    <dt className="text-[14px] leading-5 text-[#B9C3DA]">{r.label}</dt>
                    <dd className={`text-right text-[14px] leading-5 font-semibold ${r.good ? "text-[#7FE0B4]" : ""}`}>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <Note>
              If you cancel, Kidney Watch stops{p.chargeDate ? ` on ${p.chargeDate}` : ""}, and so does learning {name}&apos;s normal.
            </Note>
          </>
        ) : null}

        {step === "reason" ? (
          <>
            <Head title="What's the main reason?" sub="It helps us make AquaOne Health better." />
            <fieldset className="flex flex-col rounded-[22px] bg-white px-[18px] py-1">
              <legend className="sr-only">Reason for cancelling</legend>
              {(reasons ?? []).map((r, i) => (
                <label key={r.id} className={`flex cursor-pointer items-center gap-3 py-[15px] ${i ? "border-t border-[#F1EFEB]" : ""}`}>
                  <input type="radio" name="reason" value={r.id} checked={reasonId === r.id} onChange={() => setReasonId(r.id)} className="peer sr-only" />
                  <span className={`size-[22px] shrink-0 rounded-full border-solid ${reasonId === r.id ? "border-[7px] border-blue" : "border-2 border-[#C9CED8]"}`} aria-hidden />
                  <span className={`text-[15px] leading-5 ${reasonId === r.id ? "font-semibold" : "font-medium"}`}>{r.reason}</span>
                </label>
              ))}
            </fieldset>
          </>
        ) : null}

        {step === "offer" && offer ? (
          <>
            <span className="self-start rounded-full bg-[#E8F6E9] px-2.5 py-1 text-xs font-extrabold tracking-[0.06em] text-[#2F8F3A]">A THANK-YOU FOR STAYING</span>
            <Head title={`Keep ${name}'s Kidney Watch for half price`} sub="Every renewal is 50% off, for as long as you stay. Nothing else changes, and you can still cancel any time." />
            <section className="flex flex-col gap-3.5 rounded-[22px] border-2 border-[#2F8F3A] bg-white p-[18px]">
              <div className="flex items-baseline gap-2.5">
                <span className="text-[36px] leading-10 font-bold tracking-[-0.02em]">{p.halfLabel}</span>
                <span className="text-[17px] text-[#8A93A8] line-through">{p.priceLabel}</span>
                <span className="text-[15px] text-slate">every 30 days</span>
              </div>
              <dl className="flex flex-col text-[14px] leading-5">
                <Row label={p.chargeDate ? `Your next charge, ${p.chargeDate}` : "Your next charge"} value={p.halfLabel} />
                <Row label="Every renewal after" value={p.halfLabel} />
                <Row label="You save" value={`${p.saveLabel} every time`} green last />
              </dl>
            </section>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <Head
              title="Cancel your membership?"
              sub={p.chargeDate ? `You won't be charged on ${p.chargeDate}. You keep full access until then.` : "You won't be charged again, and you keep full access to the end of what you've already got."}
            />
            <section className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-3.5">
              <span className="text-xs font-bold tracking-[0.08em] text-[#6B7590]">{p.chargeDate ? `AFTER ${p.chargeDate.toUpperCase()}` : "AFTERWARDS"}</span>
              <Bullet>Kidney Watch, Ask and Is it safe? stop</Bullet>
              <Bullet>{name}&apos;s history is kept for 12 months if you come back</Bullet>
              <Bullet>Your vet report link keeps working for 30 days</Bullet>
            </section>
          </>
        ) : null}

        {step === "passed" ? (
          <>
            <Head title={`We're so sorry about ${name}`} sub={`Thank you for taking such good care of ${name}. We'll cancel your membership, and you won't be charged again.`} />
            <section className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-3.5">
              <span className="text-xs font-bold tracking-[0.08em] text-[#6B7590]">{name.toUpperCase()}&apos;S RECORDS</span>
              <p className="text-[14px] leading-5">{name}&apos;s history is kept for 12 months, in case your vet ever asks for it. You can open {name}&apos;s report now.</p>
              <Link href="/report" className="self-start rounded-full border-[1.5px] border-[#DDE2EC] px-3.5 py-2 text-[14px] font-semibold">
                Open {name}&apos;s report
              </Link>
            </section>
            {p.otherCats.length > 0 ? (
              <section className="flex flex-col gap-1.5 rounded-2xl bg-[#EEF0FD] px-4 py-3.5">
                <span className="text-[14px] font-semibold">Other cats at home?</span>
                <span className="text-[14px] leading-5 text-slate">You can remove {name} and keep watching {p.otherCats.join(" and ")} instead.</span>
                <button type="button" onClick={removeCat} disabled={busy} className="self-start text-[14px] font-semibold text-blue disabled:opacity-60">
                  Remove {name}, keep my membership
                </button>
              </section>
            ) : null}
          </>
        ) : null}

        {step === "kept" ? (
          <Done title="You're staying at half price" sub={`Thanks for staying. ${name}'s Kidney Watch keeps going, and nothing else changes.`}>
            <Row label="Every renewal" value={p.halfLabel} first />
            <Row label="Next charge" value={p.chargeDate ?? "As before"} />
            <Row label="For as long as you stay" value="50% off" last />
          </Done>
        ) : null}

        {step === "cancelled" ? (
          <Done title="You're all set" sub={`Your membership is cancelled, and you won't be charged again. Changed your mind? You can rejoin any time, and ${name}'s normal will be right where you left it.`}>
            <Row label="Full access until" value={p.chargeDate ?? "The end of your current month"} first />
            <Row label="Next charge" value="None" />
            <Row label={`${name}'s history`} value="Kept 12 months" last />
          </Done>
        ) : null}

        {failed ? (
          <div role="alert" className="flex flex-col gap-1.5 rounded-2xl bg-[#FDECEE] px-4 py-3.5 text-[14px] leading-5">
            <span className="font-semibold text-[#B4233A]">We couldn&apos;t reach your membership just now.</span>
            <span>
              Try again in a moment, or{" "}
              <a href={p.portalUrl} target="_blank" rel="noopener" className="font-semibold text-blue underline">
                manage it in your PureStream account
              </a>
              .
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 px-5 pt-6 pb-[max(40px,env(safe-area-inset-bottom))]">
        {step === "before" ? (
          <>
            <Primary onClick={() => router.push("/today")}>Keep my membership</Primary>
            <Secondary onClick={toReasons} disabled={busy}>{busy ? "One moment…" : "Continue to cancel"}</Secondary>
          </>
        ) : null}
        {step === "reason" ? (
          <>
            <Primary onClick={chooseReason} disabled={busy || reasonId == null}>{busy ? "One moment…" : "Continue"}</Primary>
            <Secondary onClick={() => router.push("/today")}>Keep my membership</Secondary>
          </>
        ) : null}
        {step === "offer" && offer ? (
          <>
            <Primary onClick={accept} disabled={busy} tone="green">{busy ? "One moment…" : "Keep it at half price"}</Primary>
            <Secondary onClick={() => setStep("confirm")} disabled={busy}>No thanks, cancel</Secondary>
          </>
        ) : null}
        {step === "confirm" ? (
          <>
            <Primary onClick={cancel} disabled={busy} tone="red">{busy ? "Cancelling…" : "Cancel membership"}</Primary>
            <Secondary onClick={() => router.push("/today")} strong>Keep it</Secondary>
          </>
        ) : null}
        {step === "passed" ? (
          <>
            <Primary onClick={cancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel membership"}</Primary>
            <Secondary onClick={() => router.push("/account")}>Not now</Secondary>
          </>
        ) : null}
        {done ? <Primary onClick={() => router.push("/today")}>Back to {p.catName ? `${p.catName}'s` : "your"} day</Primary> : null}
      </div>
    </div>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.01em]">{title}</h1>
      <p className="text-[15px] leading-[22px] text-slate">{sub}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3.5">
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[13px] font-extrabold text-blue" aria-hidden>i</span>
      <p className="text-[14px] leading-5">{children}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2.5 text-[14px] leading-5">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#8A93A8]" aria-hidden />
      {children}
    </span>
  );
}

function Row({ label, value, green, first, last }: { label: string; value: string; green?: boolean; first?: boolean; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-[11px] ${first ? "" : "border-t border-[#F1EFEB]"} ${last ? "pb-0" : ""}`}>
      <dt className="text-slate">{label}</dt>
      <dd className={`font-semibold ${green ? "text-[#2F8F3A]" : ""}`}>{value}</dd>
    </div>
  );
}

function Done({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-10">
      <span className="flex size-24 items-center justify-center rounded-full bg-[#E8F6E9]">
        <span className="flex size-[60px] items-center justify-center rounded-full bg-[#2F8F3A]">
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </span>
      <h1 className="text-center text-[26px] leading-8 font-semibold tracking-[-0.01em]">{title}</h1>
      <p className="text-center text-[15px] leading-[22px] text-slate">{sub}</p>
      <dl className="flex w-full flex-col rounded-[20px] bg-white px-[18px] py-2 text-[14px] leading-5">{children}</dl>
    </div>
  );
}

function Primary({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "green" | "red" }) {
  const bg = tone === "green" ? "bg-[#2F8F3A]" : tone === "red" ? "bg-red" : "bg-navy";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`h-14 rounded-full text-[17px] font-semibold text-white disabled:opacity-60 ${bg}`}>
      {children}
    </button>
  );
}

function Secondary({ children, onClick, disabled, strong }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`h-12 text-[16px] font-semibold disabled:opacity-60 ${strong ? "text-navy" : "text-slate"}`}>
      {children}
    </button>
  );
}
