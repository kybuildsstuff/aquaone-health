// Proves row-level security through the real API with real sessions:
// two throwaway users are created with the admin API, signed in with the
// publishable key, and deleted afterwards (their cats cascade away).
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type TestUser = { id: string; client: SupabaseClient };
const created: string[] = [];

async function makeUser(label: string): Promise<TestUser> {
  const email = `rls-${label}-${randomUUID().slice(0, 8)}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

let a: TestUser;
let b: TestUser;
let aCatId: string;

beforeAll(async () => {
  a = await makeUser("a");
  b = await makeUser("b");
  const { data, error } = await a.client.from("cats").insert({ owner_id: a.id, name: "Milo" }).select("id").single();
  if (error) throw error;
  aCatId = data.id;
  const ci = await a.client.from("check_ins").insert({ cat_id: aCatId, date: "2026-12-01", drinking: "normal" });
  if (ci.error) throw ci.error;
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("row-level security", () => {
  it("the owner sees her own cat and check-in", async () => {
    const cats = await a.client.from("cats").select("id, name");
    expect(cats.error).toBeNull();
    expect(cats.data).toEqual([{ id: aCatId, name: "Milo" }]);
    const checks = await a.client.from("check_ins").select("cat_id").eq("cat_id", aCatId);
    expect(checks.data).toHaveLength(1);
  });

  it("another member cannot read her cat, even by id", async () => {
    const all = await b.client.from("cats").select("id");
    expect(all.data).toEqual([]);
    const byId = await b.client.from("cats").select("id").eq("id", aCatId);
    expect(byId.data).toEqual([]);
    const checks = await b.client.from("check_ins").select("id").eq("cat_id", aCatId);
    expect(checks.data).toEqual([]);
  });

  it("another member cannot write to her cat", async () => {
    const insert = await b.client.from("check_ins").insert({ cat_id: aCatId, date: "2026-12-02", drinking: "more" });
    expect(insert.error).not.toBeNull();
    const update = await b.client.from("cats").update({ name: "Hacked" }).eq("id", aCatId).select("id");
    expect(update.data).toEqual([]);
    const still = await a.client.from("cats").select("name").eq("id", aCatId).single();
    expect(still.data?.name).toBe("Milo");
  });

  it("a member cannot create a cat owned by someone else", async () => {
    const res = await b.client.from("cats").insert({ owner_id: a.id, name: "Sneaky" });
    expect(res.error).not.toBeNull();
  });

  it("members cannot write their own membership", async () => {
    const res = await a.client.from("members").insert({ email: `x-${randomUUID()}@test.invalid`, auth_user_id: a.id, status: "active" });
    expect(res.error).not.toBeNull();
  });

  it("signed-out visitors see nothing", async () => {
    const anon = createClient(url, publishable, { auth: { persistSession: false } });
    const cats = await anon.from("cats").select("id");
    expect(cats.data ?? []).toEqual([]);
    const items = await anon.from("safety_items").select("id");
    expect(items.data ?? []).toEqual([]);
  });

  it("kidney_watch_status only reports on her own cat", async () => {
    const own = await a.client.rpc("kidney_watch_status", { p_cat_id: aCatId });
    expect(own.error).toBeNull();
    expect(own.data?.[0]?.checkins_total).toBe(1);
    const other = await b.client.rpc("kidney_watch_status", { p_cat_id: aCatId });
    expect(other.data?.[0]?.checkins_total ?? 0).toBe(0);
  });
});
