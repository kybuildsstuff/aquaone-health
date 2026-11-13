// Invariants of the live Is it safe? list (read-only). Properties, not values: sizes have floors,
// every row is complete, and the cases that matter most for a cat are always right.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type Row = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  verdict: string;
  severity: string;
  summary: string;
  what_to_do: string | null;
  source: string;
  scientific_name: string | null;
};
const rows: Row[] = [];
const byName = (n: string) => rows.find((r) => r.name.toLowerCase() === n.toLowerCase());

beforeAll(async () => {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("safety_items")
      .select("id, name, aliases, category, verdict, severity, summary, what_to_do, source, scientific_name")
      .order("name")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if ((data ?? []).length < 1000) break;
  }
});

describe("the Is it safe? list", () => {
  it("has about 1,000 plants and about 150 foods, household products and medicines", () => {
    expect(rows.filter((r) => r.category === "plant").length).toBeGreaterThanOrEqual(900);
    expect(rows.filter((r) => r.category !== "plant").length).toBeGreaterThanOrEqual(120);
    for (const c of ["food", "household", "medicine"]) expect(rows.filter((r) => r.category === c).length).toBeGreaterThanOrEqual(30);
  });

  it("every row has a severity, a summary, what to do and a source; verdict always follows severity", () => {
    const verdictOf = { safe: "safe", mild: "caution", toxic: "toxic", emergency: "toxic" } as Record<string, string>;
    for (const r of rows) {
      expect(["safe", "mild", "toxic", "emergency"], r.name).toContain(r.severity);
      expect(r.verdict, r.name).toBe(verdictOf[r.severity]);
      expect(r.summary.trim().length, r.name).toBeGreaterThan(10);
      expect((r.what_to_do ?? "").trim().length, r.name).toBeGreaterThan(10);
      expect(r.source.trim().length, r.name).toBeGreaterThan(5);
    }
  });

  it("plants name the ASPCA lists as their source", () => {
    for (const r of rows.filter((x) => x.category === "plant")) expect(r.source, r.name).toBe("ASPCA Animal Poison Control lists");
  });

  it("has no duplicate names, ignoring case", () => {
    const names = rows.map((r) => r.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("only uses the cat-word placeholders the app fills in", () => {
    for (const r of rows) {
      const tokens = `${r.summary} ${r.what_to_do}`.match(/\{[^}]*\}/g) ?? [];
      for (const t of tokens) expect(["{name}", "{obj}", "{poss}"], `${r.name}: ${t}`).toContain(t);
    }
  });

  it("every true lily and daylily is an emergency, and says pollen and vase water", () => {
    const lilies = rows.filter((r) => /\b(lilium|hemerocallis)\b/i.test(r.scientific_name ?? ""));
    expect(lilies.length).toBeGreaterThanOrEqual(5);
    for (const r of lilies) {
      expect(r.severity, r.name).toBe("emergency");
      expect(r.summary, r.name).toMatch(/pollen/i);
      expect(r.summary, r.name).toMatch(/vase/i);
      expect(r.what_to_do, r.name).toMatch(/vet now/i);
    }
    expect(byName("Lily")?.severity).toBe("emergency");
  });

  it("the well-known dangers are toxic or emergency", () => {
    const dangers = ["Lily", "Easter Lily", "Onion", "Garlic", "Chocolate", "Grapes", "Raisins", "Xylitol", "Dog flea treatment (permethrin)", "Acetaminophen (paracetamol)", "Ibuprofen", "Antifreeze", "Bleach", "Alcohol", "Raw bread dough", "Caffeine", "Tea tree oil", "Essential oils", "Sago Palm", "Oleander", "Lily of the Valley"];
    for (const n of dangers) {
      const r = byName(n);
      expect(r, n).toBeDefined();
      expect(["toxic", "emergency"], n).toContain(r!.severity);
    }
  });

  it("the well-known safe plants are safe", () => {
    for (const n of ["Spider Plant", "Boston Fern", "Cat grass", "Calathea", "Phalaenopsis Orchid", "African Violet", "Christmas Cactus"]) {
      expect(byName(n)?.severity, n).toBe("safe");
    }
  });

  it("the database matches the seed file in the repo (no drift either way)", () => {
    const seed = JSON.parse(readFileSync("supabase/seed/safety_items.json", "utf8")) as { name: string; severity: string }[];
    expect(rows.length).toBe(seed.length);
    const live = new Map(rows.map((r) => [r.name, r.severity]));
    for (const s of seed) expect(live.get(s.name), s.name).toBe(s.severity);
  });

  it("no description copies the ASPCA's own sentences (spot check of their stock phrases)", () => {
    const theirs = [/clinical signs/i, /toxic principles/i, /consultation fee may apply/i, /if you suspect your pet/i, /intense burning and irritation of mouth/i];
    for (const r of rows) for (const re of theirs) expect(`${r.summary} ${r.what_to_do}`, r.name).not.toMatch(re);
  });
});
