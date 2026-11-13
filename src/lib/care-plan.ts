// The daily care plan: rules, not AI (decisions.md). Three tasks a day per cat, picked
// deterministically from the tagged library in care_tasks, so the same cat on the same
// day always gets the same plan. The plan is stored in care_plan_days once picked.
// Tag meanings are documented in supabase/migrations/20261114090100_care_tasks_library.sql.

export type CareTask = {
  id: string;
  title: string;
  detail: string | null;
  tags: string[];
  min_age: number | string | null;
  conditions: string[];
};

export type CatProfile = {
  id: string;
  age_years: number | string | null;
  lives: string | null;
  food: string | null;
  conditions: string[];
};

export const TASKS_PER_DAY = 3;

const tagValues = (tags: string[], prefix: string) =>
  tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));

export function isEligible(task: CareTask, cat: CatProfile): boolean {
  const age = cat.age_years == null ? null : Number(cat.age_years);
  if (task.conditions.length && !task.conditions.some((c) => cat.conditions.includes(c))) return false;
  if (task.min_age != null && (age == null || age < Number(task.min_age))) return false;

  const lives = tagValues(task.tags, "lives");
  if (lives.length && (!cat.lives || !lives.includes(cat.lives))) return false;
  const food = tagValues(task.tags, "food");
  if (food.length && (!cat.food || !food.includes(cat.food))) return false;
  for (const under of tagValues(task.tags, "under")) {
    if (age == null || age >= Number(under)) return false;
  }
  for (const not of tagValues(task.tags, "not")) {
    if (cat.conditions.includes(not)) return false;
  }
  return true;
}

// FNV-1a: a small stable hash, so the order is fixed for a cat and day but varies day to day.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Picks the day's three task ids. Rules, in order:
//   1. only tasks this cat is eligible for;
//   2. none of yesterday's tasks, as long as at least three others are eligible;
//   3. one water task first (it's a water-fountain brand) and no second one, then one task
//      for one of her conditions if she has any, then the rest in the day's shuffled order.
export function pickTasks(library: CareTask[], cat: CatProfile, date: string, yesterdayIds: string[] = []): string[] {
  const order = (t: CareTask) => hash(`${cat.id}|${date}|${t.id}`);
  const eligible = library.filter((t) => isEligible(t, cat)).sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
  const fresh = eligible.filter((t) => !yesterdayIds.includes(t.id));
  const pool = fresh.length >= TASKS_PER_DAY ? fresh : eligible;
  const isWater = (t: CareTask) => t.tags.includes("water");

  const picks: CareTask[] = [];
  const take = (t: CareTask | undefined) => {
    if (t && picks.length < TASKS_PER_DAY && !picks.includes(t)) picks.push(t);
  };
  take(pool.find(isWater));
  take(pool.find((t) => t.conditions.length > 0 && !isWater(t)));
  for (const t of pool) if (!isWater(t)) take(t);
  for (const t of eligible) take(t); // only reached if the library is too small for the rules above
  return picks.map((t) => t.id);
}
