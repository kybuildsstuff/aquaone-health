import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAccount } from "@/lib/account.server";
import { reminderSummary } from "@/lib/account";
import { capital, words } from "@/lib/cat";
import { RowGroup, RowLink, ScreenHeader } from "./parts";
import ManageMembership from "./ManageMembership";

export const metadata = { title: "Account · AquaOne Health" };
export const dynamic = "force-dynamic";

const LIVES = { indoor: "indoor", outdoor: "outdoor", both: "indoor and outdoor" } as const;

export default async function AccountPage() {
  const a = await loadAccount(await supabaseServer());
  if (!a) return null; // the (app) layout has already sent signed-out visitors to /sign-in
  const { cat, membership: m } = a;
  const w = words(cat?.pronoun);
  const details = cat
    ? [
        cat.age_years != null ? `${cat.age_years} ${cat.age_years === 1 ? "yr" : "yrs"}` : null,
        cat.start_weight_lb != null ? `${cat.start_weight_lb} lb` : null,
        cat.lives ? LIVES[cat.lives] : null,
      ].filter(Boolean).join(" · ")
    : "";
  const cancelled = m.state === "cancelled";

  return (
    <div className="flex min-h-dvh flex-col gap-3.5 px-5 pb-12">
      <ScreenHeader title="Account" back="/today" />

      {cat ? (
        <Link href="/account/cat" className="flex items-center gap-4 rounded-[22px] bg-white px-[18px] py-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-lilac text-[22px] font-semibold">
            {cat.name.charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[19px] leading-6 font-semibold">{cat.name}</span>
            {details ? <span className="truncate text-[14px] text-slate">{details}</span> : null}
          </span>
          <span className="text-[15px] font-semibold text-blue">Edit</span>
        </Link>
      ) : (
        <Link href="/onboarding" className="rounded-[22px] bg-white px-[18px] py-4 text-[16px] font-semibold text-blue">
          Set up your cat
        </Link>
      )}

      <section className="flex flex-col gap-2.5 rounded-[22px] bg-navy px-[18px] py-5 text-white" aria-label="Membership">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-[0.08em] text-lilac">MEMBERSHIP</span>
          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${cancelled ? "bg-[#2A3D5E] text-[#C9D1E3]" : "bg-[#7FE0B5] text-navy"}`}>
            {m.badge}
          </span>
        </div>
        <p className="text-[22px] leading-7 font-semibold">{m.headline}</p>
        <p className="text-[15px] leading-[22px] text-[#C9D1E3]">{m.sub}</p>
        {cancelled ? (
          <dl className="mt-1.5 flex flex-col rounded-2xl bg-white/8 px-4 text-[14px]">
            <div className="flex justify-between border-b border-white/10 py-2.5">
              <dt className="text-[#C9D1E3]">Next charge</dt>
              <dd className="font-semibold">None</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-[#C9D1E3]">{cat ? `${cat.name}'s history` : "Your history"}</dt>
              <dd className="font-semibold">Kept if you come back</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <RowGroup>
        <RowLink href="/account/reminders" title="Reminders" value={reminderSummary(a.prefs)} />
        {cat ? <RowLink href="/account/cat" title={`${capital(w.poss)} vet`} value={cat.vet_name || "Add"} /> : null}
        <RowLink href="/help" title="Help and support" />
        <RowLink href="/account/legal" title="About and legal" />
      </RowGroup>

      <ManageMembership
        label={m.manageLabel}
        state={m.state}
        accessUntil={m.dateLabel}
        catName={cat?.name ?? null}
        email={a.email}
      />

      <form action="/api/auth/sign-out" method="post" className="flex flex-wrap items-center justify-center gap-1 pt-1 text-[13px] text-[#8A93A8]">
        <span>Signed in as {a.email} ·</span>
        <button className="font-semibold text-blue">Sign out</button>
      </form>
    </div>
  );
}
