"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkPhoto } from "@/lib/photo-client";
import { labErrorMessage } from "@/lib/bloodwork";
import { catHeader } from "@/lib/cat-client";

// Bloodwork, explained: take or choose a photo of the lab report; it's read, saved and opened.
export default function AddLabReport({ catName, first }: { catName: string; first: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("photo", await shrinkPhoto(file, "bloodwork"), "report.jpg");
    const res = await fetch("/api/bloodwork", { method: "POST", body: form, headers: catHeader() }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && body.panelId) {
      router.push(`/watch/bloodwork/${body.panelId}`);
      router.refresh();
      return;
    }
    setBusy(false);
    setError(labErrorMessage(res ? res.status : null, body.error));
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void send(f);
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-navy text-[17px] font-semibold text-white disabled:opacity-60"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3.5" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
        {busy ? "Reading the report…" : first ? `Snap ${catName}'s lab report` : "Add a new lab report"}
      </button>
      {busy ? <p className="text-center text-[13px] text-slate">This takes about 20 seconds.</p> : null}
      {error ? <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[14px] text-[#8E2335]">{error}</p> : null}
    </div>
  );
}
