import { describe, expect, it } from "vitest";
import { membershipAllows, normaliseEmail, type MemberRow } from "../src/lib/membership";

const now = new Date("2026-11-20T12:00:00Z");
const row = (over: Partial<NonNullable<MemberRow>>): MemberRow => ({ status: "trial", paid_through: null, trial_ends_at: null, ...over });

describe("membership gate", () => {
  it("lets trial and active members in", () => {
    expect(membershipAllows(row({ status: "trial" }), now)).toEqual({ allowed: true });
    expect(membershipAllows(row({ status: "active", paid_through: "2026-12-01T00:00:00Z" }), now)).toEqual({ allowed: true });
  });

  it("refuses an unknown email", () => {
    expect(membershipAllows(null, now)).toEqual({ allowed: false, reason: "not_found" });
  });

  it("keeps a cancelled member in until the paid-through date", () => {
    expect(membershipAllows(row({ status: "cancelled", paid_through: "2026-11-25T00:00:00Z" }), now).allowed).toBe(true);
  });

  it("locks a cancelled member out after the paid-through date", () => {
    expect(membershipAllows(row({ status: "cancelled", paid_through: "2026-11-19T00:00:00Z" }), now)).toEqual({ allowed: false, reason: "ended" });
  });

  it("keeps a member who cancelled during the free month in until it ends", () => {
    expect(membershipAllows(row({ status: "cancelled", trial_ends_at: "2026-12-16T00:00:00Z" }), now).allowed).toBe(true);
    expect(membershipAllows(row({ status: "cancelled", trial_ends_at: "2026-11-01T00:00:00Z" }), now).allowed).toBe(false);
  });

  it("refuses a cancelled member with no dates", () => {
    expect(membershipAllows(row({ status: "cancelled" }), now).allowed).toBe(false);
  });

  it("refuses ended and past-due members", () => {
    expect(membershipAllows(row({ status: "ended", paid_through: "2026-12-31T00:00:00Z" }), now)).toEqual({ allowed: false, reason: "ended" });
    expect(membershipAllows(row({ status: "past_due" }), now)).toEqual({ allowed: false, reason: "past_due" });
  });

  it("normalises emails", () => {
    expect(normaliseEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });
});
