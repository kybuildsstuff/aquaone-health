// Opt-in: the real photo model, end to end through photoLookup, with a throwaway member.
//   SAFE_LIVE=1 npx vitest run tests/safe-live.test.ts
// Optional: SAFE_LIVE_PHOTO=/path/to/plant.jpg SAFE_LIVE_EXPECT="Spider Plant" to try your own photo.
// Without SAFE_LIVE it reports NOT RUN (never a pass). It costs one model call per photo.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { getItem, photoLookup } from "../src/lib/safe.server";
import { anthropicIdentifier } from "../src/lib/safe-vision.server";

config({ path: ".env.local", quiet: true });
const LIVE = process.env.SAFE_LIVE === "1";
if (!LIVE) console.log("safe-live: NOT RUN (set SAFE_LIVE=1 to run it)");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const created: string[] = [];

describe.skipIf(!LIVE)("photo identification, live model", () => {
  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
    const left = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => created.includes(u.id)).length;
    console.log(`safe-live residue: users ${left}`);
    expect(left).toBe(0);
  });

  it("names the item in a photo and the answer comes from our list", async () => {
    const email = `safe-live-${randomUUID().slice(0, 8)}@test.invalid`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
    const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });

    const path = process.env.SAFE_LIVE_PHOTO ?? "tests/fixtures/safe/bleach-label.jpg";
    const expected = process.env.SAFE_LIVE_EXPECT ?? "Bleach";
    const mediaType = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const r = await photoLookup(client, { data: readFileSync(path).toString("base64"), mediaType }, anthropicIdentifier());
    if (!r.ok) throw new Error(r.error);
    console.log("model said:", JSON.stringify(r.data.identified));
    expect(r.data.identified.found).toBe(true);
    const item = r.data.itemId ? await getItem(client, r.data.itemId) : null;
    expect(item?.name).toBe(expected);
  }, 90_000);
});
