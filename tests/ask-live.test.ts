// One real call to the real model through the real POST /api/ask handler and the real
// database. Opt-in, because it costs money: ASK_LIVE=1 npx vitest run tests/ask-live.test.ts
// Without ASK_LIVE=1 it reports NOT RUN (never a pass). A throwaway member is created and
// deleted; residue is asserted zero.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { detectRedFlags, guardAnswer } from "../src/lib/ask";

config({ path: ".env.local", quiet: true });
const LIVE = process.env.ASK_LIVE === "1";
if (!LIVE) console.log("ask-live: NOT RUN (set ASK_LIVE=1 to call the real model once)");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
let actingAs: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => actingAs }));

const email = `ask-live-${randomUUID().slice(0, 8)}@test.invalid`;
let userId = "";
let catId = "";

describe.skipIf(!LIVE)("Ask with the real model", () => {
  beforeAll(async () => {
    const password = randomUUID();
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error) throw u.error;
    userId = u.data.user.id;
    const m = await admin.from("members").insert({ email, shopify_customer_id: "TEST", status: "trial", trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    if (m.error) throw m.error;
    actingAs = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const s = await actingAs.auth.signInWithPassword({ email, password });
    if (s.error) throw s.error;
    const cat = await actingAs.from("cats").insert({ owner_id: userId, name: "Pickle", pronoun: "he", age_years: 11, conditions: [] }).select("id").single();
    if (cat.error) throw cat.error;
    catId = cat.data.id;
  });

  afterAll(async () => {
    await admin.from("members").delete().eq("email", email).eq("shopify_customer_id", "TEST");
    if (userId) await admin.auth.admin.deleteUser(userId);
    const users = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((x) => x.email === email).length;
    const chats = catId ? (await admin.from("chat_messages").select("id", { count: "exact", head: true }).eq("cat_id", catId)).count : 0;
    console.log(`ask-live residue: users ${users}, chat_messages ${chats}`);
    expect([users, chats]).toEqual([0, 0]);
  });

  it("answers a normal question, safely, and saves it", async () => {
    const { POST } = await import("../src/app/api/ask/route");
    const q = "How much water should Pickle drink in a day?";
    expect(detectRedFlags(q)).toEqual([]);
    const res = await POST(new Request("http://test.local/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: q }) }));
    expect(res.status).toBe(200);
    const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const answer = events.at(-1);
    console.log("ask-live answer:", JSON.stringify(answer));
    expect(answer.type).toBe("answer");
    expect(answer.text.length).toBeGreaterThan(20);
    // Whatever it said has already passed the guard; the guard finds nothing left to replace.
    expect(guardAnswer(answer.text, { redTopic: false, cat: { name: "Pickle", pronoun: "he" } }).replaced).toBeNull();
    const saved = await admin.from("chat_messages").select("role").eq("cat_id", catId);
    expect(saved.data?.map((r) => r.role).sort()).toEqual(["assistant", "user"]);
  }, 90_000);
});
