"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABEL, PHOTO_MAX_BYTES, pickMatch, type SafetyMatch } from "@/lib/safe";
import { SeverityBadge } from "./parts";

// The search box and camera button. While she types, matches from our list replace the tiles
// (children); picking one, or the "not on our list" answer, logs the lookup and opens it.

type PhotoResponse = { ok: true; itemId: string | null; query: string; candidates: { id: string }[] } | { error: string };

const PHOTO_ERRORS: Record<string, string> = {
  too_large: "That photo is too big. Try again, or type the name.",
  bad_type: "That file isn't a photo we can read. Try a JPEG or PNG, or type the name.",
  identify_failed: "We couldn't look at that photo just now. Try again, or type the name.",
  signed_out: "You've been signed out. Sign in again to check a photo.",
};

export default function SafeSearch({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Results remember which query they answer, so stale ones are never shown for new text.
  const [found, setFound] = useState<{ query: string; results: SafetyMatch[] } | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/safe/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: query }) });
        const body = await res.json().catch(() => ({}));
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(`search ${res.status} ${body.error ?? ""}`);
        setSearchError(false);
        setFound({ query, results: body.results as SafetyMatch[] });
      } catch (e) {
        console.error("safe_search_failed", e instanceof Error ? e.message : String(e));
        if (mine === seq.current) setSearchError(true);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  async function open(itemId: string | null) {
    const query = q.trim();
    setOpening(true);
    try {
      const res = await fetch("/api/safe/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: query, itemId }) });
      if (!res.ok) console.error("safe_lookup_failed", res.status, (await res.json().catch(() => ({}))).error ?? "");
    } catch (e) {
      // Logging must never stand between her and the answer.
      console.error("safe_lookup_failed", e instanceof Error ? e.message : String(e));
    }
    router.push(itemId ? `/safe/item/${itemId}` : `/safe/unknown?q=${encodeURIComponent(query)}`);
  }

  // Enter: search fresh (the list on screen may be a keystroke behind), then open the top match if
  // it's a clear one, show the list if it's a close call, otherwise the "not on our list" answer.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    let matches: SafetyMatch[];
    try {
      const res = await fetch("/api/safe/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: query }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`search ${res.status} ${body.error ?? ""}`);
      matches = body.results as SafetyMatch[];
    } catch (err) {
      console.error("safe_search_failed", err instanceof Error ? err.message : String(err));
      setSearchError(true);
      return;
    }
    const pick = pickMatch(matches, query);
    // Equally good matches with different answers: show them and let her pick.
    if (pick.kind === "ambiguous") return setFound({ query, results: matches });
    void open(pick.kind === "item" ? pick.match.id : null);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const photo = await shrink(file);
      if (photo.size > PHOTO_MAX_BYTES) throw new PhotoError("too_large");
      const form = new FormData();
      form.append("photo", photo, "photo.jpg");
      const res = await fetch("/api/safe/photo", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({ error: "server_error" }))) as PhotoResponse;
      if (!res.ok || "error" in body) throw new PhotoError("error" in body ? body.error : `http_${res.status}`);
      if (body.itemId) router.push(`/safe/item/${body.itemId}?via=photo`);
      else router.push(`/safe/unknown?via=photo&q=${encodeURIComponent(body.query)}&c=${body.candidates.map((c) => c.id).join(",")}`);
    } catch (e) {
      const code = e instanceof PhotoError ? e.code : "exception";
      console.error("safe_photo_failed", code, e instanceof Error ? e.message : String(e));
      setPhotoError(PHOTO_ERRORS[code] ?? "Something went wrong with that photo. Try again, or type the name.");
      setPhotoBusy(false);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const typing = q.trim().length >= 2;
  // While the next search runs, keep showing the last results rather than flashing "Searching…".
  const results = found ? found.results : null;

  return (
    <>
      <form onSubmit={submit} className="flex gap-2.5">
        <label className="flex h-14 flex-1 items-center gap-2.5 rounded-[18px] border border-line bg-white px-4">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="shrink-0">
            <circle cx="9" cy="9" r="6" fill="none" stroke="#5B6478" strokeWidth="2" />
            <path d="M13.5 13.5L17 17" stroke="#5B6478" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type anything…"
            aria-label="What do you want to check?"
            maxLength={120}
            className="min-w-0 flex-1 bg-transparent text-base leading-5 text-navy outline-none placeholder:text-[#8A93A8]"
          />
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photoBusy}
          aria-label="Check with a photo"
          className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-navy disabled:opacity-60"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8A1.5 1.5 0 0 1 10.6 3.5h2.8a1.5 1.5 0 0 1 1.3.7L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
            <circle cx="12" cy="12.5" r="3.3" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
          </svg>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </form>

      {photoBusy && (
        <div className="flex items-center gap-3 rounded-[18px] bg-navy px-4 py-3.5 text-[15px] leading-5 text-white" role="status">
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Looking at your photo…
        </div>
      )}
      {photoError && (
        <p className="rounded-[18px] bg-[#FDECEE] px-4 py-3 text-sm leading-5 text-[#8E2335]" role="alert">
          {photoError}
        </p>
      )}

      {typing ? (
        <div className={`flex flex-col rounded-[22px] bg-white px-4.5 py-1 transition-opacity ${opening ? "pointer-events-none opacity-50" : ""}`} aria-busy={opening}>
          {searchError ? (
            <p className="py-3.5 text-[15px] leading-5 text-slate">We couldn&apos;t search just now. Check your connection and try again.</p>
          ) : results === null ? (
            <p className="py-3.5 text-[15px] leading-5 text-slate">Searching…</p>
          ) : (
            <>
              {results.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => open(r.id)}
                  className={`flex items-center justify-between gap-3 py-3 text-left ${i > 0 ? "border-t border-[#F1EFEB]" : ""}`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] leading-4.5 font-semibold text-navy">{r.name}</span>
                    <span className="truncate text-xs leading-4 text-slate">
                      {CATEGORY_LABEL[r.category].replace(/s$/, "")}
                      {r.matched.toLowerCase() !== r.name.toLowerCase() ? ` · also called ${r.matched}` : ""}
                    </span>
                  </span>
                  <SeverityBadge severity={r.severity} />
                </button>
              ))}
              <button type="button" onClick={() => open(null)} className={`py-3.5 text-left text-sm leading-5 font-semibold text-blue ${results.length ? "border-t border-[#F1EFEB]" : ""}`}>
                {results.length ? "Not in this list? See what to do" : "Not on our list. See what to do"}
              </button>
            </>
          )}
        </div>
      ) : (
        children
      )}
    </>
  );
}

class PhotoError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// Phone photos are several MB; the model only needs about 1600px. Re-encoding as JPEG also turns
// an iPhone HEIC into something the server accepts. Falls back to the original file.
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob && blob.size > 0) return blob;
  } catch (e) {
    console.error("safe_photo_resize_failed", e instanceof Error ? e.message : String(e));
  }
  return file;
}
