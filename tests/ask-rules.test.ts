// Ask's safety rules in code (decision 5), without the model: the red-flag detector on her
// words, the after-model guard, the answer layout and the cap's local-midnight boundary.
import { describe, expect, it } from "vitest";
import { detectRedFlags, guardAnswer, parseAnswer, primaryFlag, takeUrgentMarker, urgentCopy, withQuestion, revealWords, revealMs, wordCount, type FlagId } from "../src/lib/ask";
import { localDate } from "../src/lib/dates";

// The localMidnightUtc helper lives in a server-only module; import it through the alias.
const { localMidnightUtc } = await import("../src/lib/ask.server");

const milo = { name: "Milo", pronoun: "he" as const };

// Emergencies, in the words owners actually use, with the rule that must catch each.
const URGENT: [string, FlagId][] = [
  ["Milo keeps going to the litter box but nothing comes out. He's crying.", "urinary_blockage"],
  ["he's straining in the litter tray", "urinary_blockage"],
  ["My cat hasn't peed since yesterday", "urinary_blockage"],
  ["He can't pee and keeps licking himself", "urinary_blockage"],
  ["only a few drops come out when he tries", "urinary_blockage"],
  ["He’s in and out of the litter box every few minutes", "urinary_blockage"],
  ["she is breathing really fast while lying down", "breathing"],
  ["He's doing open mouth breathing after playing", "breathing"],
  ["my cat is panting and won't settle", "breathing"],
  ["His breathing is labored and noisy", "breathing"],
  ["I counted 44 breaths a minute while he slept", "breathing"],
  ["his gums look pale and he's cold", "breathing"],
  ["She collapsed in the kitchen", "collapse"],
  ["He's dragging his back legs and crying", "collapse"],
  ["he won't wake up properly, he's floppy", "collapse"],
  ["Milo just had a seizure", "seizure"],
  ["she's having a fit and shaking", "seizure"],
  ["He chewed a lily leaf this morning", "poisoning"],
  ["I think he drank antifreeze in the garage", "poisoning"],
  ["she licked lily pollen off her fur", "poisoning"],
  ["he got into my ibuprofen", "poisoning"],
  ["My cat ate one of my Tylenol pills", "poisoning"],
  ["I think he's been poisoned", "poisoning"],
  ["He hasn't eaten in 2 days", "not_eating"],
  ["she's not eating anything since yesterday", "not_eating"],
  ["he refuses food, it's been three days", "not_eating"],
  ["He keeps vomiting", "vomiting"],
  ["she threw up 5 times today", "vomiting"],
  ["There's blood in his pee", "blood"],
  ["he's bleeding from his mouth", "blood"],
  ["He was hit by a car but seems ok", "trauma"],
  ["she fell from the balcony on the third floor", "trauma"],
  ["he was attacked by a dog", "trauma"],
];

// Ordinary questions that must not set off the urgent card.
const BENIGN = [
  "How much water should Milo drink a day?",
  "He's drinking a lot more this week, and peeing more too. Should I be worried?",
  "Is wet food better than dry for his kidneys?",
  "How often should I clean the fountain?",
  "What does the kidney blood test involve?",
  "Should I ask the vet for bloodwork at his age?",
  "What's a normal blood pressure for a cat?",
  "Can he eat tuna?",
  "He breathes normally when asleep, about 20 a minute",
  "He isn't breathing fast, just snoring a bit",
  "He ate his breakfast and is playing now",
  "He threw up a hairball once this morning but is fine",
  "Are lilies safe to have in a vase if he can't reach them?",
  "There's no blood and he's peeing normally",
  "How do I get him to drink more water?",
  "He's peeing more than usual",
  "What should I feed a senior cat?",
  "Why does he knock things off the table?",
  "He's a bit stiff when he gets up in the morning",
  "How do I trim his claws?",
  "Is it normal for him to sleep 16 hours a day?",
  "What changes should I watch for as he gets older?",
  "He sleeps on my pants pile",
  "He fits perfectly in the shoebox",
  "Should I brush his teeth?",
];

describe("red flags before the model", () => {
  it.each(URGENT)("catches: %s", (message, flag) => {
    expect(detectRedFlags(message)).toContain(flag);
  });

  it.each(BENIGN)("stays quiet on: %s", (message) => {
    expect(detectRedFlags(message)).toEqual([]);
  });

  it("every flag has fixed card words that never come from the model", () => {
    for (const f of ["urinary_blockage", "breathing", "collapse", "seizure", "poisoning", "not_eating", "vomiting", "blood", "trauma", "general"] as FlagId[]) {
      const c = urgentCopy(f, milo);
      expect(c.title.length).toBeGreaterThan(10);
      expect(c.body.length).toBeGreaterThan(20);
    }
  });

  it("the most urgent flag leads the card", () => {
    expect(primaryFlag(["not_eating", "breathing"])).toBe("breathing");
    expect(primaryFlag([])).toBeNull();
  });
});

describe("the guard after the model", () => {
  const guard = (text: string, redTopic = false) => guardAnswer(text, { redTopic, cat: milo, vetName: "Dr. Lane" });

  it.each([
    "You could give him 5 mg of Benadryl to help him settle.",
    "A typical dose is 1 mg/kg of famotidine twice a day.",
    "Try half a tablet of aspirin with food.",
    "The dosage is usually given per kg of body weight.",
  ])("replaces medicine dosing: %s", (text) => {
    const r = guard(text);
    expect(r.replaced).toBe("dosing");
    expect(r.text).not.toContain(text);
    expect(r.text).toMatch(/Dr\. Lane/);
  });

  it.each([
    "It sounds like a UTI, which is common in male cats.",
    "Milo has kidney disease, so wet food will help.",
    "He probably has hyperthyroidism given the weight loss.",
    "This is cystitis, usually brought on by stress.",
  ])("replaces anything that reads like a diagnosis: %s", (text) => {
    expect(guard(text).replaced).toBe("diagnosis");
  });

  it.each([
    "It's probably nothing to worry about, just keep an eye on him.",
    "This is not an emergency, you can wait and see until the morning.",
    "Don't worry, it should pass on its own.",
  ])("on a red-flag topic, replaces reassurance: %s", (text) => {
    const r = guard(text, true);
    expect(r.replaced).toBe("reassurance");
    expect(r.text).toMatch(/now/);
  });

  it.each([
    "Don't wait to see if it passes. Go now.",
    "Please don't wait until the morning: call the emergency vet on the way.",
    "Never wait and see with this one.",
  ])("on a red-flag topic, keeps an answer that tells her not to wait: %s", (text) => {
    expect(guard(text, true).replaced).toBeNull();
  });

  it.each([
    "Most cats need about 200 ml of water a day, a little more on dry food.",
    "A rough guide is 40 to 60 ml per kg of body weight a day, including what's in wet food.",
    "Kidney changes are common at 11, so a vet would want to check his blood and urine. Your vet can tell you what's going on.",
    "If your vet prescribes a pill, a pill pocket can make it easier.",
    "Not an emergency, but worth a vet visit this week.",
  ])("leaves a good answer alone: %s", (text) => {
    expect(guard(text)).toEqual({ text, replaced: null });
  });

  it("the model's URGENT line is taken off and marks the answer urgent", () => {
    expect(takeUrgentMarker("URGENT\nGo to an emergency vet now.")).toEqual({ urgent: true, text: "Go to an emergency vet now." });
    expect(takeUrgentMarker("He seems fine.").urgent).toBe(false);
  });
});

describe("the answer layout", () => {
  it("splits paragraphs, steps, the go-now line and follow-ups", () => {
    const a = parseAnswer(
      [
        `His check-ins show it too: **"more" on 5 of the last 7**. At 11, that's worth a vet visit.`,
        ``,
        `What I'd do:`,
        `1. Book a vet visit this week. Not an emergency, but don't wait.`,
        `2. Ask about a kidney blood and urine check.`,
        ``,
        `Go to a vet now, any hour, if he strains to pee with little coming out, stops eating, or keeps vomiting.`,
        `>> What does the test involve?`,
        `>> Is it his food?`,
        `>> A third one is dropped`,
      ].join("\n"),
    );
    expect(a.paras).toHaveLength(1);
    expect(a.steps).toEqual(["Book a vet visit this week. Not an emergency, but don't wait.", "Ask about a kidney blood and urine check."]);
    expect(a.goNow).toMatch(/^Go to a vet now, any hour, if he strains/);
    expect(a.followUps).toEqual(["What does the test involve?", "Is it his food?"]);
  });
});

describe("the daily cap resets at her midnight", () => {
  const zones = ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Makassar", "Australia/Sydney", "Pacific/Auckland"];
  const instants = ["2026-11-14T03:30:00Z", "2026-11-14T12:00:00Z", "2026-11-01T06:30:00Z", "2026-03-08T07:30:00Z", "2026-12-31T23:59:00Z"].map((s) => new Date(s));

  it.each(zones)("in %s the boundary is the first instant of her local day", (tz) => {
    for (const at of instants) {
      const m = localMidnightUtc(tz, at);
      expect(m.getTime()).toBeLessThanOrEqual(at.getTime());
      expect(at.getTime() - m.getTime()).toBeLessThan(25 * 3600000);
      expect(localDate(tz, m)).toBe(localDate(tz, at));
      expect(localDate(tz, new Date(m.getTime() - 1000))).not.toBe(localDate(tz, at));
    }
  });
});

// Found by hand 14 Nov: the typing dots never showed, because the pending answer was only
// added when the first stream event arrived, and a normal answer arrives as one event.
describe("sending a question", () => {
  it("shows the typing dots straight away, after her question", () => {
    const at = "2026-11-14T10:00:00.000Z";
    const items = withQuestion([], "How much should she drink?", at);
    expect(items.map((x) => [x.role, x.pending ?? false])).toEqual([["user", false], ["assistant", true]]);
    expect(items[1].id).toBe(`pending-${at}`);
  });
});

describe("typing out a checked answer", () => {
  const answer = "Cats need about **50 ml per kg** a day.\n\nWhat I'd do\n1. Weigh her.\n2. Log her drinking.\n>> How do I get her to drink more?";

  it("reveals whole words in order and ends on exactly the full answer", () => {
    const total = wordCount(answer);
    let prev = "";
    for (let n = 1; n <= total; n++) {
      const shown = revealWords(answer, n).replace(/\*\*$/, "");
      expect(answer.startsWith(shown.replace(/\*\*$/, "")) || answer.startsWith(shown)).toBe(true);
      expect(shown.length).toBeGreaterThanOrEqual(prev.length);
      prev = shown;
    }
    expect(revealWords(answer, total)).toBe(answer);
    expect(revealWords(answer, 0)).toBe("");
  });

  it("never leaves a bold marker open, so asterisks never flash", () => {
    for (let n = 1; n <= wordCount(answer); n++) expect((revealWords(answer, n).match(/\*\*/g)?.length ?? 0) % 2).toBe(0);
  });

  it("keeps the reveal between 0.6 and 2 seconds whatever the length", () => {
    for (const w of [1, 10, 40, 80, 400]) {
      expect(revealMs(w)).toBeGreaterThanOrEqual(600);
      expect(revealMs(w)).toBeLessThanOrEqual(2000);
    }
  });
});
