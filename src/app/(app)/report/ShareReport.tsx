"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionErrorMessage } from "@/lib/kidney-watch";

// "Share with my vet" (decision 8): the phone's share sheet with the report link, plus the PDF
// where the browser can share files. Without a share sheet, she gets Copy link and Download PDF.
// Safari only opens the share sheet straight after a tap, so when preparing the link took too
// long, a second "Send now" tap opens it with everything already in hand.

type Prepared = { url: string; file: File | null; title: string; text: string };
type State =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "tap_again"; p: Prepared }
  | { kind: "fallback"; p: Prepared; copied?: boolean }
  | { kind: "error"; message: string };

export default function ShareReport({ catName, vet, pdfFile, activeLinks, latestLinkExpires }: { catName: string; vet: string; pdfFile: string; activeLinks: number; latestLinkExpires: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [stopping, setStopping] = useState(false);

  async function prepare(): Promise<Prepared> {
    const [linkRes, pdf] = await Promise.all([
      fetch("/api/report/share", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(
        async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }),
        () => ({ status: null as number | null, body: {} as { error?: string } }),
      ),
      fetch("/api/report/pdf").then(
        async (r) => (r.ok ? r.blob() : (console.error("report_share_pdf_fetch_failed", r.status), null)),
        (e) => (console.error("report_share_pdf_fetch_failed network", e instanceof Error ? e.message : String(e)), null),
      ),
    ]);
    if (linkRes.status !== 200 || !linkRes.body.path) {
      console.error("report_share_link_failed", linkRes.status, linkRes.body.error ?? "");
      throw new Error(actionErrorMessage(linkRes.status, linkRes.body.error));
    }
    const url = new URL(linkRes.body.path, window.location.origin).toString();
    const file = pdf ? new File([pdf], pdfFile, { type: "application/pdf" }) : null;
    return { url, file, title: `${catName}'s vet report`, text: `${catName}'s health report for ${vet}, from AquaOne Health: ${url}` };
  }

  // Opens the share sheet. Returns false when the browser has no share sheet or refused it.
  async function openSheet(p: Prepared): Promise<"shared" | "cancelled" | "needs_tap" | "unsupported"> {
    if (typeof navigator.share !== "function") return "unsupported";
    const withFile = p.file && navigator.canShare?.({ files: [p.file] }) ? { files: [p.file], title: p.title, text: p.text } : null;
    try {
      await navigator.share(withFile ?? { title: p.title, text: `${catName}'s health report for ${vet}, from AquaOne Health.`, url: p.url });
      return "shared";
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError") return "needs_tap";
      console.error("report_share_sheet_failed", name, e instanceof Error ? e.message : String(e));
      return "unsupported";
    }
  }

  async function onShare() {
    setState({ kind: "preparing" });
    let p: Prepared;
    try {
      p = await prepare();
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : actionErrorMessage(null) });
      return;
    }
    router.refresh();
    await finish(p, await openSheet(p));
  }

  async function finish(p: Prepared, result: Awaited<ReturnType<typeof openSheet>>) {
    if (result === "shared" || result === "cancelled") setState({ kind: "idle" });
    else if (result === "needs_tap") setState({ kind: "tap_again", p });
    else setState({ kind: "fallback", p });
  }

  async function copy(p: Prepared) {
    try {
      await navigator.clipboard.writeText(p.url);
      setState({ kind: "fallback", p, copied: true });
    } catch (e) {
      console.error("report_share_copy_failed", e instanceof Error ? e.message : String(e));
      window.prompt("Copy this link for your vet", p.url);
    }
  }

  async function stopSharing() {
    setStopping(true);
    try {
      const r = await fetch("/api/report/share/revoke", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        console.error("report_share_revoke_failed", r.status, body.error ?? "");
        setState({ kind: "error", message: actionErrorMessage(r.status, body.error) });
      } else setState({ kind: "idle" });
    } catch (e) {
      console.error("report_share_revoke_failed network", e instanceof Error ? e.message : String(e));
      setState({ kind: "error", message: actionErrorMessage(null) });
    } finally {
      setStopping(false);
      router.refresh();
    }
  }

  const busy = state.kind === "preparing";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="flex h-13.5 flex-[1.4] items-center justify-center gap-2 rounded-full bg-navy text-[15px] leading-4.5 font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {busy ? "Getting it ready…" : "Share with my vet"}
        </button>
        <a
          href="/api/report/pdf"
          download={pdfFile}
          className="flex h-13.5 flex-1 items-center justify-center rounded-full border-[1.5px] border-line bg-white text-[15px] leading-4.5 font-semibold text-navy"
        >
          Download PDF
        </a>
      </div>

      {state.kind === "tap_again" ? (
        <div className="flex flex-col gap-2.5 rounded-[18px] bg-lilac-soft px-4 py-3.5">
          <p className="text-sm leading-5 text-[#2E3F9E]">Your report link is ready.</p>
          <button
            type="button"
            onClick={async () => finish(state.p, await openSheet(state.p))}
            className="flex h-11.5 items-center justify-center rounded-full bg-navy text-[15px] font-semibold text-white"
          >
            Send it now
          </button>
        </div>
      ) : null}

      {state.kind === "fallback" ? (
        <div className="flex flex-col gap-2.5 rounded-[18px] bg-white px-4 py-3.5">
          <p className="text-sm leading-5 text-slate">Send this link to {vet}, or attach the PDF to an email.</p>
          <p className="truncate rounded-lg bg-paper px-3 py-2 font-mono text-xs text-navy">{state.p.url}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => copy(state.p)} className="flex h-11 flex-1 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">
              {state.copied ? "Copied" : "Copy link"}
            </button>
            <a href="/api/report/pdf" download={pdfFile} className="flex h-11 flex-1 items-center justify-center rounded-full border-[1.5px] border-line text-sm font-semibold text-navy">
              Download PDF
            </a>
          </div>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <p role="alert" className="rounded-xl bg-[#FDECEE] px-3.5 py-2.5 text-sm leading-5 text-[#7A1F2E]">
          {state.message}
        </p>
      ) : null}

      {activeLinks > 0 ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-xs leading-4 text-slate">
            {activeLinks === 1 ? "1 link is" : `${activeLinks} links are`} live
            {latestLinkExpires ? ` until ${new Date(latestLinkExpires).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}.
          </span>
          <button type="button" onClick={stopSharing} disabled={stopping} className="shrink-0 text-xs leading-4 font-semibold text-red underline-offset-2 hover:underline disabled:opacity-50">
            {stopping ? "Stopping…" : "Stop sharing"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
