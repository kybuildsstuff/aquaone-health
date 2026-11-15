// Every cat in the house and Bloodwork, explained, through the real route handlers and the real
// database. Two throwaway members (@test.invalid) with real sessions; row-level security applies as
// in production. Only the plumbing is replaced: supabaseServer() returns the member's own client,
// next/headers serves a per-test cookie jar and request headers, and the model is stubbed.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { LabReading } from "../src/lib/bloodwork-vision.server";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

let actingAs: SupabaseClient;
const jar = new Map<string, string>();
let reqHeaders = new Headers();
let reading: LabReading;
let readerCalls = 0;
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => actingAs }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined), set: (n: string, v: string) => void jar.set(n, v), delete: (n: string) => void jar.delete(n) }),
  headers: async () => reqHeaders,
}));
vi.mock("@/lib/bloodwork-vision.server", async (orig) => ({
  ...(await orig<object>()),
  anthropicLabReader: () => async () => {
    readerCalls++;
    return reading;
  },
}));
vi.mock("@/lib/ask-model.server", async (orig) => ({ ...(await orig<object>()), anthropicAskModel: () => async () => "Fine." }));

const onboarding = (await import("../src/app/api/onboarding/route")).POST;
const select = (await import("../src/app/api/cats/select/route")).POST;
const archive = (await import("../src/app/api/cats/archive/route")).POST;
const restore = (await import("../src/app/api/cats/restore/route")).POST;
const checkIn = (await import("../src/app/api/check-ins/route")).POST;
const ask = (await import("../src/app/api/ask/route")).POST;
const addLab = (await import("../src/app/api/bloodwork/route")).POST;
const deleteLab = (await import("../src/app/api/bloodwork/delete/route")).POST;
const { getContext: getContextRaw } = await import("../src/lib/app-data.server");
const { loadToday: loadTodayRaw } = await import("../src/lib/screens.server");
const page = <T,>(f: () => T) => ((reqHeaders = new Headers()), f());
const getContext = (c: SupabaseClient) => page(() => getContextRaw(c));
const loadToday = (c: SupabaseClient) => page(() => loadTodayRaw(c));
const { explainPanel, loadBloodwork } = await import("../src/lib/bloodwork.server");
const { loadOwnReport } = await import("../src/lib/report.server");
const { CAT_COOKIE, CAT_HEADER } = await import("../src/lib/cats");
const { DAILY_QUESTION_CAP } = await import("../src/lib/ask");
const { LAB_PHOTO_DAILY_CAP } = await import("../src/lib/bloodwork");

// next/headers' headers() is the request's own headers in Next; here it's set from each request.
const post = (handler: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) => {
  const req = new Request("http://test.local/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  reqHeaders = req.headers;
  return handler(req);
};
const json = async (res: Response) => ({ status: res.status, body: await res.json().catch(() => ({})) });
const catAnswers = (name: string) => ({
  name, pronoun: "she", ageYears: 9, weight: null, weightUnit: "lb", lives: "indoor", conditions: [], otherCondition: "", food: "wet", vetName: "", vetPhone: "",
  remindByEmail: true, checkinTime: "08:00", timezone: "America/New_York",
});
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const upload = (headers: Record<string, string> = {}) => {
  const form = new FormData();
  form.append("photo", new Blob([PNG], { type: "image/png" }), "report.png");
  const req = new Request("http://test.local/api/bloodwork", { method: "POST", body: form, headers });
  reqHeaders = req.headers;
  return addLab(req);
};
const panel = (date: string, rows: [string, string, string, string, "high" | "low" | "none"][]): LabReading => ({
  isLabReport: true, readable: "full", labName: "IDEXX", reportDate: date,
  results: rows.map(([name, value, refLow, refHigh, flag]) => ({ name, value, unit: "mg/dL", refLow, refHigh, flag })),
});

type Member = { id: string; email: string; client: SupabaseClient; firstCat: string };
const tag = randomUUID().slice(0, 8);
const members: Member[] = [];
let a: Member;
let b: Member;

async function makeMember(label: string): Promise<Member> {
  const email = `cats-${label}-${tag}@test.invalid`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const m = await admin.from("members").insert({ email, shopify_customer_id: "TEST", status: "trial", trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() });
  if (m.error) throw m.error;
  const client = createClient(url, publishable, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  actingAs = client;
  jar.clear();
  const first = await json(await post(onboarding, catAnswers(`${label}-Milo`)));
  if (first.status !== 200) throw new Error(`onboarding failed ${JSON.stringify(first)}`);
  const member = { id: data.user.id, email, client, firstCat: first.body.catId as string };
  members.push(member);
  return member;
}
const catsOf = async (m: Member) => (await admin.from("cats").select("id, name, archived_at").eq("owner_id", m.id).order("created_at")).data ?? [];

beforeAll(async () => {
  a = await makeMember("a");
  b = await makeMember("b");
}, 60_000);
beforeEach(() => {
  actingAs = a.client;
  jar.clear();
  reqHeaders = new Headers();
});
afterAll(async () => {
  for (const m of members) {
    for (const c of await catsOf(m)) {
      const files = ((await admin.storage.from("lab-photos").list(c.id, { limit: 1000 })).data ?? []).map((o) => `${c.id}/${o.name}`);
      if (files.length) await admin.storage.from("lab-photos").remove(files);
    }
    await admin.from("members").delete().eq("email", m.email).eq("shopify_customer_id", "TEST");
    await admin.auth.admin.deleteUser(m.id);
  }
  const left = await admin.from("cats").select("id", { count: "exact", head: true }).in("owner_id", members.map((m) => m.id));
  expect(left.count).toBe(0);
});

describe("every cat in the house", () => {
  it("adds up to four cats from Account; the fifth is refused and nothing is saved", async () => {
    for (const name of ["Luna", "Pepper", "Ziggy"]) {
      const r = await json(await post(onboarding, { ...catAnswers(name), add: true }));
      expect(r.status).toBe(200);
      expect(jar.get(CAT_COOKIE)).toBe(r.body.catId); // she lands on the new cat
    }
    const fifth = await json(await post(onboarding, { ...catAnswers("Fifth"), add: true }));
    expect([fifth.status, fifth.body.error]).toEqual([409, "cat_limit"]);
    expect((await catsOf(a)).map((c) => c.name)).toEqual(["a-Milo", "Luna", "Pepper", "Ziggy"]);
    // First-time onboarding is still refused once she has a cat.
    expect((await json(await post(onboarding, catAnswers("Again")))).body.error).toBe("already_onboarded");
  });

  it("switching changes the chosen cat everywhere; another member's cat can't be chosen", async () => {
    const [, luna] = await catsOf(a);
    expect((await getContext(a.client))!.cat.name).toBe("a-Milo"); // nothing remembered: her first
    expect((await json(await post(select, { catId: luna.id }))).status).toBe(200);
    const ctx = (await getContext(a.client))!;
    expect([ctx.cat.name, ctx.cats.length]).toEqual(["Luna", 4]);
    const foreign = await json(await post(select, { catId: b.firstCat }));
    expect(foreign.status).toBe(404);
    expect(jar.get(CAT_COOKIE)).toBe(luna.id);
    jar.set(CAT_COOKIE, b.firstCat); // a forged cookie only ever falls back to her own first cat
    expect((await getContext(a.client))!.cat.name).toBe("a-Milo");
  });

  it("a save goes to the cat on screen, never the one another tab switched to; a foreign or removed cat is refused", async () => {
    const [milo, luna] = await catsOf(a);
    jar.set(CAT_COOKIE, milo.id); // another tab switched to Milo
    const r = await post(checkIn, { drinking: "more" }, { [CAT_HEADER]: luna.id }); // this tab shows Luna
    expect(r.status).toBe(200);
    const saved = (await admin.from("check_ins").select("cat_id").in("cat_id", [milo.id, luna.id])).data ?? [];
    expect(saved.map((s) => s.cat_id)).toEqual([luna.id]);
    const foreign = await post(checkIn, { drinking: "less" }, { [CAT_HEADER]: b.firstCat });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect((await admin.from("check_ins").select("id").eq("cat_id", b.firstCat)).data).toEqual([]);
  });

  it("Today lists her other cats that still need today's check-in", async () => {
    const [milo] = await catsOf(a);
    jar.set(CAT_COOKIE, milo.id);
    const t = (await loadToday(a.client))!;
    expect(t.othersToCheckIn.map((c) => c.name)).toEqual(["Pepper", "Ziggy"]); // Luna checked in above
  });

  it("the Ask limit is shared across her cats (2a)", async () => {
    const [milo, luna] = await catsOf(a);
    const now = new Date().toISOString();
    const rows = Array.from({ length: DAILY_QUESTION_CAP }, (_, i) => ({ cat_id: i % 2 ? milo.id : luna.id, role: "user", content: `q${i}`, created_at: now }));
    const ins = await admin.from("chat_messages").insert(rows);
    expect(ins.error).toBeNull();
    jar.set(CAT_COOKIE, milo.id);
    const r = await json(await post(ask, { message: "Is she drinking enough?" }));
    expect([r.status, r.body.error]).toEqual([429, "daily_cap"]);
    await admin.from("chat_messages").delete().in("cat_id", [milo.id, luna.id]);
  });

  it("remove archives a cat (history kept, slot freed); bring back works; the fifth active cat and the last cat are refused", async () => {
    const [milo, luna, pepper, ziggy] = await catsOf(a);
    jar.set(CAT_COOKIE, luna.id);
    expect((await json(await post(archive, { catId: luna.id }))).status).toBe(200);
    expect(jar.has(CAT_COOKIE)).toBe(false); // she was showing Luna: back to her first cat
    expect((await admin.from("check_ins").select("id").eq("cat_id", luna.id)).data?.length).toBe(1); // history kept
    expect((await getContext(a.client))!.cats.map((c) => c.name)).toEqual(["a-Milo", "Pepper", "Ziggy"]);
    const added = await json(await post(onboarding, { ...catAnswers("Newbie"), add: true })); // the freed slot
    expect(added.status).toBe(200);
    expect((await json(await post(restore, { catId: luna.id }))).body.error).toBe("cat_limit");
    expect((await json(await post(archive, { catId: added.body.catId }))).status).toBe(200);
    expect((await json(await post(restore, { catId: luna.id }))).status).toBe(200);
    expect(jar.get(CAT_COOKIE)).toBe(luna.id);
    for (const c of [pepper, ziggy, luna]) await post(archive, { catId: c.id });
    expect((await json(await post(archive, { catId: milo.id }))).body.error).toBe("last_cat");
    expect((await getContext(a.client))!.cats.map((c) => c.name)).toEqual(["a-Milo"]);
  });

  it("another member can't archive or restore her cats", async () => {
    actingAs = b.client;
    expect((await json(await post(archive, { catId: a.firstCat }))).status).toBe(404);
    const luna = (await catsOf(a))[1];
    expect((await json(await post(restore, { catId: luna.id }))).status).toBe(404);
  });
});

describe("bloodwork, explained", () => {
  const MAY = panel("05/12/2026", [["CREA", "1.6", "0.6", "2.4", "none"], ["SDMA", "12", "0", "14", "none"], ["PHOS", "4.9", "3.1", "7.5", "none"]]);
  const NOV = panel("11/10/2026", [["CREA", "2.6", "0.6", "2.4", "high"], ["SDMA", "16", "0", "14", "high"], ["PHOS", "5.0", "3.1", "7.5", "none"], ["Cystatin C", "0.9", "0.2", "1.0", "none"]]);

  it("two reports: saved for the cat on screen, explained, compared, with questions for the vet and in the vet report", async () => {
    reading = MAY;
    const first = await json(await upload({ [CAT_HEADER]: a.firstCat }));
    expect(first.status).toBe(200);
    reading = NOV;
    const second = await json(await upload({ [CAT_HEADER]: a.firstCat }));
    const p = (await explainPanel(a.client, second.body.panelId, "Milo", "2026-11-15"))!;
    expect([p.taken_on, p.previousOn, p.lab_name]).toEqual(["2026-11-10", "2026-05-12", "IDEXX"]);
    const all = p.groups.flatMap((g) => g.results);
    const crea = all.find((r) => r.test_code === "creatinine")!;
    expect([crea.position, crea.change?.direction, crea.change?.previousText, crea.about]).toEqual(["above", "up", "1.6", expect.stringContaining("kidneys filter")]);
    expect(all.find((r) => r.test_code === "phosphorus")!.change?.direction).toBe("same");
    expect(p.groups.at(-1)).toMatchObject({ group: "Not on our list" });
    expect(p.questions).toHaveLength(2);
    expect(p.questions[0]).toMatch(/^(Creatinine|SDMA) is above the lab's range and went from/);
    // The photo is kept privately (8a).
    const files = (await admin.storage.from("lab-photos").list(a.firstCat)).data ?? [];
    expect(files.length).toBe(2);
    // Listed newest first, and the vet report carries the newest panel.
    jar.set(CAT_COOKIE, a.firstCat);
    expect((await page(() => loadBloodwork(a.client)))!.panels.map((x) => [x.taken_on, x.outside])).toEqual([["2026-11-10", 2], ["2026-05-12", 0]]);
    const own = (await page(() => loadOwnReport(a.client)))!;
    expect(own.report.bloodwork?.id).toBe(second.body.panelId);
  });

  it("a photo that isn't a readable lab report saves nothing", async () => {
    const before = (await admin.from("lab_panels").select("id").eq("cat_id", a.firstCat)).data?.length;
    reading = { isLabReport: false, readable: "none", labName: "", reportDate: "", results: [] };
    const r = await json(await upload({ [CAT_HEADER]: a.firstCat }));
    expect([r.status, r.body.error]).toEqual([422, "unreadable"]);
    expect((await admin.from("lab_panels").select("id").eq("cat_id", a.firstCat)).data?.length).toBe(before);
    expect(((await admin.storage.from("lab-photos").list(a.firstCat)).data ?? []).length).toBe(2);
  });

  it("another member can't read, add to or delete her panels", async () => {
    const mine = (await admin.from("lab_panels").select("id").eq("cat_id", a.firstCat)).data!;
    actingAs = b.client;
    expect(await explainPanel(b.client, mine[0].id, "x", "2026-11-15")).toBeNull();
    reading = MAY;
    const r = await upload({ [CAT_HEADER]: a.firstCat });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await json(await post(deleteLab, { panelId: mine[0].id }))).status).toBe(404);
    expect((await admin.from("lab_panels").select("id").eq("cat_id", a.firstCat)).data?.length).toBe(mine.length);
  });

  it("delete removes the panel, its results and its photo", async () => {
    const [newest] = (await admin.from("lab_panels").select("id, photo_path").eq("cat_id", a.firstCat).order("taken_on", { ascending: false })).data!;
    expect((await json(await post(deleteLab, { panelId: newest.id }))).status).toBe(200);
    expect((await admin.from("lab_results").select("id").eq("panel_id", newest.id)).data).toEqual([]);
    const files = ((await admin.storage.from("lab-photos").list(a.firstCat)).data ?? []).map((f) => `${a.firstCat}/${f.name}`);
    expect(files).not.toContain(newest.photo_path);
  });

  it("the daily limit: report 11 today is refused before the model is called", async () => {
    const today = new Date().toISOString();
    const have = (await admin.from("lab_panels").select("id").eq("cat_id", a.firstCat).gte("created_at", new Date(Date.now() - 86400000 * 2).toISOString())).data!.length;
    const fill = Array.from({ length: LAB_PHOTO_DAILY_CAP - have }, () => ({ cat_id: a.firstCat, taken_on: "2026-01-01", readable: "full", created_at: today }));
    expect((await admin.from("lab_panels").insert(fill)).error).toBeNull();
    readerCalls = 0;
    reading = MAY;
    const r = await json(await upload({ [CAT_HEADER]: a.firstCat }));
    expect([r.status, r.body.error, readerCalls]).toEqual([429, "lab_cap", 0]);
  });
});
