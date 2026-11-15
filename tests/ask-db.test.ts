// Ask through the real POST /api/ask handler and the real database, with a stubbed model
// (the real one is never called here). Two throwaway members (A and B, @test.invalid) are
// created, signed in with real sessions and deleted afterwards; residue is asserted zero.
// Only the cookie plumbing is replaced: supabaseServer() returns the member's own signed-in
// client, so row-level security applies exactly as in production.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AskModel, AskModelInput } from "../src/lib/ask-model.server";
import { DAILY_QUESTION_CAP, PHOTO_DAILY_CAP, PHOTO_DEFAULT_QUESTION } from "../src/lib/ask";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

// Who the request is from, and what the model says.
let actingAs: SupabaseClient;
let modelCalls: AskModelInput[] = [];
let modelReply: (input: AskModelInput) => Promise<string> = async () => "Fine.";
const stubModel: AskModel = (input) => {
  modelCalls.push(input);
  return modelReply(input);
};
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => actingAs }));
vi.mock("@/lib/ask-model.server", async (orig) => ({ ...(await orig<object>()), anthropicAskModel: () => stubModel }));

const { POST } = await import("../src/app/api/ask/route");
const { deleteOldAskPhotos, ASK_PHOTO_BUCKET } = await import("../src/lib/ask.server");

// A real (tiny) PNG, sent the way the phone sends it: multipart with "message" and "photo".
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const askWithPhoto = (message: string, photo: Blob = new Blob([PNG], { type: "image/png" })) => {
  const form = new FormData();
  form.append("message", message);
  form.append("photo", photo, "photo.png");
  return POST(new Request("http://test.local/api/ask", { method: "POST", body: form }));
};
const storedPhotos = async (catId: string) => ((await admin.storage.from("ask-photos").list(catId, { limit: 1000 })).data ?? []).map((o) => `${catId}/${o.name}`);

type Member = { id: string; email: string; client: SupabaseClient; catId: string };
const tag = randomUUID().slice(0, 8);
const members: Member[] = [];
let a: Member;
let b: Member;

async function makeMember(label: string, catName: string): Promise<Member> {
  const email = `ask-${label}-${tag}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const m = await admin.from("members").insert({ email, shopify_customer_id: "TEST", status: "trial", trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() });
  if (m.error) throw m.error;
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const cat = await client
    .from("cats")
    .insert({ owner_id: data.user.id, name: catName, pronoun: "he", age_years: 11, lives: "indoor", food: "dry", conditions: ["kidney"], vet_name: "Dr. Lane", vet_phone: "555 0100" })
    .select("id")
    .single();
  if (cat.error) throw cat.error;
  const member = { id: data.user.id, email, client, catId: cat.data.id as string };
  members.push(member);
  return member;
}

const ask = (message: unknown) =>
  POST(new Request("http://test.local/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) }));

async function events(res: Response) {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const messagesOf = async (catId: string) =>
  (await admin.from("chat_messages").select("role, content, flagged_urgent").eq("cat_id", catId).order("created_at")).data ?? [];

beforeAll(async () => {
  a = await makeMember("a", "Pickle");
  b = await makeMember("b", "Bean");
  // Five "more" check-ins, so the context has something to carry.
  const today = new Date();
  const rows = Array.from({ length: 5 }, (_, i) => ({ cat_id: a.catId, date: new Date(today.getTime() - (i + 1) * 86400000).toISOString().slice(0, 10), drinking: "more" }));
  const ci = await a.client.from("check_ins").insert(rows);
  if (ci.error) throw ci.error;
});

beforeEach(async () => {
  actingAs = a.client;
  modelCalls = [];
  modelReply = async () => "Fine.";
  await admin.from("chat_messages").delete().in("cat_id", members.map((m) => m.catId));
});

afterAll(async () => {
  for (const m of members) {
    const paths = await storedPhotos(m.catId);
    if (paths.length) await admin.storage.from("ask-photos").remove(paths);
    await admin.from("members").delete().eq("email", m.email).eq("shopify_customer_id", "TEST");
    await admin.auth.admin.deleteUser(m.id);
  }
  const ids = members.map((m) => m.catId);
  const users = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.email?.endsWith(`-${tag}@test.invalid`)).length;
  const rows = (await admin.from("members").select("id", { count: "exact", head: true }).like("email", `%-${tag}@test.invalid`)).count;
  const cats = (await admin.from("cats").select("id", { count: "exact", head: true }).in("id", ids)).count;
  const chats = (await admin.from("chat_messages").select("id", { count: "exact", head: true }).in("cat_id", ids)).count;
  const photos = (await Promise.all(ids.map(storedPhotos))).flat().length;
  console.log(`ask residue: users ${users}, members ${rows}, cats ${cats}, chat_messages ${chats}, photos ${photos}`);
  expect([users, rows, cats, chats, photos]).toEqual([0, 0, 0, 0, 0]);
});

describe("POST /api/ask", () => {
  it("signed out: 401, and the model is never called", async () => {
    actingAs = createClient(url, publishable, { auth: { persistSession: false } });
    const res = await ask("How much should he drink?");
    expect([res.status, (await res.json()).error]).toEqual([401, "signed_out"]);
    expect(modelCalls).toHaveLength(0);
  });

  it("an empty or too-long question is refused before the model", async () => {
    expect((await ask("   ")).status).toBe(400);
    const long = await ask("x".repeat(1001));
    expect([long.status, (await long.json()).error]).toEqual([400, "too_long"]);
    expect(modelCalls).toHaveLength(0);
  });

  it("a normal question: the model gets her cat and last 14 days, the answer is saved and sent", async () => {
    modelReply = async () => "His check-ins show it too.\n\nWhat I'd do:\n1. Book a vet visit this week.\n>> Is it his food?";
    const res = await ask("He's drinking more lately, should I worry?");
    expect(res.status).toBe(200);
    const ev = await events(res);
    expect(ev.map((e) => e.type)).toEqual(["answer"]);
    expect(ev[0]).toMatchObject({ urgent: false, flags: [], replaced: null, remaining: DAILY_QUESTION_CAP - 1 });

    const input = modelCalls[0];
    expect(input.context).toMatch(/Name: Pickle/);
    expect(input.context).toMatch(/Dr\. Lane/);
    expect((input.context.match(/ more/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(input.context).toMatch(/Kidney Watch/);
    expect(input.messages.at(-1)).toEqual({ role: "user", content: "He's drinking more lately, should I worry?" });
    expect(input.system).toMatch(/Never diagnose/);

    expect(await messagesOf(a.catId)).toEqual([
      { role: "user", content: "He's drinking more lately, should I worry?", flagged_urgent: false },
      { role: "assistant", content: ev[0].text, flagged_urgent: false },
    ]);
  });

  it("the conversation so far goes to the model, in order and alternating", async () => {
    await events(await ask("First question"));
    await events(await ask("Second question"));
    const turns = modelCalls[1].messages;
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[0].content).toBe("First question");
    expect(turns[2].content).toBe("Second question");
  });

  it("an emergency: the urgent card is sent before the model has answered, and reassurance is replaced", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    modelReply = async () => {
      await gate;
      return "It's probably nothing to worry about, just keep an eye on him.";
    };
    const res = await ask("Pickle keeps going to the litter box but nothing comes out. He's crying.");
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).split("\n")[0]);
    expect(first).toEqual({ type: "urgent", flags: ["urinary_blockage"] });
    release();
    let rest = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    const answer = JSON.parse(rest.trim().split("\n").at(-1)!);
    expect(answer).toMatchObject({ type: "answer", urgent: true, flags: ["urinary_blockage"], replaced: "reassurance" });
    expect(answer.text).not.toMatch(/nothing to worry/);
    expect(modelCalls[0].context).toMatch(/matched this message as an emergency/);
    const saved = await messagesOf(a.catId);
    expect(saved.map((m) => m.flagged_urgent)).toEqual([true, true]);
  });

  it("dosing in the model's answer never reaches her", async () => {
    modelReply = async () => "You can give him 5 mg of Benadryl to calm him.";
    const ev = await events(await ask("He's anxious about the car ride, what can I give him?"));
    expect(ev.at(-1)).toMatchObject({ type: "answer", replaced: "dosing" });
    expect(ev.at(-1).text).not.toMatch(/5 mg/);
    expect((await messagesOf(a.catId)).at(-1)?.content).not.toMatch(/5 mg/);
  });

  it("the model's own URGENT line shows the general card", async () => {
    modelReply = async () => "URGENT\nGo to an emergency vet now.";
    const ev = await events(await ask("His belly is swollen and hard"));
    expect(ev.map((e) => e.type)).toEqual(["urgent", "answer"]);
    expect(ev[1]).toMatchObject({ urgent: true, flags: ["general"], text: "Go to an emergency vet now." });
  });

  it("when the model fails: a specific error, and with a red flag the card still stands", async () => {
    modelReply = async () => {
      throw new Error("boom");
    };
    const plain = await events(await ask("How often should I clean the fountain?"));
    expect(plain).toEqual([{ type: "error", error: "model_failed" }]);
    const urgent = await events(await ask("She collapsed in the kitchen"));
    expect(urgent).toEqual([{ type: "urgent", flags: ["collapse"] }, { type: "error", error: "model_failed" }]);
    const saved = await messagesOf(a.catId);
    expect(saved.at(-1)).toMatchObject({ role: "assistant", flagged_urgent: true });
  });

  it(`the daily cap: question ${DAILY_QUESTION_CAP + 1} is refused without the model, but an emergency still gets the card`, async () => {
    const rows = Array.from({ length: DAILY_QUESTION_CAP }, (_, i) => ({ cat_id: a.catId, role: "user", content: `q${i}` }));
    const ins = await admin.from("chat_messages").insert(rows);
    if (ins.error) throw ins.error;

    const capped = await ask("How much should he drink?");
    expect([capped.status, (await capped.json()).error]).toEqual([429, "daily_cap"]);
    expect(modelCalls).toHaveLength(0);

    const ev = await events(await ask("He hasn't peed since yesterday"));
    expect(ev.map((e) => e.type)).toEqual(["urgent", "answer"]);
    expect(ev[1]).toMatchObject({ urgent: true, replaced: "at_cap" });
    expect(modelCalls).toHaveLength(0);
  });

  it("yesterday's questions don't count toward today's cap", async () => {
    const rows = Array.from({ length: DAILY_QUESTION_CAP }, (_, i) => ({ cat_id: a.catId, role: "user", content: `old ${i}`, created_at: new Date(Date.now() - 36 * 3600000).toISOString() }));
    const ins = await admin.from("chat_messages").insert(rows);
    if (ins.error) throw ins.error;
    const res = await ask("How much should he drink?");
    expect(res.status).toBe(200);
    await events(res);
    expect(modelCalls).toHaveLength(1);
  });
});

describe("Ask that can see (photos)", () => {
  it("a photo goes to the model with her question, is kept privately, and its description is saved, never shown", async () => {
    modelReply = async () => "PHOTO: small pile of vomit with hair in it\nThat looks like a hairball with some food. Watch him today.";
    const res = await askWithPhoto("He threw this up, worry?");
    expect(res.status).toBe(200);
    const ev = await events(res);
    expect(ev.at(-1)).toMatchObject({ type: "answer", urgent: false });
    expect(ev.at(-1).text).not.toMatch(/PHOTO:/);
    expect(modelCalls[0].image).toMatchObject({ mediaType: "image/png" });
    expect(modelCalls[0].image?.data).toBe(PNG.toString("base64"));
    expect(modelCalls[0].system).toMatch(/PHOTO: /);

    const rows = (await admin.from("chat_messages").select("role, content, photo_path, photo_note").eq("cat_id", a.catId).order("created_at")).data ?? [];
    expect(rows[0]).toMatchObject({ role: "user", content: "He threw this up, worry?", photo_note: "small pile of vomit with hair in it" });
    expect(rows[0].photo_path).toMatch(new RegExp(`^${a.catId}/.+\\.png$`));
    expect(await storedPhotos(a.catId)).toContain(rows[0].photo_path);
    // Private: a member can't download it directly, only through a signed link from the server.
    const direct = await a.client.storage.from(ASK_PHOTO_BUCKET).download(rows[0].photo_path!);
    expect(direct.error).not.toBeNull();
  });

  it("a photo with no words gets the default question", async () => {
    modelReply = async () => "PHOTO: a grey cat lying on a sofa\nHe looks relaxed.";
    await events(await askWithPhoto(""));
    expect(modelCalls[0].messages.at(-1)?.content).toBe(PHOTO_DEFAULT_QUESTION);
  });

  it("an emergency in the photo: the model's URGENT line shows the card, before or after the PHOTO line", async () => {
    modelReply = async () => "URGENT\nPHOTO: red-tinged urine clumps in a litter box\nPlease go to an emergency vet now.";
    const ev = await events(await askWithPhoto("Is this normal?"));
    expect(ev.map((e) => e.type)).toEqual(["urgent", "answer"]);
    expect(ev[1].text).not.toMatch(/PHOTO:|URGENT/);
    const note = (await admin.from("chat_messages").select("photo_note").eq("cat_id", a.catId).eq("role", "user").single()).data?.photo_note;
    expect(note).toBe("red-tinged urine clumps in a litter box");
  });

  it("later questions see the photo's description in the conversation", async () => {
    modelReply = async () => "PHOTO: a small scab above the left eye\nKeep an eye on it.";
    await events(await askWithPhoto("What's this?"));
    modelReply = async () => "Fine.";
    await events(await ask("Is it getting better?"));
    expect(modelCalls[1].messages[0].content).toMatch(/\[She sent a photo: a small scab above the left eye\]/);
    expect(modelCalls[1].image).toBeUndefined();
  });

  it(`photo ${PHOTO_DAILY_CAP + 1} today is refused without the model; words still work, and an emergency photo is still answered`, async () => {
    const rows = Array.from({ length: PHOTO_DAILY_CAP }, (_, i) => ({ cat_id: a.catId, role: "user", content: `p${i}`, photo_path: `${a.catId}/fake-${i}.jpg` }));
    const ins = await admin.from("chat_messages").insert(rows);
    if (ins.error) throw ins.error;
    const capped = await askWithPhoto("And this one?");
    expect([capped.status, (await capped.json()).error]).toEqual([429, "photo_cap"]);
    expect(modelCalls).toHaveLength(0);
    expect((await ask("And in words?")).status).toBe(200);
    const urgent = await askWithPhoto("He's straining in the litter box and nothing comes out");
    expect(urgent.status).toBe(200);
    expect((await events(urgent))[0]).toMatchObject({ type: "urgent" });
  });

  it("a file that isn't a photo, or is too big, is refused before the model", async () => {
    const txt = await askWithPhoto("hi", new Blob(["hello"], { type: "text/plain" }));
    expect([txt.status, (await txt.json()).error]).toEqual([415, "bad_type"]);
    const big = await askWithPhoto("hi", new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/jpeg" }));
    expect([big.status, (await big.json()).error]).toEqual([413, "too_large"]);
    expect(modelCalls).toHaveLength(0);
  });

  it("photos older than 90 days are deleted from storage; the question and description stay", async () => {
    modelReply = async () => "PHOTO: a food bowl\nOK.";
    await events(await askWithPhoto("Old one"));
    const row = (await admin.from("chat_messages").select("id, photo_path").eq("cat_id", a.catId).eq("role", "user").single()).data!;
    await admin.from("chat_messages").update({ created_at: new Date(Date.now() - 91 * 86400000).toISOString() }).eq("id", row.id);
    const { deleted } = await deleteOldAskPhotos();
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await storedPhotos(a.catId)).not.toContain(row.photo_path);
    const after = (await admin.from("chat_messages").select("content, photo_path, photo_note").eq("id", row.id).single()).data;
    expect(after).toEqual({ content: "Old one", photo_path: null, photo_note: "a food bowl" });
  });
});

describe("chat_messages row-level security", () => {
  it("another member can't read her conversation, even by cat id", async () => {
    await events(await ask("A private question"));
    const own = await a.client.from("chat_messages").select("content").eq("cat_id", a.catId);
    expect(own.data?.map((r) => r.content)).toContain("A private question");
    actingAs = b.client;
    const other = await b.client.from("chat_messages").select("id").eq("cat_id", a.catId);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it("members can only read: no writing the assistant's words, no deleting questions to reset the cap", async () => {
    await events(await ask("Keep this one"));
    const insert = await a.client.from("chat_messages").insert({ cat_id: a.catId, role: "assistant", content: "forged" });
    expect(insert.error).not.toBeNull();
    await a.client.from("chat_messages").delete().eq("cat_id", a.catId);
    await a.client.from("chat_messages").update({ content: "edited" }).eq("cat_id", a.catId);
    const after = await messagesOf(a.catId);
    expect(after.map((m) => m.content)).toContain("Keep this one");
    expect(after.map((m) => m.content)).not.toContain("edited");
    expect(after.map((m) => m.content)).not.toContain("forged");
  });
});
