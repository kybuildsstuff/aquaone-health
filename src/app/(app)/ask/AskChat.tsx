"use client";
import { useEffect, useRef, useState } from "react";
import { Drop } from "@/components/ui";
import { BackLink } from "@/components/watch";
import { EMERGENCY_VET_MAPS_URL, telHref, vetLabel, words, type Pronoun } from "@/lib/cat";
import {
  MAX_QUESTION_CHARS,
  POISON_LINE,
  URGENT_FOLLOW_UP,
  askErrorMessage,
  parseAnswer,
  primaryFlag,
  starterQuestions,
  urgentCopy,
  type FlagId,
} from "@/lib/ask";

export type ChatItem = { id: string; role: "user" | "assistant"; text: string; at: string; flags: FlagId[]; pending?: boolean };
type Cat = { name: string; pronoun: Pronoun; vetName: string | null; vetPhone: string | null };

// The Ask screen from the Paper designs ("11 Ask" and "12 Ask · urgent").
export default function AskChat({ cat, tz, initial, initialRemaining }: { cat: Cat; tz: string; initial: ChatItem[]; initialRemaining: number }) {
  const [items, setItems] = useState<ChatItem[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const scroller = useRef<HTMLDivElement>(null);
  const w = words(cat.pronoun);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  const last = items[items.length - 1];
  const chips =
    items.length === 0 ? [] : last?.role === "assistant" && !last.pending ? (last.flags.length ? [URGENT_FOLLOW_UP] : parseAnswer(last.text).followUps) : [];

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    if (q.length > MAX_QUESTION_CHARS) {
      setError(askErrorMessage(400, "too_long", cat.name));
      return;
    }
    setError(null);
    setBusy(true);
    setDraft("");
    const now = new Date().toISOString();
    const pendingId = `pending-${now}`;
    setItems((xs) => [...xs, { id: `q-${now}`, role: "user", text: q, at: now, flags: [] }]);
    const update = (patch: Partial<ChatItem>) =>
      setItems((xs) => {
        const has = xs.some((x) => x.id === pendingId);
        const base: ChatItem = { id: pendingId, role: "assistant", text: "", at: new Date().toISOString(), flags: [], pending: true };
        return has ? xs.map((x) => (x.id === pendingId ? { ...x, ...patch } : x)) : [...xs, { ...base, ...patch }];
      });

    let res: Response;
    try {
      res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: q }) });
    } catch {
      setError(askErrorMessage(null, undefined, cat.name));
      setDraft(q);
      setItems((xs) => xs.filter((x) => x.id !== `q-${now}`));
      setBusy(false);
      return;
    }
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      setError(askErrorMessage(res.status, body.error, cat.name));
      if (body.error === "daily_cap") setRemaining(0);
      else setDraft(q);
      setItems((xs) => xs.filter((x) => x.id !== `q-${now}`));
      setBusy(false);
      return;
    }

    // NDJSON: the urgent card can arrive before the answer.
    let sawUrgent = false;
    let answered = false;
    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "urgent") {
            sawUrgent = true;
            update({ flags: e.flags });
          } else if (e.type === "answer") {
            answered = true;
            update({ id: e.id, text: e.text, flags: e.flags, pending: false });
            setRemaining(e.remaining);
          } else if (e.type === "error") {
            if (sawUrgent) update({ text: "Please go now. I'll be here when you're back.", pending: false });
            setError(askErrorMessage(500, e.error, cat.name));
          }
        }
        if (done) break;
      }
    } catch {
      setError(askErrorMessage(null, undefined, cat.name));
    }
    if (!answered && !sawUrgent) setItems((xs) => xs.filter((x) => x.id !== pendingId));
    if (!answered && sawUrgent) update({ text: "Please go now. I'll be here when you're back.", pending: false });
    setBusy(false);
  }

  return (
    <div className="page-in flex h-dvh flex-col bg-paper">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#EFEDE9] px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3.5">
        <BackLink href="/today" />
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue">
          <Drop size={15} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <h1 className="truncate text-[17px] leading-5.5 font-semibold">Ask about {cat.name}</h1>
          <p className="flex items-center gap-1.5 text-[13px] leading-4 text-slate">
            <span className="size-1.75 shrink-0 rounded-full bg-green" />
            Knows {cat.name} and {w.poss} last 14 days
          </p>
        </div>
      </header>

      <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3.5 pb-3" aria-live="polite">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col justify-end gap-5 pb-2">
            <div className="flex flex-col gap-2 px-2">
              <p className="text-[26px] leading-8 font-medium tracking-[-0.02em]">
                Ask me anything about {cat.name}, any hour. I already know {w.obj}.
              </p>
              <p className="text-[15px] leading-5.5 text-slate">
                {cat.name}&apos;s profile and last 14 days of check-ins come with every question. If something can&apos;t wait, I&apos;ll say so straight away.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              {starterQuestions(cat).map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} disabled={busy} className="rounded-2xl border border-line bg-white px-4 py-3 text-left text-[15px] leading-5 font-medium">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {items.map((m, i) => (
          <div key={m.id} className="flex flex-col gap-3">
            {showTime(items, i) ? (
              <p className="text-center text-xs leading-4 font-semibold text-[#8A93A8]" suppressHydrationWarning>
                {timeLabel(m.at, tz)}
              </p>
            ) : null}
            {m.role === "user" ? <UserBubble text={m.text} /> : <AssistantBlock item={m} cat={cat} />}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 bg-paper px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
        {error ? (
          <p role="alert" className="rounded-xl bg-[#FDECEE] px-3 py-2.5 text-sm leading-5 text-[#5A1F2A]">
            {error}
            {remaining === 0 ? (
              <>
                {" "}
                <a href={EMERGENCY_VET_MAPS_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  Find an emergency vet
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {chips.length && !busy ? (
          <div className="flex gap-2 overflow-x-auto">
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => ask(c)} className="shrink-0 rounded-full border border-line bg-white px-3 py-2 text-[13px] leading-4 font-medium whitespace-nowrap">
                {c}
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex h-13.5 shrink-0 items-center gap-2.5 rounded-full border border-line bg-white pr-2 pl-4.5"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={remaining === 0 ? "Back tomorrow…" : `Ask anything about ${cat.name}…`}
            aria-label={`Ask anything about ${cat.name}`}
            enterKeyHint="send"
            maxLength={MAX_QUESTION_CHARS}
            className="min-w-0 flex-1 bg-transparent text-base leading-5 outline-none placeholder:text-[#8A93A8]"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-navy disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
        <p className="text-center text-[11px] leading-3.5 text-[#8A93A8]">
          {remaining > 0 && remaining <= 5 ? `${remaining} ${remaining === 1 ? "question" : "questions"} left today. ` : ""}Guidance, not a diagnosis. Your vet has the final word.
        </p>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[78%] rounded-t-[20px] rounded-br-md rounded-bl-[20px] bg-navy px-4 py-3 text-base leading-5.5 whitespace-pre-wrap text-white">{text}</p>
    </div>
  );
}

function AssistantBlock({ item, cat }: { item: ChatItem; cat: Cat }) {
  const flag = primaryFlag(item.flags);
  if (flag) {
    return (
      <div className="flex max-w-[330px] flex-col gap-2.5">
        <UrgentCard flag={flag} cat={cat} />
        {item.pending ? <Typing /> : item.text ? <p className="rounded-[18px] bg-white px-4 py-3 text-[15px] leading-5.5 whitespace-pre-wrap">{item.text}</p> : null}
      </div>
    );
  }
  if (item.pending) return <Typing />;

  const a = parseAnswer(item.text);
  const vetTel = telHref(cat.vetPhone);
  const go = a.goNow?.match(/^(go to a vet now,? any hour,? if (he|she|they|it|\S+))\s*:?\s*(.*)$/i);
  return (
    <div className="flex max-w-[318px] flex-col gap-2.5">
      {a.paras.length ? (
        <div className="flex flex-col gap-2 rounded-t-[20px] rounded-br-[20px] rounded-bl-md bg-white px-4 py-3.5 text-base leading-5.75">
          {a.paras.map((p, i) => (
            <p key={i}>
              <Rich text={p} />
            </p>
          ))}
        </div>
      ) : null}
      {a.steps.length || a.goNow ? (
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-white px-4 py-3.5">
          {a.steps.length ? (
            <>
              <p className="text-xs leading-4 font-bold tracking-[0.08em] text-blue">WHAT I&apos;D DO</p>
              {a.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-lilac-soft text-xs leading-4 font-bold text-blue">{i + 1}</span>
                  <p className="text-[15px] leading-5.25">
                    <Rich text={s} />
                  </p>
                </div>
              ))}
            </>
          ) : null}
          {a.goNow ? (
            <div className="flex flex-col gap-1 rounded-xl bg-[#FDECEE] px-3 py-2.5">
              <p className="text-[13px] leading-4 font-bold text-[#8E2335]">{go ? go[1] : "Go to a vet now, any hour, if"}</p>
              <p className="text-sm leading-5 text-[#5A1F2A]">{go ? go[3] : a.goNow}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {a.steps.length && vetTel ? (
        <div className="flex gap-2">
          <a href={vetTel} className="flex items-center gap-1.5 rounded-full bg-lilac-soft px-3.5 py-2.5 text-sm leading-4.5 font-semibold text-[#2E3F9E]">
            Call {vetLabel(cat.vetName)}
          </a>
        </div>
      ) : null}
    </div>
  );
}

function UrgentCard({ flag, cat }: { flag: FlagId; cat: Cat }) {
  const copy = urgentCopy(flag, cat);
  const vetTel = telHref(cat.vetPhone);
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-[22px] bg-red p-4.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white text-[17px] leading-5.5 font-extrabold text-red">!</span>
        <span className="text-[13px] leading-4 font-bold tracking-[0.08em] text-[#FFD9DF]">THIS CAN&apos;T WAIT</span>
      </div>
      <p className="text-xl leading-6.5 font-semibold text-white">{copy.title}</p>
      <p className="text-[15px] leading-5.5 text-[#FFE6EA]">{copy.body}</p>
      {flag === "poisoning" ? (
        <a href={POISON_LINE.tel} className="flex h-13 shrink-0 items-center justify-center gap-2 rounded-full bg-white text-base leading-5 font-bold text-red">
          <Phone />
          Call animal poison control
        </a>
      ) : null}
      <a
        href={EMERGENCY_VET_MAPS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex h-13 shrink-0 items-center justify-center gap-2 rounded-full text-base leading-5 font-bold ${flag === "poisoning" ? "border-[1.5px] border-white text-white" : "bg-white text-red"}`}
      >
        <Pin color={flag === "poisoning" ? "#fff" : "#B4233A"} />
        Find nearest emergency vet
      </a>
      <div className="flex justify-center">
        {flag === "poisoning" ? (
          <p className="text-center text-[13px] leading-4.5 text-[#FFE6EA]">
            {POISON_LINE.name}, {POISON_LINE.display}, 24/7. A fee may apply.
          </p>
        ) : vetTel ? (
          <a href={vetTel} className="text-sm leading-4.5 font-semibold text-white underline decoration-1">
            Or call {vetLabel(cat.vetName)}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-t-[20px] rounded-br-[20px] rounded-bl-md bg-white px-4 py-4" aria-label="Thinking">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-2 animate-bounce rounded-full bg-[#8A93A8]" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

// **bold** only; everything else is plain text.
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const Phone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z" fill="#B4233A" />
  </svg>
);

const Pin = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill={color} />
  </svg>
);

// A time label before the first message and after any gap of 30 minutes or more.
function showTime(items: ChatItem[], i: number) {
  if (i === 0) return true;
  return Date.parse(items[i].at) - Date.parse(items[i - 1].at) >= 30 * 60000;
}

function timeLabel(iso: string, tz: string) {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/\s?([AP]M)/, (_, m: string) => ` ${m.toLowerCase()}`);
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86400000));
  if (day(d) === today) return `Today ${time}`;
  if (day(d) === yesterday) return `Yesterday ${time}`;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d)}, ${time}`;
}
