// Saves an onboarding answer set the way /api/onboarding does, as a real signed-in
// user against the real database, then reads it back. The user is deleted afterwards.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { catRow, onboardingSchema } from "../src/lib/onboarding";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const created: string[] = [];

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("onboarding save", () => {
  it("stores the cat and reminder settings, readable only by her", async () => {
    const email = `onb-${randomUUID().slice(0, 8)}@test.invalid`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
    const me = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await me.auth.signInWithPassword({ email, password })).error).toBeNull();

    const o = onboardingSchema.parse({
      name: "Milo", pronoun: "he", ageYears: 11, weight: 10.6, weightUnit: "lb", lives: "indoor",
      conditions: ["sensitive_stomach", "stiff_joints"], otherCondition: "Heart murmur", food: "mix",
      vetName: "Dr. Lane", vetPhone: "(555) 013-4471", remindByEmail: true, checkinTime: "19:00", timezone: "Australia/Brisbane",
    });

    const cat = await me.from("cats").insert(catRow(o, data.user.id)).select("*").single();
    expect(cat.error).toBeNull();
    expect(cat.data).toMatchObject({ name: "Milo", pronoun: "he", lives: "indoor", food: "mix", vet_name: "Dr. Lane" });
    expect(Number(cat.data!.age_years)).toBe(11);
    expect(Number(cat.data!.start_weight_lb)).toBe(10.6);
    expect(cat.data!.conditions).toEqual(["sensitive_stomach", "stiff_joints", "other:Heart murmur"]);

    const prefs = await me.from("reminder_prefs").upsert({
      user_id: data.user.id, by_email: true, by_text: false, checkin_time: "19:00", timezone: "Australia/Brisbane",
    }).select("*").single();
    expect(prefs.error).toBeNull();
    expect(prefs.data).toMatchObject({ by_email: true, by_text: false, checkin_time: "19:00:00", timezone: "Australia/Brisbane" });

    // Someone else's id is refused by row-level security.
    const sneaky = await me.from("cats").insert(catRow(o, randomUUID()));
    expect(sneaky.error).not.toBeNull();
  });
});
