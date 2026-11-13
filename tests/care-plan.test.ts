// Care-plan picker properties, run against the REAL library in care_tasks (read-only),
// across every onboarding profile shape and 30 consecutive days.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { isEligible, pickTasks, TASKS_PER_DAY, type CareTask, type CatProfile } from "../src/lib/care-plan";
import { CONDITIONS } from "../src/lib/onboarding";
import { addDays } from "../src/lib/dates";

config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

let library: CareTask[] = [];
beforeAll(async () => {
  const { data, error } = await admin.from("care_tasks").select("id, title, detail, tags, min_age, conditions");
  if (error) throw error;
  library = data as CareTask[];
});

const CONDITION_IDS = CONDITIONS.map((c) => c.id) as string[];
const KINDS = ["water", "play", "food", "grooming", "home", "bond", "health"];
const LIVES = ["indoor", "outdoor", "both"];
const FOODS = ["dry", "wet", "mix"];
const AGES = [0.5, 3, 8, 11, 16];
const CONDITION_SETS: string[][] = [[], ...CONDITION_IDS.map((c) => [c]), ["stiff_joints", "sensitive_stomach"], ["kidney", "urinary", "thyroid"], CONDITION_IDS];

function profiles(): CatProfile[] {
  const out: CatProfile[] = [];
  let n = 0;
  for (const lives of LIVES)
    for (const food of FOODS)
      for (const age of AGES)
        for (const conditions of CONDITION_SETS)
          out.push({ id: `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`, age_years: age, lives, food, conditions });
  return out;
}

describe("care-task library", () => {
  it("has about 60 tasks, each with one kind tag and only known tag prefixes and conditions", () => {
    expect(library.length).toBeGreaterThanOrEqual(55);
    for (const t of library) {
      expect(t.tags.filter((g) => KINDS.includes(g)), t.id).toHaveLength(1);
      for (const g of t.tags) expect(KINDS.includes(g) || /^(lives|food|under|not):/.test(g), `${t.id} tag ${g}`).toBe(true);
      for (const g of t.tags.filter((x) => x.startsWith("lives:"))) expect(LIVES).toContain(g.slice(6));
      for (const g of t.tags.filter((x) => x.startsWith("food:"))) expect(FOODS).toContain(g.slice(5));
      for (const g of t.tags.filter((x) => x.startsWith("not:"))) expect(CONDITION_IDS).toContain(g.slice(4));
      for (const c of t.conditions) expect(CONDITION_IDS, `${t.id} condition ${c}`).toContain(c);
    }
  });

  it("every onboarding condition has at least one task of its own", () => {
    for (const c of CONDITION_IDS) expect(library.some((t) => t.conditions.includes(c)), c).toBe(true);
  });

  it("copy is plain general care: no plaque/tartar, cure/treat claims, or other brands", () => {
    const banned = /\b(plaque|tartar|cure[sd]?|treats? (kidney|diabetes|thyroid)|prevents?|diagnos\w*|catit|petsafe|drinkwell|petlibro|veken|pioneer pet|whisker|purina|hill'?s|royal canin)\b/i;
    for (const t of library) expect(`${t.title} ${t.detail ?? ""}`, t.id).not.toMatch(banned);
    for (const t of library) expect(t.title.length, t.id).toBeLessThanOrEqual(45);
  });
});

describe("pickTasks", () => {
  it("every profile has at least six eligible tasks, so consecutive days never need to repeat", () => {
    for (const cat of profiles()) expect(library.filter((t) => isEligible(t, cat)).length, JSON.stringify(cat)).toBeGreaterThanOrEqual(2 * TASKS_PER_DAY);
  });

  it("picks 3 distinct eligible tasks a day, stable for the day, with no task repeated on consecutive days", () => {
    const start = "2026-11-17";
    for (const cat of profiles()) {
      let yesterday: string[] = [];
      for (let d = 0; d < 30; d++) {
        const date = addDays(start, d);
        const ids = pickTasks(library, cat, date, yesterday);
        expect(ids).toHaveLength(TASKS_PER_DAY);
        expect(new Set(ids).size).toBe(TASKS_PER_DAY);
        for (const id of ids) expect(isEligible(library.find((t) => t.id === id)!, cat), `${id} for ${JSON.stringify(cat)}`).toBe(true);
        expect(pickTasks(library, cat, date, yesterday)).toEqual(ids); // same inputs, same plan
        expect(ids.filter((id) => yesterday.includes(id))).toEqual([]);
        yesterday = ids;
      }
    }
  });

  it("leads with a water task, and includes one of her conditions when she has any", () => {
    for (const cat of profiles()) {
      const ids = pickTasks(library, cat, "2026-11-20");
      const tasks = ids.map((id) => library.find((t) => t.id === id)!);
      expect(tasks[0].tags).toContain("water");
      if (cat.conditions.length) expect(tasks.some((t) => t.conditions.some((c) => cat.conditions.includes(c))), JSON.stringify(cat)).toBe(true);
    }
  });

  it("respects the tags: outdoor-only tasks never reach an indoor cat, senior tasks never reach a kitten, no climbing for stiff joints", () => {
    const indoorKitten: CatProfile = { id: "k", age_years: 0.5, lives: "indoor", food: "wet", conditions: ["stiff_joints"] };
    const eligible = library.filter((t) => isEligible(t, indoorKitten)).map((t) => t.id);
    expect(eligible).not.toContain("home_in_before_dark");
    expect(eligible).not.toContain("groom_senior_help");
    expect(eligible).not.toContain("play_climb");
    expect(eligible).not.toContain("water_after_dry");
    expect(eligible).toContain("play_before_bed");
    expect(eligible).toContain("play_gentle");
  });

  it("varies across days: a cat sees more than a dozen different tasks in a month", () => {
    const cat = profiles()[0];
    const seen = new Set<string>();
    let y: string[] = [];
    for (let d = 0; d < 30; d++) {
      y = pickTasks(library, cat, addDays("2026-11-17", d), y);
      y.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBeGreaterThan(12);
  });
});
