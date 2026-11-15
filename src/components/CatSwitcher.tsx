"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setShownCat } from "@/lib/cat-client";

// Every cat in the house (Ky, 15 Nov, 3a): one cat at a time, switched with a tap. Shown only when
// she has more than one cat. "todo" marks cats still without today's check-in.
export default function CatSwitcher({ cats, currentId, todo = [], className = "" }: { cats: { id: string; name: string }[]; currentId: string; todo?: string[]; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState(currentId);
  const [error, setError] = useState(false);
  setShownCat(currentId);
  if (cats.length < 2) return null;

  async function pick(id: string) {
    if (id === picked || pending) return;
    setPicked(id);
    setError(false);
    const res = await fetch("/api/cats/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catId: id }) }).catch(() => null);
    if (!res?.ok) {
      setPicked(currentId);
      setError(true);
      return;
    }
    start(() => router.refresh());
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div role="tablist" aria-label="Your cats" className={`flex gap-2 overflow-x-auto ${pending ? "opacity-70" : ""}`}>
        {cats.map((c) => {
          const on = c.id === picked;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={on}
              onClick={() => pick(c.id)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold ${on ? "bg-navy text-white" : "bg-white text-navy"}`}
            >
              {c.name}
              {!on && todo.includes(c.id) ? <span aria-label="still needs today's check-in" className="size-1.5 rounded-full bg-blue" /> : null}
            </button>
          );
        })}
        <Link href="/account#cats" aria-label="Manage your cats" className="flex h-9 shrink-0 items-center rounded-full px-3 text-[14px] font-semibold text-slate">
          Edit
        </Link>
      </div>
      {error ? <p role="alert" className="text-[13px] text-[#8E2335]">We couldn&apos;t switch cats. Try again.</p> : null}
    </div>
  );
}
