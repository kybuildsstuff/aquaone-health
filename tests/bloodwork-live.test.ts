// Bloodwork, explained, with the REAL model reading real-looking lab report photos. Opt-in:
// BLOODWORK_LIVE=1 (costs a few model calls). Proves the model copies values, ranges and the
// lab's own H/L flags exactly, says when a photo isn't a lab report, and that our code then
// builds the change and the vet questions from what it read.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { changeSince, monthLabel, vetQuestions } from "../src/lib/bloodwork";

config({ path: ".env.local", quiet: true });
const LIVE = process.env.BLOODWORK_LIVE === "1";
const { anthropicLabReader } = await import("../src/lib/bloodwork-vision.server");
const { rowsFromReading, panelDate } = await import("../src/lib/bloodwork.server");
const read = (file: string, mediaType: "image/png" | "image/jpeg" = "image/png") => anthropicLabReader()({ data: readFileSync(file).toString("base64"), mediaType });

describe.skipIf(!LIVE)("bloodwork: the real model reads a lab report", () => {
  it("copies every row of two panels, with ranges and the lab's flags, then our code explains the change", async () => {
    const [may, nov] = await Promise.all([read("tests/fixtures/bloodwork/lab-may.png"), read("tests/fixtures/bloodwork/lab-nov.png")]);
    for (const r of [may, nov]) expect([r.isLabReport, r.readable]).toEqual([true, "full"]);
    expect(panelDate(nov.reportDate, "2026-11-15")).toEqual({ taken_on: "2026-11-10", date_from_report: true });
    const mayRows = rowsFromReading(may);
    const novRows = rowsFromReading(nov);
    expect(mayRows).toHaveLength(8);
    expect(novRows).toHaveLength(9);
    const crea = novRows.find((r) => r.test_code === "creatinine")!;
    expect(crea).toMatchObject({ value: 2.6, ref_low: 0.6, ref_high: 2.4, lab_flag: "high" });
    expect(novRows.find((r) => r.test_code === "sdma")).toMatchObject({ value: 16, lab_flag: "high" });
    expect(novRows.find((r) => r.test_code === "phosphorus")).toMatchObject({ value: 5.2, lab_flag: null });
    expect(novRows.find((r) => r.name.toLowerCase().includes("cystatin"))).toMatchObject({ test_code: null, value: 0.9 });
    // Nothing identifying is copied.
    expect(JSON.stringify(nov)).not.toMatch(/Test Owner|88123456/);

    const since = monthLabel(panelDate(may.reportDate, "2026-11-15").taken_on, "2026-11-15");
    const prev = new Map(mayRows.map((r) => [r.test_code ?? r.name, r]));
    const withChange = novRows.map((r) => ({ ...r, change: changeSince(r.value, prev.get(r.test_code ?? r.name), since) }));
    const qs = vetQuestions(withChange, "Milo");
    expect(qs[0]).toMatch(/^(SDMA|Creatinine|BUN \(urea\)) is above the lab's range and went from/);
    expect(qs.length).toBe(3);
  }, 180_000);

  it("a photo that isn't a lab report is said so (nothing would be saved)", async () => {
    const r = await read("tests/fixtures/safe/label-salt.jpg", "image/jpeg");
    expect(r.isLabReport).toBe(false);
  }, 90_000);
});
