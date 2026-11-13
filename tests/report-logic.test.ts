// The vet report's pure logic and its PDF: period filtering, the weight maths, red breathing
// readings staying on record, the "your vet" fallback, share-token shape, and that the PDF
// renderer makes a real PDF from any report (including names the PDF fonts can't draw).
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildReport, conditionLabels, pdfFileName, REPORT_DAYS, SHARE_TOKEN_PATTERN, weightChangePct, weightChangeLabel, type ReportInput } from "../src/lib/report";
import { hashShareToken, newShareToken } from "../src/lib/report.server";
import { renderReportPdf } from "../src/lib/report-pdf.server";
import { addDays } from "../src/lib/dates";

const TODAY = "2026-11-13";
const TZ = "America/New_York";
const cat: ReportInput["cat"] = {
  id: "c1", name: "Milo", pronoun: "he", age_years: "11.0", breed: "Tabby", lives: "indoor", food: "dry",
  conditions: ["kidney", "other:Heart murmur"], vet_name: null, vet_phone: null, start_weight_lb: "10.80",
};
const base = (over: Partial<ReportInput> = {}): ReportInput => ({ cat, tz: TZ, today: TODAY, checkIns: [], weighIns: [], breathing: [], alerts: [], ...over });
// Noon in New York on a local date (17:00 UTC in November).
const at = (date: string, hhmm = "17:00") => `${date}T${hhmm}:00Z`;

describe("period", () => {
  it("covers the last 30 local days, today included, and nothing outside it", () => {
    const from = addDays(TODAY, -(REPORT_DAYS - 1));
    const r = buildReport(base({
      checkIns: [
        { date: addDays(from, -1), drinking: "more" }, // the day before: out
        { date: from, drinking: "more" },
        { date: TODAY, drinking: "normal" },
        { date: addDays(TODAY, 1), drinking: "less" }, // tomorrow: out
      ],
      weighIns: [
        { date: addDays(from, -1), cat_lb: "12.00", created_at: at(addDays(from, -1)) },
        { date: from, cat_lb: "10.00", created_at: at(from) },
      ],
      breathing: [
        // 03:30 UTC on `from` is still the evening before in New York: out.
        { taken_at: `${from}T03:30:00Z`, breaths_per_min: 40 },
        { taken_at: at(from), breaths_per_min: 20 },
        // 02:00 UTC tomorrow is 9pm today in New York: in.
        { taken_at: `${addDays(TODAY, 1)}T02:00:00Z`, breaths_per_min: 24 },
      ],
    }));
    expect(r.period).toMatchObject({ from, to: TODAY, days: 30 });
    expect(r.drinking.days).toHaveLength(30);
    expect(r.drinking.days[0].date).toBe(from);
    expect(r.drinking.days.at(-1)!.date).toBe(TODAY);
    expect(r.drinking.counts).toEqual({ less: 0, normal: 1, more: 1 });
    expect(r.weight.points.map((p) => p.date)).toEqual([from]);
    expect(r.breathing.counts.map((b) => b.bpm)).toEqual([20, 24]);
    expect(r.breathing.counts.every((b) => b.date >= from && b.date <= TODAY)).toBe(true);
  });

  it("lists an alert open at any point in the period, and none closed before it", () => {
    const from = addDays(TODAY, -29);
    const r = buildReport(base({
      alerts: [
        { kind: "drinking_more", level: "amber", opened_at: at(addDays(from, -10)), resolved_at: at(addDays(from, -2)) }, // closed before: out
        { kind: "weight_down_5pct", level: "amber", opened_at: at(addDays(from, -10)), resolved_at: at(addDays(from, 3)) }, // spans the start: in
        { kind: "breathing_over_30", level: "red", opened_at: at(addDays(TODAY, -2)), resolved_at: null }, // still open: in
      ],
    }));
    expect(r.alerts.map((a) => [a.kind, a.resolvedOn])).toEqual([
      ["weight_down_5pct", addDays(from, 3)],
      ["breathing_over_30", null],
    ]);
  });
});

describe("weight", () => {
  it("percent change is (last - first) / first, one decimal, first and last by date", () => {
    expect(weightChangePct(10, 9.5)).toBe(-5);
    expect(weightChangePct(10.6, 10)).toBe(-5.7);
    expect(weightChangePct(8, 8.4)).toBe(5);
    expect(weightChangePct(0, 8)).toBeNull();
    const r = buildReport(base({
      weighIns: [
        { date: addDays(TODAY, -2), cat_lb: "9.50", created_at: at(addDays(TODAY, -2)) },
        { date: addDays(TODAY, -20), cat_lb: "10.00", created_at: at(addDays(TODAY, -20)) },
        { date: addDays(TODAY, -10), cat_lb: "9.80", created_at: at(addDays(TODAY, -10)) },
      ],
    }));
    expect(r.weight.points.map((p) => p.lb)).toEqual([10, 9.8, 9.5]);
    expect(r.weight.changePct).toBe(-5);
    expect(r.weight.latestLb).toBe(9.5);
    expect(r.weight.label).toBe("Down 5%");
  });

  it("one weigh-in has no change; small wobbles read as steady", () => {
    const one = buildReport(base({ weighIns: [{ date: TODAY, cat_lb: 10, created_at: at(TODAY) }] }));
    expect([one.weight.changePct, one.weight.label]).toEqual([null, "One weigh-in so far"]);
    expect(weightChangeLabel(0.4)).toBe("Steady");
    expect(buildReport(base()).weight.label).toBe("No weigh-ins");
  });
});

describe("breathing", () => {
  it("a red reading stays on the report after a normal recount (Ky's ruling, 13 Nov)", () => {
    const r = buildReport(base({
      breathing: [
        { taken_at: at(addDays(TODAY, -3), "17:00"), breaths_per_min: 34 },
        { taken_at: at(addDays(TODAY, -3), "17:05"), breaths_per_min: 22 },
      ],
    }));
    expect(r.breathing.latest?.bpm).toBe(22);
    expect(r.breathing.red.map((b) => b.bpm)).toEqual([34]);
    expect(r.breathing.counts.map((b) => [b.bpm, b.red])).toEqual([[34, true], [22, false]]);
  });

  it("exactly 30 is not red (the rule is over 30)", () => {
    const r = buildReport(base({ breathing: [{ taken_at: at(TODAY), breaths_per_min: 30 }] }));
    expect(r.breathing.red).toEqual([]);
  });
});

describe("profile", () => {
  it('says "your vet" when none is saved, and the saved name when there is one', () => {
    expect(buildReport(base()).cat).toMatchObject({ vet: "your vet", vetSaved: false });
    expect(buildReport(base({ cat: { ...cat, vet_name: "  " } })).cat.vet).toBe("your vet");
    expect(buildReport(base({ cat: { ...cat, vet_name: "Dr. Lane", vet_phone: "555 0100" } })).cat).toMatchObject({ vet: "Dr. Lane", vetSaved: true, vetPhone: "555 0100" });
  });

  it("names conditions in words, including her own 'other' one", () => {
    expect(conditionLabels(["kidney", "other:Heart murmur", "unknown_id"])).toEqual(["Kidney issues", "Heart murmur", "unknown_id"]);
  });
});

describe("share tokens", () => {
  it("are 43 base64url characters (256 bits), never repeat, and hash to 64 hex", () => {
    const tokens = Array.from({ length: 200 }, newShareToken);
    expect(new Set(tokens).size).toBe(200);
    for (const t of tokens) expect(t).toMatch(SHARE_TOKEN_PATTERN);
    expect(hashShareToken(tokens[0])).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(tokens[0])).not.toBe(hashShareToken(tokens[1]));
  });
});

describe("PDF", () => {
  const full = base({
    cat: { ...cat, vet_name: "Dr. Lane", vet_phone: "555 0100" },
    checkIns: Array.from({ length: 30 }, (_, i) => ({ date: addDays(TODAY, -i), drinking: (["normal", "more", "less"] as const)[i % 3] })),
    weighIns: Array.from({ length: 5 }, (_, i) => ({ date: addDays(TODAY, -i * 6), cat_lb: 10 - i * 0.1, created_at: at(addDays(TODAY, -i * 6)) })),
    breathing: Array.from({ length: 40 }, (_, i) => ({ taken_at: at(addDays(TODAY, -(i % 29))), breaths_per_min: i === 5 ? 36 : 18 + (i % 8) })),
    alerts: [{ kind: "breathing_over_30", level: "red", opened_at: at(addDays(TODAY, -5)), resolved_at: at(addDays(TODAY, -5)) }],
  });

  it("renders a real PDF of one or two pages for a busy month", async () => {
    const bytes = await renderReportPdf(buildReport(full), TODAY);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getPageCount()).toBeLessThanOrEqual(2);
    expect(doc.getTitle()).toBe("Milo's vet report");
  });

  it("renders an empty first month, and a name the PDF fonts can't draw, without failing", async () => {
    const bytes = await renderReportPdf(buildReport(base({ cat: { ...cat, name: "小虎 🐱 Zoë" } })), TODAY);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("gives the file a safe name", () => {
    expect(pdfFileName("Milo")).toBe("Milo-vet-report.pdf");
    expect(pdfFileName("Zoë & Bean")).toBe("Zoe-Bean-vet-report.pdf");
    expect(pdfFileName("小虎")).toBe("cat-vet-report.pdf");
  });
});
