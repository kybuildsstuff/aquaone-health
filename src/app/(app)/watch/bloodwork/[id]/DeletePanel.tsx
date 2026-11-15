"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Deletes this report, its results and its photo, after a second tap.
export default function DeletePanel({ panelId }: { panelId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/bloodwork/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ panelId }) }).catch(() => null);
    if (res?.ok) {
      router.replace("/watch/bloodwork");
      router.refresh();
      return;
    }
    setBusy(false);
    setError(true);
  }

  if (!asking)
    return (
      <button onClick={() => setAsking(true)} className="text-[14px] font-semibold text-slate">
        Delete this report
      </button>
    );
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-white px-4 py-3.5">
      <p className="text-center text-[14px] leading-5">Delete these results and the photo? This can&apos;t be undone.</p>
      <div className="flex gap-2">
        <button onClick={remove} disabled={busy} className="h-10 rounded-full bg-navy px-4 text-[14px] font-semibold text-white">
          {busy ? "Deleting…" : "Delete"}
        </button>
        <button onClick={() => setAsking(false)} className="h-10 rounded-full px-4 text-[14px] font-semibold text-slate">
          Keep
        </button>
      </div>
      {error ? <p role="alert" className="text-[13px] text-[#8E2335]">We couldn&apos;t delete it. Try again.</p> : null}
    </div>
  );
}
