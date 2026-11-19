import type { Metadata } from "next";
import Image from "next/image";
import { supabaseServer } from "@/lib/supabase/server";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";
import { joinCta } from "@/lib/join";
import { AppListing, Button, CARDS, display, Drop, Eyebrow, FAQ, H2, INCLUDES, Phone, ScreenCard, STEPS } from "./parts";

// /join: the page past AquaOne buyers reach from email and SMS (Paper v4,
// "AquaOne Health product page"). Public: listed in PUBLIC in src/proxy.ts.
// Kept out of search results (Ky, 19 Nov: decision 2a).
export const metadata: Metadata = {
  title: "AquaOne Health · The app that notices when something's wrong",
  description: "A 10-second daily check-in learns your cat's normal, and AquaOne Health tells you when something changes. First month free for AquaOne owners.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// A signed-in member with access today sees "Open the app" (decision 1a). Any failure
// here falls back to the normal page: this check must never break /join.
async function signedInMember(): Promise<boolean> {
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getClaims();
    const email = data?.claims.email;
    if (!email) return false;
    return membershipAllows(await findMember(email)).allowed;
  } catch {
    return false;
  }
}

// Full width on desktop: the root layout caps pages at 480px for the app, and /join
// breaks out of it here only. overflow-x clip stops 100vw adding a sideways scroll.
const PAGE_CSS = `
html, body { overflow-x: clip; }
.join-display { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", var(--font-inter), system-ui, sans-serif; }
.join-cards::-webkit-scrollbar { display: none; }
`;

export default async function JoinPage() {
  const cta = joinCta(await signedInMember());
  const reassure = cta.member ? "You're already a member." : "We email you a week before your first payment. Cancel any time.";

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 bg-paper text-navy">
      <style>{PAGE_CSS}</style>

      {/* Header */}
      <header className="mx-auto flex max-w-[1440px] items-center justify-center px-5 pt-5 pb-[18px] lg:justify-between lg:px-20 lg:py-6">
        <Image src="/join/logo.png" alt="PureStream" width={1035} height={155} priority sizes="160px" className="h-5 w-auto lg:h-[23px]" />
        <div className="hidden items-center gap-[22px] lg:flex">
          {!cta.member ? <span className="text-[15px] font-medium text-slate">$0 today · then $19.95 every 30 days</span> : null}
          <Button cta={cta} size="sm" />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-[1440px] flex-col items-center px-[22px] pt-3.5 pb-10 lg:flex-row lg:items-center lg:gap-16 lg:px-20 lg:pt-10 lg:pb-20">
        <div className="flex w-full flex-col items-center gap-3.5 lg:w-[560px] lg:shrink-0 lg:items-start lg:gap-[22px]">
          <AppListing cta={cta} />
          <h1 className={`${display} text-center text-[38px] leading-[42px] font-bold tracking-[-0.035em] lg:text-left lg:text-[64px] lg:leading-[68px] lg:tracking-[-0.04em]`}>
            The app that notices <span className="text-blue">when something&apos;s wrong.</span>
          </h1>
          <div className="order-last flex w-full flex-col gap-3 pt-1.5 lg:order-none lg:gap-[22px] lg:pt-0">
            <p className="text-center text-[18px] leading-[27px] text-[#33405A] lg:w-[500px] lg:text-left lg:text-[20px] lg:leading-[31px]">
              Cats hide illness. A 10-second daily check-in learns your cat&apos;s normal, and AquaOne Health tells you when something changes.
            </p>
            {!cta.member ? (
              <div className="flex items-baseline justify-center gap-2.5 pt-1 lg:justify-start lg:gap-3 lg:pt-1.5">
                <span className={`${display} text-[28px] leading-8 font-bold tracking-[-0.03em] lg:text-[34px] lg:leading-[38px]`}>$0 today</span>
                <span className="text-[15px] font-medium text-slate lg:text-[17px]">then $19.95 every 30 days</span>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-[18px]">
              <Button cta={cta} className="w-full lg:w-auto" />
              <p className="text-center text-[14px] leading-5 font-medium text-slate lg:w-[220px] lg:text-left lg:text-[15px] lg:leading-[21px]">{reassure}</p>
            </div>
          </div>
          {/* Phone in front of the tabby at her AquaOne (mobile sits between headline and copy). */}
          <HeroVisual className="lg:hidden" />
        </div>
        <HeroVisual className="hidden lg:flex" desktop />
      </section>

      {/* Inside the app */}
      <section className="bg-navy py-[52px] lg:py-24">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-[22px] lg:gap-10 lg:px-16">
          <div className="flex flex-col gap-3 px-[22px] lg:gap-3.5 lg:px-4">
            <Eyebrow light>INSIDE THE APP</Eyebrow>
            <H2 lead="Her whole health picture." rest="In one app." light />
          </div>
          <div className="join-cards flex snap-x snap-mandatory scroll-px-[22px] gap-3.5 overflow-x-auto px-[22px] [scrollbar-width:none] lg:justify-between lg:gap-[18px] lg:overflow-visible lg:px-0">
            {CARDS.map((c) => (
              <ScreenCard key={c.title} card={c} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5 px-[22px] pt-1.5 lg:flex-row lg:items-start lg:gap-10 lg:px-4 lg:pt-2">
            <p className="pb-2 text-[13px] font-semibold tracking-[0.12em] text-lilac lg:w-[200px] lg:shrink-0 lg:pt-3 lg:text-[14px]">ALSO IN THE APP</p>
            <Also icon="flask" title="Bloodwork, explained" line="Snap her lab report. Every number in plain English, how it moved, and questions for your vet." />
            <Also icon="cats" title="Every cat in the house" line="Up to four cats on one membership, each with their own normal." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-paper">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-[26px] px-[22px] pt-14 pb-[52px] lg:gap-12 lg:px-20 lg:pt-[104px] lg:pb-24">
          <div className="flex flex-col gap-3.5">
            <Eyebrow>HOW IT WORKS</Eyebrow>
            <H2 lead="Ten seconds a day." rest="That's the whole job." />
          </div>
          <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-6">
            {STEPS.map(({ n, title, line, Widget }) => (
              <div key={n} className="flex flex-col overflow-hidden rounded-[22px] bg-white lg:flex-1 lg:rounded-[26px]">
                <div className="flex items-center justify-center bg-lilac-soft px-[18px] py-[22px] lg:h-60">
                  <Widget />
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-[18px] pb-[22px] lg:gap-2 lg:px-7 lg:pt-[26px] lg:pb-[30px]">
                  <p className="text-[13px] font-bold text-blue lg:text-[14px]">Step {n}</p>
                  <h3 className={`${display} text-[20px] leading-[25px] font-bold tracking-[-0.015em] lg:text-[23px] lg:leading-7`}>{title}</h3>
                  <p className="text-[16px] leading-6 text-[#33405A] lg:text-[17px] lg:leading-[26px]">{line}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bridge: the app beside the fountain they already own */}
      <section className="bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-[18px] px-[22px] pt-[52px] pb-12 lg:flex-row lg:items-center lg:gap-20 lg:px-20 lg:py-[104px]">
          <div className="flex flex-col gap-[18px] lg:w-[560px] lg:shrink-0 lg:gap-[22px]">
            <Eyebrow>FROM THE TEAM BEHIND YOUR AQUAONE</Eyebrow>
            <H2 lead="Your AquaOne keeps her water fresh." rest="The app keeps an eye on everything else." />
            <p className="text-[18px] leading-7 text-[#33405A] lg:text-[19px] lg:leading-[30px]">
              Every 6, 9 or 12 hours, your AquaOne gives her a fresh tray. What it can&apos;t tell you is whether she&apos;s drinking more than she used to, or
              less. AquaOne Health is the other half.
            </p>
          </div>
          <div className="mt-1.5 flex flex-col items-center gap-5 overflow-hidden rounded-[24px] bg-lilac-soft px-5 pt-[26px] lg:mt-0 lg:h-[460px] lg:flex-1 lg:flex-row lg:items-end lg:gap-7 lg:rounded-[28px] lg:pt-0 lg:pl-10">
            <div className="flex w-full max-w-[306px] flex-col gap-1.5 lg:w-[250px] lg:shrink-0 lg:gap-2.5 lg:pb-12">
              <p className="text-[12px] font-bold tracking-[0.1em] text-blue lg:text-[13px]">WHEN SOMETHING SHIFTS</p>
              <p className={`${display} text-[22px] leading-[27px] font-bold tracking-[-0.02em] lg:text-[26px] lg:leading-[31px] lg:tracking-[-0.025em]`}>
                You see it, why it matters, and exactly what to do next.
              </p>
            </div>
            <Phone screen="alert" alt="The Kidney Watch alert screen: Milo is drinking more, why it's worth a check, and what to do" cropBottom className="h-[380px] w-[228px] lg:h-[420px] lg:w-[250px]" />
          </div>
        </div>
      </section>

      {/* Offer */}
      <section className="bg-paper">
        <div className="mx-auto flex max-w-[1440px] flex-col px-[22px] py-[52px] lg:flex-row lg:items-center lg:justify-between lg:px-20 lg:py-[104px]">
          <div className="hidden flex-col gap-[22px] lg:flex lg:w-[520px]">
            <Eyebrow>YOUR FIRST MONTH</Eyebrow>
            <h2 className={`${display} text-[48px] leading-[53px] font-bold tracking-[-0.035em]`}>
              Try it for a month. <span className="text-[#8A93A6]">On us.</span>
            </h2>
            <p className="text-[19px] leading-[30px] text-[#33405A]">
              Everything, free for 30 days. If it hasn&apos;t earned its place, cancel in the app in under a minute. Nothing to send back, nobody to call.
            </p>
          </div>
          <div className="flex w-full flex-col gap-5 rounded-[24px] bg-navy px-6 pt-7 pb-6 lg:w-[500px] lg:px-[34px] lg:pt-9 lg:pb-[30px]">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-semibold text-white">AquaOne Health</span>
              <span className="rounded-full bg-lilac px-[11px] py-1.5 text-[11px] font-bold tracking-[0.08em] text-navy">FIRST MONTH FREE</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className={`${display} text-[48px] leading-[52px] font-bold tracking-[-0.035em] text-white lg:text-[60px] lg:leading-[62px] lg:tracking-[-0.04em]`}>$0 today</span>
              <span className="text-[16px] leading-[22px] font-medium text-[#C9D1E6]">Then $19.95 every 30 days, about 67¢ a day.</span>
            </div>
            <ul className="flex flex-col gap-3 border-t border-[#1E3A66] pt-5">
              {INCLUDES.map((i) => (
                <li key={i} className="flex items-start gap-2.5 text-[16px] leading-[22px] font-medium text-white">
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="mt-0.5 shrink-0">
                    <path d="M4 9.4l3.2 3.2L14 5.6" fill="none" stroke="#BAC4FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {i}
                </li>
              ))}
            </ul>
            <Button cta={cta} className="w-full" />
            <p className="text-center text-[14px] leading-5 font-medium text-[#9FAACB]">
              {cta.member ? "You're already a member." : "We email you a week before your first payment. Cancel in the app any time."}
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-[22px] pt-14 pb-[52px] lg:flex-row lg:gap-24 lg:px-20 lg:py-[104px]">
          <div className="flex flex-col gap-3.5 lg:w-[420px] lg:shrink-0">
            <Eyebrow>QUESTIONS</Eyebrow>
            <H2 lead="Good questions." rest="Straight answers." />
          </div>
          <div className="flex flex-col lg:flex-1">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0} className={`group border-t border-line py-5 ${i === FAQ.length - 1 ? "border-b" : ""}`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[18px] leading-6 font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden className="shrink-0">
                    <path d="M5 11h12" stroke="#071D3C" strokeWidth="2" strokeLinecap="round" />
                    <path d="M11 5v12" stroke="#071D3C" strokeWidth="2" strokeLinecap="round" className="group-open:hidden" />
                  </svg>
                </summary>
                <p className="pt-2.5 text-[17px] leading-[26px] text-[#33405A]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="bg-navy">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-5 px-[22px] pt-16 pb-10 text-center lg:gap-6 lg:px-20 lg:pt-28 lg:pb-14">
          <Drop size={26} fill="#5369EE" />
          <h2 className={`${display} max-w-[900px] text-[30px] leading-[35px] font-bold tracking-[-0.03em] text-white lg:text-[64px] lg:leading-[68px] lg:tracking-[-0.04em]`}>
            She can&apos;t tell you how she feels. <span className="text-lilac">Her normal can.</span>
          </h2>
          <p className="max-w-[620px] text-[18px] leading-[27px] text-[#C9D1E6] lg:text-[20px] lg:leading-[30px]">
            Start your free month today. In two weeks, you&apos;ll know what normal looks like for her.
          </p>
          <Button cta={cta} className="w-full lg:mt-1.5 lg:w-auto lg:px-10" />
          {!cta.member ? <p className="text-[14px] font-medium text-[#9FAACB] lg:text-[15px]">$0 today · then $19.95 every 30 days</p> : null}
          <p className="mt-2 w-full border-t border-[#1E3A66] pt-6 text-[13px] leading-5 text-[#8A98BD] lg:mt-14 lg:pt-7 lg:text-[14px]">
            AquaOne Health gives general guidance and is not a veterinary service. It never diagnoses. If you&apos;re worried about your cat, call your vet.
          </p>
        </div>
      </section>
    </div>
  );
}

function HeroVisual({ className = "", desktop = false }: { className?: string; desktop?: boolean }) {
  return desktop ? (
    <div className={`relative h-[620px] w-[656px] shrink-0 items-center ${className}`}>
      <div className="absolute top-[60px] left-[120px] h-[500px] w-[536px] overflow-hidden rounded-[32px]">
        <Image src="/join/tabby.webp" alt="A tabby cat drinking from an AquaOne fountain" fill priority sizes="536px" className="object-cover object-[65%_40%]" />
      </div>
      <Phone screen="today" alt="The AquaOne Health Today screen: a Kidney Watch alert and the daily check-in" priority big className="relative w-[290px]" />
    </div>
  ) : (
    <div className={`relative order-2 flex h-[470px] w-[390px] max-w-[100vw] shrink-0 justify-start pt-6 pl-[30px] ${className}`}>
      <div className="absolute top-[84px] right-[22px] left-[22px] h-[300px] overflow-hidden rounded-[26px]">
        <Image src="/join/tabby.webp" alt="A tabby cat drinking from an AquaOne fountain" fill priority sizes="346px" className="scale-150 object-cover object-[38%_30%]" />
      </div>
      <Phone screen="today" alt="The AquaOne Health Today screen: a Kidney Watch alert and the daily check-in" priority className="relative w-[212px]" />
    </div>
  );
}

function Also({ icon, title, line }: { icon: "flask" | "cats"; title: string; line: string }) {
  return (
    <div className="flex gap-4 border-t border-[#1E3A66] pt-4 pb-4 last:pb-0 lg:flex-1 lg:gap-[18px] lg:pt-5 lg:pb-0">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-lilac lg:size-12 lg:rounded-[13px]">
        {icon === "flask" ? (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" fill="none" stroke="#071D3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <circle cx="8" cy="9" r="3" fill="none" stroke="#071D3C" strokeWidth="2" />
            <circle cx="16" cy="9" r="3" fill="none" stroke="#071D3C" strokeWidth="2" />
            <path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M11 19c0-3 2.2-5 5-5s5 2 5 5" fill="none" stroke="#071D3C" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[18px] leading-6 font-semibold text-white lg:text-[19px] lg:leading-[25px]">{title}</p>
        <p className="text-[16px] leading-6 text-[#C9D1E6] lg:text-[17px] lg:leading-[26px]">{line}</p>
      </div>
    </div>
  );
}
