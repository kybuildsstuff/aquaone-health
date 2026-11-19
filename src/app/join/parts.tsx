import Image from "next/image";
import type { JoinCta } from "@/lib/join";

// Building blocks for /join (Paper v4). Headlines use the device's system font first
// (SF Pro on iPhone and Mac) for the Apple Health feel, then Inter.
// The class is defined in page.tsx's style tag.
export const display = "join-display";

export function Button({ cta, size = "lg", className = "" }: { cta: JoinCta; size?: "sm" | "lg"; className?: string }) {
  const pad = size === "sm" ? "h-11 px-5 text-[15px] rounded-xl" : "h-[60px] px-8 text-[18px] rounded-[14px]";
  return (
    <a href={cta.href} className={`inline-flex items-center justify-center gap-2.5 bg-blue font-semibold text-white ${pad} ${className}`}>
      {cta.label}
      {size === "lg" ? (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path d="M4 9h10M10 5l4 4-4 4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </a>
  );
}

export function Drop({ size = 20, fill = "#fff" }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 16 18" aria-hidden>
      <path d="M8 1.5C8 1.5 2 8 2 11.5a6 6 0 0 0 12 0C14 8 8 1.5 8 1.5z" fill={fill} />
    </svg>
  );
}

// App Store-style listing row: icon, name, "Try free".
export function AppListing({ cta }: { cta: JoinCta }) {
  return (
    <div className="flex w-full max-w-[400px] items-center gap-3 rounded-[18px] border border-[#ECEAE6] bg-white px-3.5 py-3 lg:gap-3.5 lg:rounded-[20px] lg:px-4 lg:py-3.5">
      <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[13px] bg-[linear-gradient(160deg,#6F82F5_0%,#4458E0_100%)] lg:size-[60px] lg:rounded-[15px]">
        <Drop size={21} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5 text-left">
        <span className="text-[17px] font-bold tracking-[-0.01em] text-navy lg:text-[19px]">AquaOne Health</span>
        <span className="text-[13px] font-medium text-[#8A93A6] lg:text-[14px]">For AquaOne owners</span>
      </div>
      <a href={cta.href} className="rounded-full bg-lilac-soft px-4 py-2 text-[14px] font-bold text-blue lg:px-[18px] lg:text-[15px]">
        {cta.member ? "Open" : "Try free"}
      </a>
    </div>
  );
}

// A phone with a real app screen (exported from Paper "AquaOne Health · UI"). The screens are
// already 540px WebP (~45KB), so they are served as they are: no resize wait on first load.
export function Phone({ screen, alt, className = "", cropBottom = false, big = false, priority = false }: { screen: string; alt: string; className?: string; cropBottom?: boolean; big?: boolean; priority?: boolean }) {
  const frame = cropBottom ? "rounded-t-[40px] px-2 pt-2" : big ? "rounded-[50px] p-[9px] shadow-[0_40px_80px_rgba(7,29,60,0.35)]" : "rounded-[38px] p-[7px] shadow-[0_30px_60px_rgba(7,29,60,0.35)]";
  const glass = cropBottom ? "h-full rounded-t-[33px]" : big ? "rounded-[42px]" : "rounded-[31px]";
  return (
    <div className={`shrink-0 bg-[#0E1424] ${frame} ${className}`}>
      <div className={`overflow-hidden ${glass}`}>
        <Image src={`/join/screen-${screen}.webp`} alt={alt} width={540} height={1169} priority={priority} unoptimized className="block h-auto w-full" />
      </div>
    </div>
  );
}

export function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <p className={`text-[13px] font-semibold tracking-[0.12em] lg:text-[14px] ${light ? "text-lilac" : "text-blue"}`}>{children}</p>;
}

export function H2({ lead, rest, light = false, className = "" }: { lead: string; rest: string; light?: boolean; className?: string }) {
  return (
    <h2 className={`${display} text-[30px] leading-[35px] font-bold tracking-[-0.03em] lg:text-[48px] lg:leading-[53px] lg:tracking-[-0.035em] ${light ? "text-white" : "text-navy"} ${className}`}>
      {lead} <span className={light ? "text-lilac" : "text-[#8A93A6]"}>{rest}</span>
    </h2>
  );
}

// Screen cards, App Store style: a caption over a real screen, bottom cropped.
export const CARDS = [
  { title: "Kidney Watch", line: "Drinking, weight and breathing, against her own normal.", screen: "watch", bg: "bg-lilac", ink: "text-[#2E3F7A]" },
  { title: "Care for her age", line: "A breathing counter, weekly weigh-ins and a daily care plan for her age.", screen: "breathing", bg: "bg-[#DCEFE6]", ink: "text-[#1F5A43]" },
  { title: "Ask, any hour", line: "A clear answer in seconds that knows her history.", screen: "ask", bg: "bg-white", ink: "text-[#33405A]" },
  { title: "Is it safe?", line: "Lilies, a new treat, the dog's flea drops. Snap the label.", screen: "safe", bg: "bg-[#FCE3E7]", ink: "text-[#7A2333]" },
  { title: "A report for your vet", line: "Her trends and your notes on one page, ready to share.", screen: "report", bg: "bg-[#F3EFE8]", ink: "text-[#33405A]" },
] as const;

export function ScreenCard({ card }: { card: (typeof CARDS)[number] }) {
  return (
    <div className={`flex h-[520px] w-[262px] shrink-0 snap-start flex-col items-center gap-[18px] overflow-hidden rounded-[26px] px-5 pt-6 lg:h-[530px] lg:w-auto lg:flex-1 lg:px-[18px] ${card.bg}`}>
      <div className="flex min-h-[96px] w-full flex-col gap-1.5">
        <h3 className={`${display} text-[22px] leading-[27px] font-bold tracking-[-0.02em] text-navy lg:text-[21px] lg:leading-[26px]`}>{card.title}</h3>
        <p className={`text-[15px] leading-[21px] font-medium ${card.ink}`}>{card.line}</p>
      </div>
      <Phone screen={card.screen} alt={`The ${card.title} screen in the AquaOne Health app`} className="w-[212px] lg:w-[206px]" />
    </div>
  );
}

// "How it works" pieces of the app, drawn whole (not cropped screenshots).
export function CheckInWidget() {
  return (
    <div className="flex w-[300px] flex-col gap-3 rounded-[18px] bg-navy p-4 shadow-[0_12px_28px_rgba(7,29,60,0.18)]">
      <p className="text-[11px] font-bold tracking-[0.08em] text-lilac">DAILY CHECK-IN · 10 SEC</p>
      <p className="text-[17px] leading-[22px] font-medium text-white">How much did Milo drink since yesterday?</p>
      <div className="flex gap-2">
        {["Less", "Normal", "More"].map((l) => (
          <span key={l} className={`flex-1 rounded-[11px] py-[11px] text-center text-[14px] font-semibold text-white ${l === "More" ? "bg-blue" : "bg-navy-2"}`}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

const DOTS = [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1];
export function DrinkingWidget() {
  return (
    <div className="flex w-[300px] flex-col gap-3.5 rounded-[18px] border-[1.5px] border-[#F2CB6B] bg-white p-4 shadow-[0_12px_28px_rgba(7,29,60,0.10)]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-[7px] text-[16px] font-bold text-navy">
          <Drop size={11} fill="#5369EE" /> Drinking
        </span>
        <span className="text-[13px] font-semibold text-[#A8780E]">More than usual</span>
      </div>
      <div className="flex justify-between">
        {DOTS.map((d, i) => (
          <span key={i} className={`size-[15px] rounded-full ${d ? "bg-blue" : "bg-[#C9D0F7]"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between text-[12px] text-slate">
        <span className="flex gap-3">
          <span className="flex items-center gap-[5px]">
            <span className="size-2 rounded-full bg-[#C9D0F7]" /> Normal
          </span>
          <span className="flex items-center gap-[5px]">
            <span className="size-2 rounded-full bg-blue" /> More
          </span>
        </span>
        <span className="text-[#8A93A6]">Last 14 days</span>
      </div>
    </div>
  );
}

const WEEK = [["Fri", 0], ["Sat", 1], ["Sun", 0], ["Mon", 1], ["Tue", 1], ["Wed", 1], ["Thu", 1]] as const;
export function AlertWidget() {
  return (
    <div className="flex w-[300px] flex-col gap-3 rounded-[18px] bg-white p-4 shadow-[0_12px_28px_rgba(7,29,60,0.10)]">
      <p className="text-[18px] font-bold tracking-[-0.01em] text-navy">Milo is drinking more</p>
      <div className="flex h-16 items-end justify-between">
        {WEEK.map(([d, more]) => (
          <span key={d} className="flex flex-col items-center gap-[5px]">
            <span className={`w-7 rounded-[7px] ${more ? "h-[46px] bg-blue" : "h-[22px] bg-[#C9D0F7]"}`} />
            <span className="text-[11px] text-slate">{d}</span>
          </span>
        ))}
      </div>
      <p className="text-[13px] leading-[18px] text-slate">
        <b className="text-navy">Worth a vet check this week.</b> 5 &quot;more&quot; days; his usual is 0 or 1.
      </p>
    </div>
  );
}

export const STEPS = [
  { n: 1, title: "Tap once a day", line: "Did she drink less, the same, or more? That's the whole check-in.", Widget: CheckInWidget },
  { n: 2, title: "It learns her normal", line: "Within two weeks, Kidney Watch knows a normal day for her drinking, weight and breathing.", Widget: DrinkingWidget },
  { n: 3, title: "You hear when it shifts", line: "A calm heads-up, what to watch, and whether it's \"this week\" or \"call now\".", Widget: AlertWidget },
] as const;

export const INCLUDES = [
  "Kidney Watch: drinking, weight, breathing",
  "Cat questions answered 24/7",
  "Toxic or safe? Snap it",
  "Bloodwork explained, vet report",
  "Up to 4 cats on one membership",
];

export const FAQ = [
  {
    q: "What does it actually do for my cat?",
    a: "It learns her normal: how much she drinks, her weight and her breathing. Then it tells you the moment something drifts, usually long before she'd show you. One 10-second check-in a day is all it asks.",
  },
  {
    q: "Why would I notice anything sooner?",
    a: "Cats hide illness, and early changes are small and slow. Day to day you won't see them. Over two weeks of check-ins they show up as a pattern, and Kidney Watch is built to catch exactly that.",
  },
  {
    q: "What do I get beyond Kidney Watch?",
    a: "Answers to any cat question, any hour. \"Is this safe?\" for plants, food and products. Her bloodwork in plain English. And a report you can hand your vet.",
  },
  { q: "I have more than one cat.", a: "One membership covers up to four cats. Each gets their own check-ins, Kidney Watch and vet report." },
  {
    q: "Is it a replacement for my vet?",
    a: "No, it's what helps you get the most out of your vet. It tells you when a visit is worth making and how soon, and gives you a report so the appointment starts with facts.",
  },
  {
    q: "What happens after my free month?",
    a: "It's $19.95 every 30 days. We email you about a week before your first payment, and you can cancel in the app in under a minute.",
  },
];
