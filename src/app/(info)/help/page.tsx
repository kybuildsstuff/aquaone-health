import Link from "next/link";
import { BackLink } from "@/components/watch";

export const metadata = { title: "Help · AquaOne Health" };

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I sign in?",
    a: (
      <>
        Open <Link href="/sign-in" className="font-semibold text-blue">app.trypurestream.com</Link> and enter the email you used to buy your AquaOne. We
        email you a 6-digit code; type it in and you&apos;re in. No password. The code works for an hour, and if it doesn&apos;t arrive within a couple
        of minutes, check your spam folder or ask for a new one.
      </>
    ),
  },
  {
    q: "Signing in on a new phone",
    a: "Open app.trypurestream.com on the new phone and sign in with the same email. Everything about your cat is saved to your membership, not to the phone.",
  },
  {
    q: "How do I put it on my Home Screen?",
    a: (
      <>
        On iPhone, open app.trypurestream.com in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. On Android, open it in Chrome, tap the{" "}
        <b>⋮</b> menu, then <b>Add to Home screen</b>. It then opens like an app. If it asks you to sign in again, use the 6-digit code from the email.
      </>
    ),
  },
  {
    q: "How do I cancel?",
    a: (
      <>
        In the app, open <b>Account</b>, then <b>Manage or cancel membership</b>. That takes you to your PureStream account, where you sign in with the
        same email and choose Cancel subscription. Cancel before your free month ends and you&apos;re never charged. Either way, you keep access to the
        end of the time you already have. Full details are in the{" "}
        <Link href="/subscription-terms" className="font-semibold text-blue">Subscription terms</Link>.
      </>
    ),
  },
  {
    q: "Is this a vet?",
    a: "No. AquaOne Health is guidance to help you notice changes and know what to ask. It doesn't diagnose or treat, and it never replaces your vet. Any warning sign, we send you to a vet.",
  },
  {
    q: "How does Kidney Watch work?",
    a: "Each day you tell us whether your cat drank less, about the same, or more. After 7 check-ins we know their normal, and we tell you if the pattern changes or their weight drops, so you can ask your vet early.",
  },
];

export default function Help() {
  return (
    <div className="flex min-h-dvh flex-col gap-4 px-5 pb-14">
      <header className="flex items-center gap-3 pt-[max(20px,env(safe-area-inset-top))]">
        <BackLink href="/account" />
        <span className="text-[18px] font-semibold">Help</span>
      </header>
      <h1 className="pt-2 text-[30px] leading-[35px] font-medium tracking-[-0.02em]">How can we help?</h1>

      <a href="mailto:help@trypurestream.com" className="flex flex-col gap-1 rounded-[22px] bg-navy px-5 py-4 text-white">
        <span className="text-[17px] font-semibold">Email us</span>
        <span className="text-[14px] text-[#C9D1E3]">help@trypurestream.com · we reply within a day</span>
      </a>

      <p className="pt-2 text-xs font-bold tracking-[0.08em] text-slate">COMMON QUESTIONS</p>
      <div className="flex flex-col rounded-[22px] bg-white px-[18px] py-1">
        {FAQ.map((f, i) => (
          <details key={f.q} open={i === 0} className="group border-b border-[#EFEDE9] py-3.5 last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
              {f.q}
              <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden className="shrink-0 transition group-open:rotate-180">
                <path d="M1.5 1.5l4.5 4.5 4.5-4.5" stroke="#8A93A8" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="pt-2 text-[15px] leading-[22px] text-slate">{f.a}</div>
          </details>
        ))}
      </div>

      <p className="rounded-[18px] bg-[#FDECEE] px-4 py-3.5 text-[15px] leading-[21px] text-[#7A1F2E]">
        <b>Worried about your cat right now?</b> Call your vet or an emergency vet. Don&apos;t wait for a reply here.
      </p>

      <p className="text-center text-[13px] text-[#8A93A8]">
        <Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link> ·{" "}
        <Link href="/subscription-terms" className="underline">Subscription terms</Link>
      </p>
    </div>
  );
}
