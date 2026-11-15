// Label Scan's matching, against our real list (supabase/seed/safety_items.json), with no model
// and no database: the model only reads the label; this code decides what's on our list.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLabelIndex, matchLabel, splitIngredients, LABEL_IGNORE, type LabelIndexItem } from "../src/lib/safe-label";

const items = (JSON.parse(readFileSync("supabase/seed/safety_items.json", "utf8")) as Omit<LabelIndexItem, "id">[]).map((r) => ({ ...r, id: r.name }));
const index = buildLabelIndex(items);
const scan = (raw: string[]) => matchLabel(splitIngredients(raw), index);

describe("Label Scan matching", () => {
  it("dog flea shampoo: permethrin is the emergency, and leads the list", () => {
    const r = scan(["Permethrin 0.07%", "Pyrethrins 0.05%", "Piperonyl Butoxide 0.5%", "Water", "Sodium Lauryl Sulfate", "Coconut Oil", "Fragrance"]);
    expect(r.worst).toBe("emergency");
    expect(r.flagged[0]).toMatchObject({ ingredient: "Permethrin 0.07%", name: "Dog flea treatment (permethrin)" });
    expect(r.flagged.map((f) => f.name)).toEqual(expect.arrayContaining(["Insect spray", "Sodium lauryl sulfate"]));
    expect(r.unlisted).toEqual(expect.arrayContaining(["Water", "Fragrance", "Coconut Oil"]));
  });

  it("cat treats: only the garlic is flagged; salt, yeast and liver are ordinary label words", () => {
    const r = scan(["Chicken", "Chicken Liver", "Ground Rice", "Glycerin", "Salt", "Natural Flavor", "Brewers Dried Yeast", "Garlic Powder", "Mixed Tocopherols", "Taurine"]);
    expect(r.flagged.map((f) => f.name)).toEqual(["Garlic"]);
    expect(r.worst).toBe("toxic");
    expect(r.unlisted).toEqual(expect.arrayContaining(["Salt", "Brewers Dried Yeast", "Chicken Liver"]));
    expect(r.listedSafe).toBeGreaterThanOrEqual(1); // chicken is on our list as safe
  });

  it("a plain food label flags nothing", () => {
    expect(scan(["Tuna", "Water", "Guar Gum", "Taurine", "Vitamin E Supplement"])).toMatchObject({ flagged: [], worst: null });
  });

  it("finds a dangerous item inside a longer ingredient name", () => {
    const r = scan(["Dehydrated Garlic", "Onion Powder", "Xylitol (sweetener)", "Tea Tree Oil"]);
    expect(r.flagged.map((f) => f.name)).toEqual(expect.arrayContaining(["Garlic", "Onion", "Xylitol", "Tea tree oil"]));
  });

  it("covers the new ingredient entries", () => {
    const names = scan(["Propylene Glycol", "d-Limonene", "Boric Acid", "Camphor", "Salicylic Acid", "Fipronil", "2-Butoxyethanol", "Chlorpyrifos", "Theobromine"]).flagged.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Propylene glycol",
        "Limonene (citrus extract)",
        "Boric acid and borax",
        "Camphor and menthol rubs",
        "Salicylic acid",
        "Fipronil (cat flea treatment)",
        "Glycol ether solvents",
        "Organophosphate insecticides",
        "Chocolate",
      ]),
    );
  });

  it("a whole list read as one string is split into ingredients, with headings and repeats dropped", () => {
    expect(splitIngredients(["Ingredients: Water, Salt and Garlic.", "water"])).toEqual(["Water", "Salt", "Garlic"]);
  });

  it("an ignored word never flags, even though our list uses it elsewhere", () => {
    for (const w of ["salt", "yeast", "zinc", "iron", "liver"]) expect(LABEL_IGNORE.has(w)).toBe(true);
    expect(scan(["Chicken", "Salt", "Yeast", "Zinc", "Iron"]).flagged).toEqual([]); // the first ingredient is never ignored (audit, 15 Nov)
  });

  it("a product that is only salt is judged as salt: a warning, not a pass (Ky's sea salt test, 15 Nov)", () => {
    for (const label of [["Natural Sea Salt"], ["Sea salt"], ["Salt"], ["Himalayan pink salt", "Iodine"]]) {
      const r = scan(label);
      expect(r.flagged.map((f) => f.name), label.join(", ")).toContain("Salt");
      expect(r.worst).toBe("toxic");
    }
  });

  it("salt inside a longer ingredient list is still an ordinary label word", () => {
    const r = scan(["Chicken", "Natural Sea Salt", "Rice", "Taurine"]);
    expect(r.flagged).toEqual([]);
    expect(r.unlisted).toContain("Natural Sea Salt");
  });

  it("a one-ingredient product of something dangerous is flagged as that thing", () => {
    expect(scan(["Pure Tea Tree Oil"]).flagged.map((f) => f.name)).toContain("Tea tree oil");
    expect(scan(["Yeast"]).flagged.map((f) => f.name)).toContain("Raw bread dough");
  });

  it("counts ingredients that are on our list as safe, so the screen can tell 'all safe' from 'not on our list'", () => {
    expect(scan(["Chicken", "Rice", "Pumpkin"])).toMatchObject({ flagged: [], unlisted: [], worst: null });
    expect(scan(["Chicken", "Rice", "Pumpkin"]).listedSafe).toBe(3);
    expect(scan(["Water", "Guar Gum", "Taurine"]).listedSafe).toBe(0);
  });

  // Audit, 15 Nov (all reproduced against the real list before the fix).
  it("reads the name inside brackets: tea tree shampoo, onion in natural flavour, garlic in spices", () => {
    expect(scan(["Aqua", "Melaleuca Alternifolia (Tea Tree) Leaf Oil", "Glycerin"]).flagged.map((f) => f.name)).toContain("Tea tree oil");
    expect(scan(["Chicken", "Rice", "Natural Flavor (Onion)"]).flagged.map((f) => f.name)).toContain("Onion");
    expect(scan(["Beef", "Spices (Garlic, Paprika)", "Water"]).flagged.map((f) => f.name)).toContain("Garlic");
  });

  it("knows the Latin label names for essential oils and tea tree", () => {
    expect(scan(["Water", "Mentha Piperita Oil", "Glycerin"]).worst).toBe("emergency");
    expect(scan(["Water", "Lavandula Angustifolia Oil", "Glycerin"]).worst).toBe("emergency");
  });

  it("finds THC inside a longer name (a cannabis gummy)", () => {
    expect(scan(["Sugar", "Corn Syrup", "Delta-9 THC Distillate", "Pectin"]).flagged[0].name).toBe("Cannabis");
    expect(scan(["Hemp-derived Delta-8 THC"]).flagged.map((f) => f.name)).toContain("Cannabis");
  });

  it("a box of table salt with additives is still judged as salt (the first ingredient is never ignored)", () => {
    expect(scan(["Salt", "Calcium Silicate", "Potassium Iodide"]).flagged.map((f) => f.name)).toContain("Salt");
    expect(scan(["Chicken", "Salt", "Rice"]).flagged).toEqual([]); // salt further down a treat label is still ordinary
  });
});
