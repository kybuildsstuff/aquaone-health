// The words for Kidney Watch states. Calm for amber ("worth a vet check, not an emergency"),
// direct for red ("go to a vet now"), matching the Paper designs and decision 7.
import type { KwReason, KwStatus } from "@/lib/kidney-watch";
import { words, type Pronoun } from "@/lib/cat";

type CatWords = { name: string; pronoun: Pronoun };

export function reasonHeadline(reason: KwReason, s: KwStatus, cat: CatWords): string {
  switch (reason) {
    case "drinking_more":
      return `${cat.name} has been drinking more on ${s.more_in_last_7} of the last 7 check-ins.`;
    case "drinking_less":
      return `${cat.name} has been drinking less on ${s.less_in_last_7} of the last 7 check-ins.`;
    case "weight_down_5pct":
      return `${cat.name} is down ${Math.abs(s.weight_change_pct ?? 0)}% in weight against 4 weeks ago.`;
    case "breathing_over_30":
      return `${cat.name}'s breathing count was ${s.latest_breaths} a minute at rest.`;
  }
}

export function banner(s: KwStatus, cat: CatWords) {
  if (s.status === "red") {
    return {
      level: "red" as const,
      label: "GO TO A VET NOW",
      headline: reasonHeadline("breathing_over_30", s, cat),
      sub: "Over 30 a minute at rest needs a vet now, any hour.",
    };
  }
  if (s.status === "amber") {
    const others = s.reasons.length - 1;
    return {
      level: "amber" as const,
      label: "KIDNEY WATCH NOTICED SOMETHING",
      headline: reasonHeadline(s.reasons[0], s, cat),
      sub: `Worth a vet check this week. Not an emergency.${others > 0 ? ` Kidney Watch noticed ${others} other thing${others > 1 ? "s" : ""} too.` : ""}`,
    };
  }
  return null;
}

// The one-line status under "Kidney Watch" on Today and in the Watch header card.
export function statusLine(s: KwStatus, cat: CatWords) {
  const w = words(cat.pronoun);
  switch (s.status) {
    case "red":
      return { title: "Go to a vet now", sub: `${cat.name}'s breathing was over 30 a minute at rest.` };
    case "amber": {
      const parts: string[] = [];
      if (s.reasons.includes("drinking_more")) parts.push(`Drinking is above ${cat.name}'s normal.`);
      if (s.reasons.includes("drinking_less")) parts.push(`Drinking is below ${cat.name}'s normal.`);
      if (s.reasons.includes("weight_down_5pct")) parts.push(`Weight is down ${Math.abs(s.weight_change_pct ?? 0)}% in 4 weeks.`);
      return { title: "Worth a vet check", sub: parts.join(" ") };
    }
    case "learning": {
      const left = Math.max(0, 7 - s.checkins_total);
      return {
        title: `Learning ${w.poss} normal`,
        sub: `${left === 1 ? "One more daily check-in" : `${capitalWord(numberWord(left))} more daily check-ins`} and Kidney Watch is on.`,
      };
    }
    default:
      return { title: "All steady", sub: `Drinking, weight and breathing are all within ${cat.name}'s normal.` };
  }
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capitalWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
