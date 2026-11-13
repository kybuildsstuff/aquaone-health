// Ask: the assistant's safety rules, in code (decision 5). Pure, so it is unit-tested and
// shared by the server (which decides) and the screen (which redraws the urgent card from
// saved messages).
//
//  1. detectRedFlags() runs on her message BEFORE the model. A match shows the fixed urgent
//     card at once, whatever the model later says (or if it never answers).
//  2. guardAnswer() runs on the model's answer AFTER it, before she sees a word of it: an
//     answer that doses medicine, reads like a diagnosis, or reassures on a red-flag topic is
//     replaced with fixed safe guidance.
import { vetLabel, words, type Pronoun } from "@/lib/cat";

// The daily cap per member (one cat per member in version 1). One number, used everywhere.
export const DAILY_QUESTION_CAP = 30;
export const MAX_QUESTION_CHARS = 1000;

// ASPCA Animal Poison Control Center, US, 24/7 (a consultation fee may apply).
export const POISON_LINE = { name: "ASPCA Animal Poison Control", display: "(888) 426-4435", tel: "tel:+18884264435" };

export type FlagId =
  | "urinary_blockage"
  | "breathing"
  | "collapse"
  | "seizure"
  | "poisoning"
  | "not_eating"
  | "vomiting"
  | "blood"
  | "trauma"
  | "general"; // the model itself said it can't wait; no rule matched

type CatWords = { name: string; pronoun: Pronoun | null | undefined };

// --- Before the model -----------------------------------------------------------------

// A negation just before a match ("not breathing fast", "no blood") cancels it, for the
// patterns that don't already contain their own negation.
const NEGATED_BEFORE = /\b(not|no|never|without|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|didn'?t|hasn'?t|haven'?t)\s+(\w+\s+){0,1}$/;

type Rule = { flag: Exclude<FlagId, "general">; re: RegExp; negatable?: boolean; unless?: RegExp };

const PEE = "(pee|peeing|wee|weeing|urinate|urinating|pass urine|go to the toilet)";
const EXPOSURE =
  "(ate|eaten|(is|was|been|'s|keeps) (eating|licking|chewing|drinking)|licked|swallowed|chewed|bit|bitten into|nibbled|drank|drunk|ingested|got into|had some|got some|pollen|on (his|her|their|its) (fur|paws?|face|nose|coat)|spilled|sprayed|put .{0,30}on (him|her|them))";
const TOXIN =
  "(lil(y|ies)|antifreeze|anti-freeze|ethylene glycol|coolant|rat poison|mouse poison|rodenticide|slug (bait|pellets)|bait|poison|bleach|cleaning (product|spray|fluid)|detergent|permethrin|dog flea|flea (treatment|drops|spot[- ]on) (for|meant for) dogs|essential oils?|tea tree|chocolate|onions?|garlic|xylitol|grapes?|raisins?|tylenol|acetaminophen|paracetamol|ibuprofen|advil|motrin|aspirin|naproxen|aleve|adderall|antidepressants?|prozac|medications?|medicines?|meds|pills?|tablets?|vitamin d|marijuana|cannabis|weed|edibles?)";

const RULES: Rule[] = [
  // Urinary blockage: the classic "male cat straining, nothing coming out".
  { flag: "urinary_blockage", re: new RegExp(`\\b(can'?t|cannot|can not|isn'?t|is not|hasn'?t|has not|haven'?t|didn'?t|did not|not|won'?t|unable to|trouble|struggling to|straining to|strains to|strain to|trying to)\\s+(\\w+\\s+){0,1}${PEE}`, "i") },
  { flag: "urinary_blockage", re: /\b(hasn'?t|has not|haven'?t|didn'?t|did not|not)\s+(\w+\s+){0,1}(peed|urinated|weed)\b/i },
  { flag: "urinary_blockage", re: /\bstrain(s|ed|ing)?\b/i, negatable: true },
  { flag: "urinary_blockage", re: /\b(nothing|little|hardly anything|only drops|just drops|a few drops)\s+(\w+\s+){0,1}(comes?|came|coming|is coming)\s+out\b/i },
  { flag: "urinary_blockage", re: /\bno (pee|urine|wee)\b/i },
  { flag: "urinary_blockage", re: /\b(blocked|blockage)\b/i, negatable: true },
  { flag: "urinary_blockage", re: /\b(keeps going|keeps running|keeps going back|in and out of|back and forth to|living in|sitting in)\s+(\w+\s+){0,2}litter/i },
  { flag: "urinary_blockage", re: /\blitter( box| tray)?\b.{0,60}\b(cry|cries|crying|yowl\w*|scream\w*|howl\w*|meow\w* in pain|nothing)\b/i },

  // Breathing.
  { flag: "breathing", re: /\b(open[- ]mouth(ed)?|mouth)[- ]breath\w*/i },
  { flag: "breathing", re: /\bbreath\w*\s+(with|through)\s+(his|her|their|its|the)\s+mouth\b/i },
  { flag: "breathing", re: /\bpant(ing|ed)\b/i, negatable: true },
  { flag: "breathing", re: /\bbreath(ing|es|s)?\s+((is|was|seems|looks|sounds|has been|got|gets) )?(really |very |so |too |super )?(fast|quick|quickly|rapid|rapidly|hard|heavy|heavily|weird|strangely|funny|labou?red|shallow)\b/i, negatable: true },
  { flag: "breathing", re: /\b(fast|rapid|heavy|labou?red|difficult|noisy|struggled|struggling|hard)\s+(\w+\s+){0,1}breath/i, negatable: true },
  { flag: "breathing", re: /\b(can'?t|cannot|struggling to|trouble|difficulty|hard to|stopped)\s+(\w+\s+){0,1}breath/i },
  { flag: "breathing", re: /\b(not|isn'?t) breathing\b(?!\s+(fast|hard|heavily|heavy|quickly|rapidly|through|with|weird|funny|normally))/i },
  { flag: "breathing", re: /\b(gasp\w*|chok(e|es|ed|ing))\b/i, negatable: true },
  { flag: "breathing", re: /\b(blue|purple|grey|gray|white|pale)\s+(gums|tongue|lips)\b/i },
  { flag: "breathing", re: /\b(gums|tongue|lips)\s+(\w+\s+){0,2}(blue|purple|grey|gray|white|pale)\b/i },

  // Collapse, sudden weakness, back legs.
  { flag: "collapse", re: /\b(collaps\w*|faint(ed|ing)?|passed out|unconscious|unresponsive|floppy)\b/i, negatable: true },
  { flag: "collapse", re: /\b(won'?t|can'?t|cannot|isn'?t|not)\s+(\w+\s+){0,1}(wake|wake up|stand up|get up|walk|move)\b/i },
  { flag: "collapse", re: /\b(paraly\w*|dragging (his|her|their|its) (back |hind )?legs?)\b/i },
  { flag: "collapse", re: /\b(back|hind) legs?\b.{0,40}\b(not working|stopped working|cold|dragging|gave out|give out|won'?t work)\b/i },

  // Seizures.
  { flag: "seizure", re: /\b(seiz\w*|convuls\w*)\b/i, negatable: true },
  { flag: "seizure", re: /\b(having|had|has|having a|in a)\s+(a\s+)?fits?\b/i },
  { flag: "seizure", re: /\b(shaking|twitching|jerking|trembling) (uncontrollably|all over|and (won'?t|can'?t) stop)\b/i },

  // Poisoning: a toxin plus a sign she's been exposed, or "poisoned" outright.
  { flag: "poisoning", re: new RegExp(`\\b${EXPOSURE}\\b.{0,60}\\b${TOXIN}\\b`, "i") },
  { flag: "poisoning", re: new RegExp(`\\b${TOXIN}\\b.{0,60}\\b${EXPOSURE}\\b`, "i") },
  { flag: "poisoning", re: /\bpoison(ed|ing)\b/i, negatable: true },

  // Not eating for a day or more.
  { flag: "not_eating", re: /\b(not|hasn'?t|has not|haven'?t|won'?t|isn'?t|didn'?t|refus\w*|stopped|no interest in|off (his|her|their|its))\s+(\w+\s+){0,1}(eat|eating|ate|eaten|food|touched (his|her|their|its) food)\b.{0,50}\b(\d+\s*(days?|hours?|hrs?)|(two|three|four|five|a couple of|couple of|several|a few)\s+days?|a (whole |full )?day|all day|since yesterday|since (last night|this morning|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|24)/i },
  { flag: "not_eating", re: /\b(\d+|two|three|four|five|a couple of|several|a few)\s+days?\b.{0,40}\b(without|no)\s+(eating|food)\b/i },

  // Repeated vomiting.
  { flag: "vomiting", re: /\b(vomit\w*|throw(s|ing)? up|threw up|thrown up|puk\w*|being sick|been sick)\b.{0,50}\b(keeps?|kept|repeated(ly)?|again and again|over and over|several|multiple|many|\d+|twice|two|three|four|five|a few|lots|constantly|all (day|night)|won'?t stop|can'?t stop|non[- ]?stop|times|every)\b/i, unless: /\bonce\b/i },
  { flag: "vomiting", re: /\b(keeps?|kept|won'?t stop|can'?t stop|constantly|repeatedly)\s+(\w+\s+){0,1}(vomit\w*|throw(ing)? up|puk\w*|being sick)\b/i },

  // Blood (blood tests and the like are removed first; see BENIGN_BLOOD).
  { flag: "blood", re: /\b(blood|bloody|bleed\w*)\b/i, negatable: true },

  // Trauma.
  { flag: "trauma", re: /\b(hit by (a |the )?(car|vehicle|truck|bike)|run over|ran over|got hit|was hit|been hit)\b/i },
  { flag: "trauma", re: /\b(fell|fall|fallen|jumped)\s+(\w+\s+){0,2}(from|out of|off)\s+(\w+\s+){0,2}(window|balcony|roof|tree|stairs|floor|storey|story|ledge)\b/i },
  { flag: "trauma", re: /\b(attacked by|bitten by|mauled|dog attack|bite wound|broken (leg|bone|tail|jaw)|electrocut\w*|chewed (\w+\s+){0,1}(wire|cable|cord)|burn(ed|t) (his|her|their|its)|crushed|shut in (the|a) (door|window))\b/i },
];

// "Blood test" and friends are routine vet talk, not bleeding.
const BENIGN_BLOOD = /\b(blood|bloods)\s*(test\w*|work|panel|pressure|sugar|glucose|results?|draw|count|screen\w*|check\w*|and urine)\b|\bkidney blood\b/gi;

export function detectRedFlags(message: string): FlagId[] {
  const text = message.replace(/[’‘]/g, "'").replace(BENIGN_BLOOD, " ").replace(/\s+/g, " ");
  const found = new Set<FlagId>();
  for (const rule of RULES) {
    if (found.has(rule.flag) || rule.unless?.test(text)) continue;
    const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : `${rule.re.flags}g`);
    for (const m of text.matchAll(re)) {
      if (rule.negatable && NEGATED_BEFORE.test(text.slice(Math.max(0, m.index - 24), m.index))) continue;
      found.add(rule.flag);
      break;
    }
  }
  // A breathing count she quotes: over 30 a minute at rest is red (decision 7).
  for (const m of text.matchAll(/\b(\d{2,3})\s*(breaths?|bpm|times)?\s*(a|per|\/)\s*(minute|min)\b|\b(\d{2,3})\s*bpm\b/gi)) {
    if (Number(m[1] ?? m[5]) > 30) found.add("breathing");
  }
  for (const m of text.matchAll(/\b(\d{2})\s*breaths?\s*in\s*(30|thirty)\s*sec/gi)) {
    if (Number(m[1]) * 2 > 30) found.add("breathing");
  }
  return [...found];
}

// The fixed urgent card for each flag. Never written by the model.
export function urgentCopy(flag: FlagId, cat: CatWords) {
  const w = words(cat.pronoun);
  const go = `Take ${cat.name} to an emergency vet now.`;
  switch (flag) {
    case "urinary_blockage":
      return { title: go, body: `A cat straining with little or nothing coming out may have a blocked bladder. It's treatable, but only fast. Don't wait to see if it passes.` };
    case "breathing":
      return { title: go, body: `Fast, noisy or open-mouth breathing at rest is an emergency in a cat. Keep ${w.obj} calm and still, and go now.` };
    case "collapse":
      return { title: go, body: `Collapse, sudden weakness or back legs that stop working need a vet straight away. Some causes are only treatable fast.` };
    case "seizure":
      return { title: go, body: `Keep ${w.obj} away from stairs and hard edges, don't put anything in ${w.poss} mouth, and go now. Note how long it lasted.` };
    case "poisoning":
      return { title: `Call the poison line or an emergency vet now.`, body: `Don't wait for signs: some poisons, like lilies and antifreeze, do damage before ${w.subj} looks ill. Bring the packaging or a photo of the plant.` };
    case "not_eating":
      return { title: `Get ${cat.name} seen by a vet today.`, body: `A cat that hasn't eaten for a day or more can get seriously ill quickly. Call ${vetLabel(null)} now, and if they can't see ${w.obj} today, go to an emergency vet.` };
    case "vomiting":
      return { title: `Get ${cat.name} seen by a vet today.`, body: `Vomiting again and again can mean a blockage or poisoning, and ${w.subj} can dehydrate fast. If ${w.subj} also seems weak or won't drink, go now.` };
    case "blood":
      return { title: `Get ${cat.name} seen by a vet now.`, body: `Blood in pee, poo or vomit, or bleeding that won't stop, needs a vet today. If ${w.subj} is straining, weak or the bleeding is heavy, go to an emergency vet now.` };
    case "trauma":
      return { title: go, body: `After a fall, a car or a fight, cats often hide serious injuries. Even if ${w.subj} seems fine, ${w.subj} needs checking now. Move ${w.obj} gently in a carrier or a box.` };
    case "general":
      return { title: go, body: `What you're describing can't wait. Call ${vetLabel(null)} or go to the nearest emergency vet now.` };
  }
}

// The first flag decides the card; poisoning always shows the poison line.
export const FLAG_PRIORITY: FlagId[] = ["breathing", "collapse", "seizure", "urinary_blockage", "poisoning", "trauma", "blood", "vomiting", "not_eating", "general"];
export const primaryFlag = (flags: FlagId[]): FlagId | null => FLAG_PRIORITY.find((f) => flags.includes(f)) ?? null;

// --- After the model ------------------------------------------------------------------

// Medicine doses: a sentence that names a medicine AND gives an amount ("5 mg", "half a
// tablet", "per kg"). Water and food amounts ("about 200 ml of water a day") are not doses.
const MEDICINE =
  /\b(medicines?|medications?|meds|pills?|tablets?|capsules?|doses?|dosage|dosing|aspirin|tylenol|acetaminophen|paracetamol|ibuprofen|benadryl|diphenhydramine|pepcid|famotidine|omeprazole|gabapentin|prednisolone|prednisone|steroids?|metacam|meloxicam|buprenorphine|antibiotics?|amoxicillin|clavamox|cerenia|maropitant|mirtazapine|ondansetron|laxatives?|lactulose|miralax|cbd|melatonin|antihistamines?|insulin|methimazole|benazepril|amlodipine|syrup|ointment)\b/i;
const AMOUNT =
  /\b\d+(\.\d+)?\s*(mg|mcg|µg|ml|cc|milligrams?|millilit(er|re)s?|micrograms?|iu|units?|drops?|teaspoons?|tsp)\b|\b(mg|ml)\s*\/\s*(kg|lb)\b|\bper (kg|kilo|kilogram|lb|pound)\b|\b(half|quarter|one|two|three|1\/2|1\/4)\s+(a\s+|an\s+|of\s+a\s+)?(tablet|pill|capsule|teaspoon|dose)s?\b/i;
const DOSE_STATEMENT = /\b(the )?(dosage|dose) (is|would be|should be|for (a|your) cat is)\b/i;

const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/);
const isDosing = (t: string) => DOSE_STATEMENT.test(t) || sentences(t).some((s) => MEDICINE.test(s) && AMOUNT.test(s));

// Reads like a diagnosis: names what she has, without hedging to "your vet can tell".
const CONDITION =
  "(kidney disease|chronic kidney disease|ckd|renal failure|kidney failure|diabetes|hyperthyroidism|an? overactive thyroid|a uti|an? urinary tract infection|cystitis|fic|idiopathic cystitis|bladder stones|crystals|a blockage|urethral obstruction|cancer|lymphoma|a tumou?r|pancreatitis|ibd|inflammatory bowel disease|heart disease|cardiomyopathy|hcm|asthma|arthritis|an infection|a virus|fip|fiv|felv|feline leuke?mia|liver disease|hepatic lipidosis|fatty liver|dental disease|stomatitis|hairballs?|constipation|megacolon|an allergy|allergies|anemia|anaemia|poisoning)";
const diagnosisPatterns = (catName: string) => {
  const subject = `(he|she|they|it|your cat|${catName.replace(/[^\w ]/g, "") || "your cat"})`;
  return [
    new RegExp(`\\b${subject}\\s+(has|have|has got|is suffering from|definitely has|probably has|likely has|almost certainly has|must have)\\s+${CONDITION}\\b`, "i"),
    new RegExp(`\\b(it'?s|it is|this is|that'?s|that is|sounds like|looks like|consistent with|most likely|probably|definitely|almost certainly)\\s+(just\\s+)?${CONDITION}\\b`, "i"),
    /\b(my |the )?diagnosis (is|would be)\b/i,
    /\bi('d| would)? diagnose\b/i,
  ];
};

// Reassurance, which is only wrong when the topic is a red flag.
const REASSURANCE = [
  /\b(nothing|no need) to worry\b/i,
  /\b(don'?t|do not|no need to) worry\b/i,
  /\bno need to (panic|rush|hurry)\b/i,
  /\b(probably|likely|usually|most likely|almost certainly|it'?s) (fine|okay|ok|nothing( serious)?|normal|harmless|not serious|not an emergency|not urgent)\b/i,
  /\bnot (an )?(emergency|urgent|serious|a big deal)\b/i,
  /\b(wait and see|keep an eye on (it|him|her|them)|monitor (him|her|them|it)? ?(at home|for a (day|few days|while))|see if it passes|should (pass|settle|clear up)|can wait|no need (for|to see|to call|to go to) (a |the |your )?vet|sleep on it|until (the )?morning)\b/i,
];

// "Don't wait to see if it passes" is the opposite of reassurance: a match right after a
// negation doesn't count.
const NEGATED_ADVICE = /\b(don'?t|do not|never|not|no|shouldn'?t|won'?t|without)\s+(\w+\s+){0,3}$/i;
const reassures = (text: string) =>
  REASSURANCE.some((re) =>
    [...text.matchAll(new RegExp(re.source, "gi"))].some((m) => !NEGATED_ADVICE.test(text.slice(Math.max(0, m.index - 40), m.index))),
  );

export type GuardResult = { text: string; replaced: null | "dosing" | "diagnosis" | "reassurance" };

export function guardAnswer(answer: string, opts: { redTopic: boolean; cat: CatWords; vetName?: string | null }): GuardResult {
  const text = answer.replace(/[’‘]/g, "'");
  const vet = vetLabel(opts.vetName);
  if (isDosing(text)) {
    return {
      replaced: "dosing",
      text: `I can't give medicine doses: the safe amount for a cat depends on ${words(opts.cat.pronoun).poss} weight, health and other medicines, and many human medicines are poisonous to cats. Please call ${vet} before giving ${opts.cat.name} anything. If ${words(opts.cat.pronoun).subj} has already had something, call the poison line now.`,
    };
  }
  if (diagnosisPatterns(opts.cat.name).some((re) => re.test(text))) {
    return {
      replaced: "diagnosis",
      text: opts.redTopic
        ? `I can't tell what's wrong, and this can't wait for a guess. Please follow the steps above and get ${opts.cat.name} to a vet now.`
        : `I can't say what's causing this. Only a vet who examines ${opts.cat.name} can. Write down what you've noticed and when it started, and book a visit with ${vet}. If ${words(opts.cat.pronoun).subj} stops eating, strains to pee or breathes fast, go to a vet now.`,
    };
  }
  if (opts.redTopic && reassures(text)) {
    return {
      replaced: "reassurance",
      text: `Please don't wait on this one. Follow the steps above and get ${opts.cat.name} seen now. I'll be here when you're back.`,
    };
  }
  return { text: answer, replaced: null };
}

// The model may mark an answer it judges urgent by starting with a line "URGENT". The
// server strips it and shows the fixed card (flag "general"): a second net, never the first.
export function takeUrgentMarker(answer: string): { urgent: boolean; text: string } {
  const m = answer.match(/^\s*\**URGENT\**:?\s*\n?/);
  return m ? { urgent: true, text: answer.slice(m[0].length).trimStart() } : { urgent: false, text: answer };
}

// --- The answer, laid out like the design ---------------------------------------------

export type AnswerParts = { paras: string[]; steps: string[]; goNow: string | null; followUps: string[] };

// The format the system prompt asks for: short paragraphs, then optionally "What I'd do:"
// with numbered steps, a "Go to a vet now if" line, and up to two ">> " follow-up questions.
export function parseAnswer(text: string): AnswerParts {
  const parts: AnswerParts = { paras: [], steps: [], goNow: null, followUps: [] };
  let inSteps = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(">>")) {
      const q = line.replace(/^>>\s*/, "").trim();
      if (q && parts.followUps.length < 2) parts.followUps.push(q);
      continue;
    }
    if (/^\**what i'?d do\**:?\**$/i.test(line.replace(/[’]/g, "'"))) {
      inSteps = true;
      continue;
    }
    const step = line.match(/^(\d+)[.)]\s+(.*)$/) ?? line.match(/^[-•*]\s+(.*)$/);
    if (step) {
      parts.steps.push(step[step.length - 1]);
      inSteps = true;
      continue;
    }
    if (/^\**go to a vet now/i.test(line)) {
      parts.goNow = line.replace(/\*\*/g, "");
      continue;
    }
    if (inSteps && parts.steps.length) parts.steps[parts.steps.length - 1] += ` ${line}`;
    else parts.paras.push(line);
  }
  return parts;
}

// --- Words for the screen ---------------------------------------------------------------

export function starterQuestions(cat: CatWords & { ageYears?: number | null }): string[] {
  const w = words(cat.pronoun);
  return [
    `How much should ${cat.name} drink a day?`,
    `How do I get ${w.obj} to drink more?`,
    `Is wet or dry food better for ${w.poss} kidneys?`,
    `What changes should I watch for as ${w.subj} gets older?`,
  ];
}

export const URGENT_FOLLOW_UP = "What should I tell the vet?";

export function askErrorMessage(status: number | null, error: string | undefined, catName: string): string {
  if (status === null) return "We couldn't reach AquaOne Health. Check your connection and try again.";
  if (status === 401 || error === "signed_out") return "You've been signed out. Sign in again to keep asking.";
  if (status === 403) return "We couldn't find an active membership for this email.";
  if (error === "no_cat") return "Set up your cat first, then come back to ask.";
  if (error === "too_long") return `That's a long one. Keep it under ${MAX_QUESTION_CHARS} characters and try again.`;
  if (error === "daily_cap") return `That's today's ${DAILY_QUESTION_CAP} questions about ${catName}. You can ask again tomorrow. If something looks urgent, call your vet or find an emergency vet now.`;
  if (error === "model_failed") return `I couldn't answer just now. Try again in a moment. If something looks urgent, call your vet or find an emergency vet now.`;
  if (status === 400) return "That didn't look right. Try asking again.";
  return "Something went wrong on our side. Try again in a moment.";
}
