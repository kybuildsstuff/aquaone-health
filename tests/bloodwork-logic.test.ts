// Bloodwork, explained: our own logic, no model and no database.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { TESTS, changeSince, changeText, matchTest, monthLabel, parseNumber, position, vetQuestions, type ResultRow } from "../src/lib/bloodwork";
const { panelDate, rowsFromReading } = await import("../src/lib/bloodwork.server");

const row = (o: Partial<ResultRow>): ResultRow => ({ name: "CREA", test_code: "creatinine", value: 1.9, value_text: "1.9", unit: "mg/dL", ref_low: 0.8, ref_high: 2.4, lab_flag: null, ...o });

describe("matching printed names to our tests", () => {
  it.each([
    ["CREA", "creatinine"], ["Creatinine", "creatinine"], ["SDMA (IDEXX)", "sdma"], ["IDEXX SDMA", "sdma"], ["BUN", "bun"], ["Urea", "bun"],
    ["PHOS", "phosphorus"], ["ALT (SGPT)", "alt"], ["ALKP", "alp"], ["Alanine aminotransferase (ALT)", "alt"], ["TT4", "t4"], ["Total T4", "t4"],
    ["HCT", "hct"], ["PCV", "hct"], ["GLU", "glucose"], ["K+", "potassium"], ["USG", "usg"], ["UPC", "upc"], ["BUN:Creatinine Ratio", "bun_creatinine_ratio"],
  ])("%s → %s", (printed, code) => expect(matchTest(printed)?.code).toBe(code));

  it("an unusual test is not on our list (never a made-up explanation)", () => {
    for (const n of ["Cystatin C", "Lipase (Spec fPL)", "Anion gap"]) expect(matchTest(n)).toBeNull();
  });

  it("every explanation we wrote stays inside the claims rules", () => {
    const banned = /\b(disease|failure|diagnos|stage|iris|cancer|diabet|hyperthyroid|kidney failure|ckd|treat|cure|medicat|prescri|normal for)\b/i;
    for (const t of TESTS) expect(t.about, t.code).not.toMatch(banned);
    expect(TESTS.length).toBeGreaterThanOrEqual(25);
  });
});

describe("numbers, ranges and change", () => {
  it("reads numbers as printed", () => {
    expect([parseNumber("1.9"), parseNumber("1,234"), parseNumber("Negative"), parseNumber("")]).toEqual([1.9, 1234, null, null]);
  });
  it("the lab's own flag wins; otherwise the printed range decides", () => {
    expect(position(row({ value: 2.0, lab_flag: "high" }))).toBe("above");
    expect(position(row({ value: 3.1 }))).toBe("above");
    expect(position(row({ value: 0.5 }))).toBe("below");
    expect(position(row({ value: 1.2 }))).toBe("within");
    expect(position(row({ ref_low: null, ref_high: null }))).toBeNull();
  });
  it("change since the last panel: up, down, or the same within 5%", () => {
    expect(changeText(changeSince(1.9, { value: 1.6, value_text: "1.6" }, "May")!)).toBe("up from 1.6 in May");
    expect(changeText(changeSince(1.4, { value: 1.6, value_text: "1.6" }, "May")!)).toBe("down from 1.6 in May");
    expect(changeText(changeSince(14, { value: 14.4, value_text: "14.4" }, "May")!)).toBe("same as May");
    expect(changeSince(1.9, undefined, "May")).toBeNull();
  });
  it("month labels add the year once it's nearly a year ago", () => {
    expect(monthLabel("2026-05-12", "2026-11-15")).toBe("May");
    expect(monthLabel("2025-10-01", "2026-11-15")).toBe("October 2025");
  });
});

describe("questions for the vet (7a)", () => {
  const ch = (prev: number, value: number) => changeSince(value, { value: prev, value_text: String(prev) }, "May");
  it("flagged results first, then the biggest moves, at most three, each naming a real value", () => {
    const qs = vetQuestions(
      [
        { ...row({ name: "CREA", test_code: "creatinine", value: 2.6, value_text: "2.6", lab_flag: "high" }), change: ch(1.6, 2.6) },
        { ...row({ name: "PHOS", test_code: "phosphorus", value: 7.1, value_text: "7.1", lab_flag: "high", ref_high: 6.8 }), change: null },
        { ...row({ name: "SDMA", test_code: "sdma", value: 13, value_text: "13", ref_high: 14 }), change: ch(10, 13) },
        { ...row({ name: "ALT", test_code: "alt", value: 60, value_text: "60", ref_high: 100 }), change: ch(40, 60) },
        { ...row({ name: "GLU", test_code: "glucose", value: 101, value_text: "101", ref_high: 160 }), change: ch(100, 101) },
      ],
      "Milo",
    );
    expect(qs).toHaveLength(3);
    expect(qs[0]).toBe("Creatinine is above the lab's range and went from 1.6 to 2.6 since May. Should we recheck it, and when?");
    expect(qs[1]).toBe("Phosphorus is above the lab's range. What does that mean for Milo, and should anything change?");
    expect(qs[2]).toContain("ALT went from 40 to 60 since May");
    for (const q of qs) expect(q).not.toMatch(/\b(disease|failure|stage|diagnos|treat)\b/i);
  });
  it("nothing flagged and nothing moved: no questions", () => {
    expect(vetQuestions([{ ...row({}), change: ch(1.9, 1.9) }], "Milo")).toEqual([]);
  });
});

describe("what the model read, as our rows", () => {
  it("drops empty rows, keeps the printed text, never trusts a '<' value as a number", () => {
    const rows = rowsFromReading({
      isLabReport: true, readable: "full", labName: "IDEXX", reportDate: "2026-05-12",
      results: [
        { name: "CREA", value: "2.6", unit: "mg/dL", refLow: "0.8", refHigh: "2.4", flag: "high" },
        { name: "TBIL", value: "<0.1", unit: "mg/dL", refLow: "0.0", refHigh: "0.4", flag: "none" },
        { name: "", value: "5", unit: "", refLow: "", refHigh: "", flag: "none" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ test_code: "creatinine", value: 2.6, ref_high: 2.4, lab_flag: "high" });
    expect(rows[1]).toMatchObject({ test_code: "bilirubin", value: null, value_text: "<0.1", lab_flag: null });
  });
  it("uses the report's date only when it's a real past date", () => {
    expect(panelDate("2026-05-12", "2026-11-15")).toEqual({ taken_on: "2026-05-12", date_from_report: true });
    expect(panelDate("2027-01-01", "2026-11-15")).toEqual({ taken_on: "2026-11-15", date_from_report: false });
    expect(panelDate("", "2026-11-15").date_from_report).toBe(false);
    expect(panelDate("11/10/2026", "2026-11-15")).toEqual({ taken_on: "2026-11-10", date_from_report: true }); // US month first
    expect(panelDate("10 Nov 2026", "2026-11-15").taken_on).toBe("2026-11-10");
    expect(panelDate("Nov 10, 2026", "2026-11-15").taken_on).toBe("2026-11-10");
    expect(panelDate("12/05/2026", "2026-11-15").date_from_report).toBe(false); // read as 5 Dec: future, so today
    expect(panelDate("02/30/2026", "2026-11-15").date_from_report).toBe(false); // not a real date
  });
});
