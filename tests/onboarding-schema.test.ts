import { describe, expect, it } from "vitest";
import { catRow, onboardingSchema, weightInLb } from "../src/lib/onboarding";

const valid = {
  name: " Milo ",
  pronoun: "he",
  ageYears: 11,
  weight: 4.8,
  weightUnit: "kg",
  lives: "indoor",
  conditions: ["sensitive_stomach", "stiff_joints"],
  otherCondition: "",
  food: "mix",
  vetName: "Dr. Lane",
  vetPhone: "",
  remindByEmail: true,
  checkinTime: "08:00",
  timezone: "America/New_York",
};

describe("onboarding payload", () => {
  it("accepts a complete answer set and trims the name", () => {
    const r = onboardingSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Milo");
  });

  it("rejects a missing name", () => {
    expect(onboardingSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });

  it("rejects an unknown condition", () => {
    expect(onboardingSchema.safeParse({ ...valid, conditions: ["cancer"] }).success).toBe(false);
  });

  it("rejects an out-of-range age and a bad check-in time", () => {
    expect(onboardingSchema.safeParse({ ...valid, ageYears: 45 }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...valid, checkinTime: "03:00" }).success).toBe(false);
  });

  it("allows a skipped weight", () => {
    const r = onboardingSchema.parse({ ...valid, weight: null });
    expect(weightInLb(r)).toBeNull();
  });

  it("stores weight in pounds", () => {
    expect(weightInLb({ weight: 4.8, weightUnit: "kg" })).toBe(10.58);
    expect(weightInLb({ weight: 10.6, weightUnit: "lb" })).toBe(10.6);
  });

  it("builds the cat row: optional vet empty becomes null, other condition kept", () => {
    const o = onboardingSchema.parse({ ...valid, vetPhone: "", otherCondition: "Heart murmur" });
    const r = catRow(o, "user-1");
    expect(r).toMatchObject({ owner_id: "user-1", name: "Milo", age_years: 11, start_weight_lb: 10.58, vet_phone: null, vet_name: "Dr. Lane" });
    expect(r.conditions).toEqual(["sensitive_stomach", "stiff_joints", "other:Heart murmur"]);
  });
});
