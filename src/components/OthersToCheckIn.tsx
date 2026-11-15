"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

// "Luna and Pepper still need today's check-in" (Ky, 15 Nov, 3a): a tap switches to that cat.
export default function OthersToCheckIn({ others }: { others: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!others.length) return null;
  const names = others.map((c) => c.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

  async function go(id: string) {
    const res = await fetch("/api/cats/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catId: id }) }).catch(() => null);
    if (res?.ok) start(() => router.refresh());
  }

  return (
    <div className={`flex flex-col gap-2 rounded-[20px] bg-white px-4.5 py-3.5 ${pending ? "opacity-70" : ""}`}>
      <p className="text-[15px] leading-5.5 font-semibold text-navy">
        {list} still {others.length === 1 ? "needs" : "need"} today&apos;s check-in.
      </p>
      <div className="flex flex-wrap gap-2">
        {others.map((c) => (
          <button key={c.id} onClick={() => go(c.id)} disabled={pending} className="h-9 rounded-full bg-paper px-4 text-[14px] font-semibold text-blue">
            Check in {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
