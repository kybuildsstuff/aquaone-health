"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@/components/ui";
import { actionErrorMessage } from "@/lib/kidney-watch";

type Task = { id: string; title: string; detail: string | null };

// Today's three care tasks. A tick shows at once and is saved in the background;
// if the save fails the tick is put back and she is told why.
export default function CarePlanCard({ tasks, initialDone }: { tasks: Task[]; initialDone: string[] }) {
  const router = useRouter();
  const [done, setDone] = useState<string[]>(initialDone);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string) {
    const nowDone = !done.includes(id);
    const before = done;
    setDone(nowDone ? [...done, id] : done.filter((x) => x !== id));
    setError(null);
    const res = await fetch("/api/care-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: id, done: nowDone }),
    }).catch(() => null);
    if (res?.ok) {
      const body = await res.json().catch(() => null);
      if (body?.doneIds) setDone(body.doneIds);
      router.refresh();
      return;
    }
    setDone(before);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (body.error === "not_in_plan") router.refresh();
    setError(actionErrorMessage(res ? res.status : null, body.error));
  }

  const count = tasks.filter((t) => done.includes(t.id)).length;
  return (
    <div className="flex flex-col gap-1 rounded-[22px] bg-white px-4.5 py-4">
      <div className="flex items-center justify-between pb-1.5">
        <h2 className="text-[15px] leading-4.5 font-bold">Today&apos;s care</h2>
        <div className="flex items-center gap-2">
          <div className="flex h-1.5 w-14 shrink-0 rounded-full bg-[#EFEDE9]">
            <div className="h-1.5 rounded-full bg-blue transition-all" style={{ width: `${tasks.length ? (count / tasks.length) * 100 : 0}%` }} />
          </div>
          <span className="text-[13px] leading-4 font-semibold text-slate">
            {count === tasks.length && count > 0 ? "All done" : `${count} of ${tasks.length}`}
          </span>
        </div>
      </div>
      {tasks.map((t) => {
        const on = done.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(t.id)}
            className="flex items-center gap-3 border-t border-[#F1EFEB] py-2.5 text-left"
          >
            {on ? (
              <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-blue">
                <Check />
              </span>
            ) : (
              <span className="size-6.5 shrink-0 rounded-full border-2 border-[#C9D1FB]" />
            )}
            {on ? (
              <span className="flex-1 text-[15px] leading-4.5 font-medium text-[#8A93A8] line-through">{t.title}</span>
            ) : (
              <span className="flex flex-1 flex-col gap-px">
                <span className="text-[15px] leading-4.5 font-semibold">{t.title}</span>
                {t.detail ? <span className="text-[13px] leading-4 text-slate">{t.detail}</span> : null}
              </span>
            )}
          </button>
        );
      })}
      {error ? <p role="alert" className="mt-1 rounded-xl bg-[#FDECEE] px-3.5 py-2.5 text-[14px] text-[#8E2335]">{error}</p> : null}
    </div>
  );
}
