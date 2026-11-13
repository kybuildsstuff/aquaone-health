// Is it safe? end to end against the real database, as real signed-in users, through the same
// server functions the API routes call: search (aliases, misspellings), the unknown path, the
// photo path with a stubbed model, and row-level security on lookups. Throwaway users are
// created and deleted; residue is asserted zero.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getItem, photoLookup, recentLookups, recordSearchLookup, searchItems } from "../src/lib/safe.server";
import { fillCatWords, isConfident, pickMatch, unknownMessage } from "../src/lib/safe";
import type { Identification, Identifier } from "../src/lib/safe-vision.server";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type U = { id: string; client: SupabaseClient; catId: string | null };
const created: string[] = [];
const catIds: string[] = [];

async function makeUser(label: string, withCat: boolean): Promise<U> {
  const email = `safe-${label}-${randomUUID().slice(0, 8)}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  let catId: string | null = null;
  if (withCat) {
    const cat = await client.from("cats").insert({ owner_id: data.user.id, name: "Milo", pronoun: "he" }).select("id").single();
    if (cat.error) throw cat.error;
    catId = cat.data.id;
    catIds.push(catId!);
  }
  return { id: data.user.id, client, catId };
}

const stub = (result: Identification): Identifier & { calls: number } => {
  const fn = Object.assign(
    async () => {
      fn.calls++;
      return result;
    },
    { calls: 0 },
  );
  return fn;
};
const IMAGE = { data: "aGVsbG8=", mediaType: "image/jpeg" as const };

let a: U;
let b: U;
let noCat: U;
beforeAll(async () => {
  a = await makeUser("a", true);
  b = await makeUser("b", true);
  noCat = await makeUser("nocat", false);
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  const { count: cats } = await admin.from("cats").select("*", { count: "exact", head: true }).in("id", catIds);
  const { count: lookups } = await admin.from("safety_lookups").select("*", { count: "exact", head: true }).in("cat_id", catIds);
  console.log(`safe residue: cats ${cats}, lookups ${lookups}`);
  expect([cats, lookups]).toEqual([0, 0]);
});

const top = async (q: string) => (await searchItems(a.client, q, 5))[0];

describe("search", () => {
  it("finds items by their own name, exactly", async () => {
    for (const [q, name] of [["lily", "Lily"], ["Spider plant", "Spider Plant"], ["onion", "Onion"], ["chocolate", "Chocolate"]]) {
      const m = await top(q);
      expect(m?.name, q).toBe(name);
      expect(isConfident(m), q).toBe(true);
    }
  });

  it("finds items by another name (alias), including brand names owners type", async () => {
    for (const [q, name] of [["tylenol", "Acetaminophen (paracetamol)"], ["paracetamol", "Acetaminophen (paracetamol)"], ["permethrin", "Dog flea treatment (permethrin)"], ["coolant", "Antifreeze"], ["sultanas", "Raisins"], ["moth orchid", "Phalaenopsis Orchid"], ["wheatgrass", "Cat grass"]]) {
      const m = await top(q);
      expect(m?.name, q).toBe(name);
      expect(isConfident(m), q).toBe(true);
    }
  });

  it("finds items despite misspellings", async () => {
    for (const [q, name] of [["easter lilly", "Easter Lily"], ["spidr plant", "Spider Plant"], ["ibuprofin", "Ibuprofen"], ["chocolat", "Chocolate"], ["poinsetia", "Poinsettia"], ["lilly of the valley", "Lily of the Valley"]]) {
      const m = await top(q);
      expect(m?.name, q).toBe(name);
      expect(isConfident(m), q).toBe(true);
    }
  });

  it("a close call between different answers is never opened for her (she picks)", async () => {
    // "rubber plant": one rubber plant on the list is safe, another is toxic.
    expect(pickMatch(await searchItems(a.client, "rubber plant")).kind).toBe("ambiguous");
    expect(pickMatch(await searchItems(a.client, "lily"))).toMatchObject({ kind: "item", match: { name: "Lily" } });
    expect(pickMatch(await searchItems(a.client, "qwxzv")).kind).toBe("none");
  });

  it("a name with extra words still opens the item it names (photo of a minoxidil bottle)", async () => {
    // Found by Ky on 13 Nov: the photo read "minoxidil topical solution 5%" and the screen said
    // "not on our list" although Minoxidil is on it as an emergency.
    for (const [q, name] of [
      ["minoxidil topical solution 5%", "Minoxidil"],
      ["Rogaine minoxidil foam for men", "Minoxidil"],
      ["advil liqui-gels 200 mg", "Ibuprofen"],
      ["peace lily plant", "Peace Lily"],
    ]) {
      const pick = pickMatch(await searchItems(a.client, q), q);
      expect(pick, q).toMatchObject({ kind: "item", match: { name } });
    }
    expect(pickMatch(await searchItems(a.client, "rubber plant"), "rubber plant").kind).toBe("ambiguous");
    expect(pickMatch(await searchItems(a.client, "blue ceramic plant pot"), "blue ceramic plant pot").kind).not.toBe("item");
  });

  it("lilies come back as emergencies", async () => {
    for (const q of ["lily", "lilies", "tiger lily", "daylily"]) expect((await top(q))?.severity, q).toBe("emergency");
  });

  it("nonsense and items we don't list are never a confident match", async () => {
    for (const q of ["qwxzv", "zz plant", "kombucha"]) expect(isConfident(await top(q)), q).toBe(false);
  });

  it("signed-out visitors can't search the list", async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } });
    const r = await anon.rpc("search_safety_items", { q: "lily", max_results: 3 });
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
  });
});

describe("the unknown path", () => {
  it("uses the decided wording in her cat's pronoun", () => {
    expect(unknownMessage("he")).toBe("We don't have this one. If he's eaten it, call the poison line now.");
    expect(unknownMessage("she")).toBe("We don't have this one. If she's eaten it, call the poison line now.");
    expect(unknownMessage("they")).toBe("We don't have this one. If they've eaten it, call the poison line now.");
  });

  it("logs an unmatched lookup against her cat with no item", async () => {
    const r = await recordSearchLookup(a.client, "kombucha", null);
    expect(r).toEqual({ ok: true, data: { logged: true } });
    const { data } = await a.client.from("safety_lookups").select("query, matched_item_id, method").eq("cat_id", a.catId!).eq("query", "kombucha");
    expect(data).toEqual([{ query: "kombucha", matched_item_id: null, method: "search" }]);
  });

  it("logs a matched lookup, and it shows in Recently checked", async () => {
    const lily = await top("lily");
    expect((await recordSearchLookup(a.client, "lily", lily.id)).ok).toBe(true);
    const recent = await recentLookups(a.client, a.catId!);
    expect(recent[0]).toMatchObject({ itemId: lily.id, severity: "emergency", label: "Lily" });
  });

  it("refuses an item id that isn't on the list", async () => {
    const r = await recordSearchLookup(a.client, "x", randomUUID());
    expect(r.ok).toBe(false);
  });

  it("before onboarding there's no cat to log against, and nothing breaks", async () => {
    expect(await recordSearchLookup(noCat.client, "lily", null)).toEqual({ ok: true, data: { logged: false } });
  });
});

describe("photo (model stubbed: it only names the item)", () => {
  it("a confident name that matches the list opens that item, and is logged as a photo lookup", async () => {
    const identify = stub({ found: true, name: "Easter lily", confidence: "high", alternatives: ["Lilium longiflorum"] });
    const r = await photoLookup(a.client, IMAGE, identify);
    expect(identify.calls).toBe(1);
    if (!r.ok) throw new Error(r.error);
    const item = await getItem(a.client, r.data.itemId!);
    expect(item?.name).toBe("Easter Lily");
    expect(item?.severity).toBe("emergency");
    const { data } = await a.client.from("safety_lookups").select("query, matched_item_id, method").eq("cat_id", a.catId!).eq("method", "photo");
    expect(data).toContainEqual({ query: "Easter lily", matched_item_id: r.data.itemId, method: "photo" });
  });

  it("the verdict always comes from our list, whatever the model says", async () => {
    // The stub can only return a name; a safe plant's name gives the list's safe answer.
    const r = await photoLookup(a.client, IMAGE, stub({ found: true, name: "Spider plant", confidence: "high", alternatives: [] }));
    if (!r.ok) throw new Error(r.error);
    expect((await getItem(a.client, r.data.itemId!))?.severity).toBe("safe");
  });

  it("a low-confidence guess is not treated as a match: unknown answer, with the near matches", async () => {
    const r = await photoLookup(a.client, IMAGE, stub({ found: true, name: "Peace lily", confidence: "low", alternatives: ["Calla lily"] }));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.itemId).toBeNull();
    expect(r.data.candidates.map((c) => c.name)).toEqual(expect.arrayContaining(["Peace Lily"]));
  });

  it("a name not on our list gives the unknown answer", async () => {
    const r = await photoLookup(a.client, IMAGE, stub({ found: true, name: "Zamioculcas zamiifolia", confidence: "high", alternatives: [] }));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.itemId).toBeNull();
  });

  it("nothing recognisable in the photo gives the unknown answer, logged", async () => {
    const r = await photoLookup(a.client, IMAGE, stub({ found: false, name: "", confidence: "low", alternatives: [] }));
    if (!r.ok) throw new Error(r.error);
    expect([r.data.itemId, r.data.candidates.length]).toEqual([null, 0]);
    const { data } = await a.client.from("safety_lookups").select("matched_item_id").eq("cat_id", a.catId!).eq("query", r.data.query);
    expect(data).toEqual([{ matched_item_id: null }]);
  });
});

describe("row-level security on lookups", () => {
  it("another member can't read her lookups, even by cat id", async () => {
    const own = await a.client.from("safety_lookups").select("id").eq("cat_id", a.catId!);
    expect((own.data ?? []).length).toBeGreaterThan(0);
    const other = await b.client.from("safety_lookups").select("id").eq("cat_id", a.catId!);
    expect(other.data).toEqual([]);
  });

  it("another member can't write a lookup against her cat", async () => {
    const r = await b.client.from("safety_lookups").insert({ cat_id: a.catId, query: "sneaky" });
    expect(r.error).not.toBeNull();
  });

  it("members can read the list but never change it", async () => {
    const lily = await top("lily");
    const upd = await a.client.from("safety_items").update({ severity: "safe", verdict: "safe" }).eq("id", lily.id).select("id");
    expect(upd.data ?? []).toEqual([]);
    const ins = await a.client.from("safety_items").insert({ name: `x-${randomUUID()}`, category: "food", verdict: "safe", severity: "safe", summary: "xxxxxxxxxxx", what_to_do: "xxxxxxxxxxx", source: "x" });
    expect(ins.error).not.toBeNull();
    expect((await getItem(a.client, lily.id))?.severity).toBe("emergency");
  });

  it("fills her cat's words into the list's text", () => {
    expect(fillCatWords("Wipe {poss} fur so {name} can't lick it; keep {obj} warm.", { name: "Milo", pronoun: "he" })).toBe("Wipe his fur so Milo can't lick it; keep him warm.");
    expect(fillCatWords("{name} and {obj}", null)).toBe("your cat and them");
  });
});
