import { describe, expect, it } from "vitest";
import { actionErrorMessage, breathsPerMinute, planAlertSync, toKwStatus, weighInPounds, weighInSchema } from "../src/lib/kidney-watch";
import { addDays, localDate, relativeDay, safeTimezone, streakDays } from "../src/lib/dates";
import { telHref, vetLabel } from "../src/lib/cat";

describe("alert sync", () => {
  it("opens an alert for each newly firing rule, at its level", () => {
    expect(planAlertSync(["drinking_more", "breathing_over_30"], [])).toEqual({
      toOpen: [{ kind: "drinking_more", level: "amber" }, { kind: "breathing_over_30", level: "red" }],
      toResolve: [],
    });
  });
  it("keeps an alert open while its rule still fires, and resolves it when the rule stops", () => {
    const open = [{ id: "a1", kind: "drinking_more" }, { id: "a2", kind: "weight_down_5pct" }];
    expect(planAlertSync(["drinking_more"], open)).toEqual({ toOpen: [], toResolve: ["a2"] });
    expect(planAlertSync([], open)).toEqual({ toOpen: [], toResolve: ["a1", "a2"] });
  });
  it("normalises the database row (numerics arrive as strings)", () => {
    const s = toKwStatus({ status: "amber", reasons: ["weight_down_5pct", "unknown"], checkins_total: "9", more_in_last_7: 1, less_in_last_7: 0, weight_change_pct: "-5.7", latest_breaths: null });
    expect(s).toMatchObject({ status: "amber", reasons: ["weight_down_5pct"], checkins_total: 9, weight_change_pct: -5.7, latest_breaths: null });
  });
});

describe("weigh-in maths", () => {
  it("the cat's weight is the difference of the two readings, stored in pounds", () => {
    expect(weighInPounds({ ownerWeight: 142.4, withCatWeight: 153.0, unit: "lb" })).toEqual({ ok: true, ownerLb: 142.4, withCatLb: 153, catLb: 10.6 });
    const kg = weighInPounds({ ownerWeight: 64.6, withCatWeight: 69.4, unit: "kg" });
    expect(kg.ok && kg.catLb).toBeCloseTo(10.58, 1);
  });
  it("refuses a second reading that isn't heavier, and an impossible cat weight", () => {
    expect(weighInPounds({ ownerWeight: 150, withCatWeight: 150, unit: "lb" })).toEqual({ ok: false, error: "not_heavier" });
    expect(weighInPounds({ ownerWeight: 150, withCatWeight: 150.2, unit: "lb" })).toEqual({ ok: false, error: "cat_weight_out_of_range" });
    expect(weighInPounds({ ownerWeight: 100, withCatWeight: 160, unit: "lb" })).toEqual({ ok: false, error: "cat_weight_out_of_range" });
  });
  it("rejects missing or negative readings at the schema", () => {
    expect(weighInSchema.safeParse({ ownerWeight: -1, withCatWeight: 10, unit: "lb" }).success).toBe(false);
    expect(weighInSchema.safeParse({ ownerWeight: 140, unit: "lb" }).success).toBe(false);
  });
  it("breathing: 30 seconds of taps doubles to breaths a minute", () => {
    expect(breathsPerMinute(11)).toBe(22);
    expect(breathsPerMinute(16)).toBe(32);
  });
});

describe("dates and streak", () => {
  it("today is her local day, not the server's", () => {
    const at = new Date("2026-11-17T20:00:00Z");
    expect(localDate("America/New_York", at)).toBe("2026-11-17");
    expect(localDate("Asia/Makassar", at)).toBe("2026-11-18");
    expect(safeTimezone("Not/AZone")).toBe("America/New_York");
  });
  it("counts consecutive active days ending today, or yesterday before today's check-in", () => {
    const today = "2026-11-20";
    expect(streakDays([today, addDays(today, -1), addDays(today, -2), addDays(today, -4)], today)).toBe(3);
    expect(streakDays([addDays(today, -1), addDays(today, -2)], today)).toBe(2);
    expect(streakDays([addDays(today, -3)], today)).toBe(0);
    expect(relativeDay(addDays(today, -3), today)).toBe("3 days ago");
  });
});

describe("words", () => {
  it("says 'your vet' when no vet is saved, and only dials a real number", () => {
    expect(vetLabel(null)).toBe("your vet");
    expect(vetLabel("  ")).toBe("your vet");
    expect(vetLabel("Dr. Lane")).toBe("Dr. Lane");
    expect(telHref("(555) 013-4471")).toBe("tel:5550134471");
    expect(telHref("")).toBeNull();
  });
  it("blames the connection only when the request never reached us", () => {
    expect(actionErrorMessage(null)).toMatch(/connection/);
    for (const s of [400, 401, 403, 409, 500]) expect(actionErrorMessage(s)).not.toMatch(/connection/);
    expect(actionErrorMessage(400, "not_heavier")).toMatch(/heavier/);
  });
});
