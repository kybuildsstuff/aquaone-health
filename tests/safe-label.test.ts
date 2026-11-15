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
    expect(r.unlisted).toEqual(expect.arrayContaining(["Salt", "Brewers Dried Yeast", "Chicken Liver", "Chicken"]));
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
    expect(scan(["Salt", "Yeast", "Zinc", "Iron"]).flagged).toEqual([]);
  });
});
