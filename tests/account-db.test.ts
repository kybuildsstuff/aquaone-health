// Edit cat and reminder settings through the real save functions the API routes call, with real
// sessions: two throwaway users signed in with the publishable key (row-level security applies).
// Users are deleted afterwards (cats and reminder_prefs cascade); residue is asserted zero.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { catEditSchema } from "../src/lib/account";
import { loadCat, updateCat, updateReminders } from "../src/lib/account.server";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const created: string[] = [];

async function makeUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `acct-${label}-${randomUUID().slice(0, 8)}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, client };
}

const edit = (over: Record<string, unknown> = {}) =>
  catEditSchema.parse({ name: "Milo", pronoun: "he", ageYears: 11, weight: 10.6, weightUnit: "lb", lives: "indoor", food: "mix", conditions: ["kidney"], vetName: "Dr. Lane", vetPhone: "555 013 4471", ...over });

let a: { id: string; client: SupabaseClient };
let b: { id: string; client: SupabaseClient };
let aCat: string;

beforeAll(async () => {
  a = await makeUser("a");
  b = await makeUser("b");
  const { data, error } = await a.client.from("cats").insert({ owner_id: a.id, name: "Tabs", conditions: ["urinary", "other:hairballs"] }).select("id").single();
  if (error) throw error;
  aCat = data.id;
  const p = await a.client.from("reminder_prefs").insert({ user_id: a.id, by_email: true, checkin_time: "08:00", timezone: "America/Chicago" });
  if (p.error) throw p.error;
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  const cats = (await admin.from("cats").select("id", { count: "exact", head: true }).in("owner_id", created)).count;
  const prefs = (await admin.from("reminder_prefs").select("user_id", { count: "exact", head: true }).in("user_id", created)).count;
  console.log(`account-db residue: cats ${cats}, reminder_prefs ${prefs}`);
  expect([cats, prefs]).toEqual([0, 0]);
});

describe("edit cat", () => {
  it("saves her edits to her own cat and keeps old free-text conditions", async () => {
    const r = await updateCat(a.client, edit({ name: "Milo", weight: 5, weightUnit: "kg" }));
    expect(r).toEqual({ ok: true, data: { catId: aCat } });
    const cat = await loadCat(a.client);
    expect(cat).toMatchObject({ id: aCat, name: "Milo", pronoun: "he", age_years: 11, start_weight_lb: 11.02, lives: "indoor", food: "mix", vet_name: "Dr. Lane" });
    expect(cat!.conditions).toEqual(["kidney", "other:hairballs"]);
  });

  it("another member can't edit her cat: with no cat of her own she gets no_cat, and the cat is unchanged", async () => {
    const r = await updateCat(b.client, edit({ name: "Hacked" }));
    expect(r).toMatchObject({ ok: false, status: 409, error: "no_cat" });
    const direct = await b.client.from("cats").update({ name: "Hacked" }).eq("id", aCat).select("id");
    expect(direct.data).toEqual([]);
    expect((await admin.from("cats").select("name").eq("id", aCat).single()).data?.name).toBe("Milo");
  });

  it("the database refuses what validation would refuse, even if a request skipped it", async () => {
    const bad = await a.client.from("cats").update({ name: "" }).eq("id", aCat).select("id");
    expect(bad.error).not.toBeNull();
    const badAge = await a.client.from("cats").update({ age_years: 99 }).eq("id", aCat).select("id");
    expect(badAge.error).not.toBeNull();
  });
});

describe("reminder settings", () => {
  it("saves her own settings and leaves her timezone alone", async () => {
    expect(await updateReminders(a.client, { byEmail: false, checkinTime: "19:00" })).toEqual({ ok: true, data: {} });
    const row = (await admin.from("reminder_prefs").select("by_email, by_text, checkin_time, timezone").eq("user_id", a.id).single()).data;
    expect(row).toEqual({ by_email: false, by_text: false, checkin_time: "19:00:00", timezone: "America/Chicago" });
  });

  it("another member's save only ever writes her own row", async () => {
    expect((await updateReminders(b.client, { byEmail: true, checkinTime: "12:00" })).ok).toBe(true);
    const aRow = (await admin.from("reminder_prefs").select("by_email, checkin_time").eq("user_id", a.id).single()).data;
    expect(aRow).toEqual({ by_email: false, checkin_time: "19:00:00" });
    const direct = await b.client.from("reminder_prefs").update({ by_email: true }).eq("user_id", a.id).select("user_id");
    expect(direct.data).toEqual([]);
  });
});
