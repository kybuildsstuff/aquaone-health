"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CAT_ERRORS, MAX_CATS } from "@/lib/cats";

type C = { id: string; name: string };

// Every cat in the house (Ky, 15 Nov): her cats, add another (up to four), remove one (archived,
// history kept, 4a) and bring one back.
export default function YourCats({ cats, currentId, archived }: { cats: C[]; currentId: string; archived: C[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "select" | "archive" | "restore", catId: string) {
    setError(null);
    const res = await fetch(`/api/cats/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catId }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setConfirming(null);
    if (!res?.ok) return setError(CAT_ERRORS[body.error as string] ?? "Something went wrong. Try again in a moment.");
    start(() => router.refresh());
  }

  return (
    <section id="cats" aria-label="Your cats" className={`flex flex-col rounded-[22px] bg-white px-[18px] py-2 ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between py-3">
        <span className="text-xs font-bold tracking-[0.08em] text-slate">YOUR CATS · {cats.length} OF {MAX_CATS}</span>
        {cats.length < MAX_CATS ? (
          <Link href="/onboarding?add=1" className="text-[15px] font-semibold text-blue">
            Add a cat
          </Link>
        ) : null}
      </div>
      {cats.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 border-t border-[#EFEDE9] py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lilac text-[15px] font-semibold">{c.name.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{c.name}</span>
            {c.id === currentId ? (
              <span className="text-[13px] font-semibold text-slate">Showing now</span>
            ) : (
              <button onClick={() => call("select", c.id)} disabled={pending} className="text-[14px] font-semibold text-blue">
                Show
              </button>
            )}
            {cats.length > 1 ? (
              <button onClick={() => setConfirming(confirming === c.id ? null : c.id)} disabled={pending} className="pl-2 text-[14px] font-semibold text-slate">
                Remove
              </button>
            ) : null}
          </div>
          {confirming === c.id ? (
            <div className="flex flex-col gap-2.5 rounded-2xl bg-paper px-4 py-3">
              <p className="text-[14px] leading-5 text-navy">
                Remove {c.name} from your cats? {c.name}&apos;s history is kept, and you can bring {c.name} back here any time.
              </p>
              <div className="flex gap-2">
                <button onClick={() => call("archive", c.id)} disabled={pending} className="h-10 rounded-full bg-navy px-4 text-[14px] font-semibold text-white">
                  Remove {c.name}
                </button>
                <button onClick={() => setConfirming(null)} className="h-10 rounded-full px-4 text-[14px] font-semibold text-slate">
                  Keep
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
      {archived.length > 0 ? (
        <div className="flex flex-col border-t border-[#EFEDE9] py-3">
          <span className="pb-1.5 text-xs font-bold tracking-[0.08em] text-slate">REMOVED</span>
          {archived.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1.5">
              <span className="text-[15px] text-slate">{c.name}</span>
              <button onClick={() => call("restore", c.id)} disabled={pending} className="text-[14px] font-semibold text-blue">
                Bring back
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className="mb-2 rounded-2xl bg-[#FDECEE] px-4 py-3 text-[14px] text-[#8E2335]">{error}</p> : null}
    </section>
  );
}
