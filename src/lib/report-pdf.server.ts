import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BREATHING_NORMAL, DISCLAIMER, breathingSub, dayLabel, drinkingSub, profileLine, type Report } from "@/lib/report";

// The vet report as a US Letter PDF, drawn with pdf-lib (pure JavaScript: no browser, no
// native modules, no font files on disk, so it runs on Vercel's Node runtime as-is).
// Same data as the screen; one page for a typical month, a second when there is more.

const W = 612;
const H = 792;
const M = 48;
const NAVY = rgb(7 / 255, 29 / 255, 60 / 255);
const SLATE = rgb(91 / 255, 100 / 255, 120 / 255);
const MUTED = rgb(138 / 255, 147 / 255, 168 / 255);
const BLUE = rgb(83 / 255, 105 / 255, 238 / 255);
const LILAC = rgb(201 / 255, 209 / 255, 251 / 255);
const LINE = rgb(228 / 255, 226 / 255, 222 / 255);
const PAPER = rgb(249 / 255, 248 / 255, 247 / 255);
const RED = rgb(180 / 255, 35 / 255, 58 / 255);
const GREEN = rgb(31 / 255, 157 / 255, 107 / 255);
const BAND = rgb(201 / 255, 240 / 255, 222 / 255);
const LIST_LIMIT = 12;

export async function renderReportPdf(r: Report, generatedOn: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${r.cat.name}'s vet report`);
  doc.setAuthor("AquaOne Health");
  doc.setCreator("AquaOne Health");
  doc.setProducer("AquaOne Health");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // The standard fonts only cover Latin text (WinAnsi); anything else becomes "?" instead of failing.
  const ok = new Map<string, boolean>();
  const clean = (s: string) =>
    Array.from(s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'))
      .map((ch) => {
        if (!ok.has(ch)) {
          try {
            regular.encodeText(ch);
            ok.set(ch, true);
          } catch {
            ok.set(ch, false);
          }
        }
        return ok.get(ch) ? ch : "?";
      })
      .join("");

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (space: number) => {
    if (y - space < M + 28) newPage();
  };
  const text = (s: string, x: number, at: number, size: number, font: PDFFont = regular, color = NAVY) =>
    page.drawText(clean(s), { x, y: at, size, font, color });
  const width = (s: string, size: number, font: PDFFont = regular) => font.widthOfTextAtSize(clean(s), size);
  const wrap = (s: string, size: number, maxW: number, font: PDFFont = regular) => {
    const lines: string[] = [];
    let line = "";
    for (const word of clean(s).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxW) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const heading = (s: string) => {
    ensure(72); // a heading never sits alone at the foot of a page
    y -= 26;
    text(s.toUpperCase(), M, y, 9, bold, SLATE);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: LINE });
    y -= 16;
  };
  const row = (left: string, right: string, opts: { color?: typeof NAVY; bold?: boolean } = {}) => {
    ensure(16);
    text(left, M, y, 10, opts.bold ? bold : regular, opts.color ?? NAVY);
    text(right, W - M - width(right, 10), y, 10, regular, opts.color ?? SLATE);
    y -= 15;
  };
  const para = (s: string, size = 10, color = SLATE) => {
    for (const l of wrap(s, size, W - 2 * M)) {
      ensure(size + 5);
      text(l, M, y, size, regular, color);
      y -= size + 4;
    }
  };

  // Header ----------------------------------------------------------------------------
  text("AQUAONE HEALTH  ·  VET REPORT", M, y - 9, 9, bold, BLUE);
  text(`Made ${dayLabel(generatedOn, true)}`, W - M - width(`Made ${dayLabel(generatedOn, true)}`, 9), y - 9, 9, regular, MUTED);
  y -= 40;
  text(`${r.cat.name}'s vet report`, M, y, 24, bold);
  y -= 20;
  text(`${profileLine(r)}  ·  ${r.period.label}  ·  ${r.drinking.checkIns} days of check-ins`, M, y, 10.5, regular, SLATE);
  y -= 15;
  text(`For ${r.cat.vet}${r.cat.vetPhone ? `  ·  ${r.cat.vetPhone}` : ""}`, M, y, 10.5, regular, SLATE);
  y -= 22;

  // Summary tiles ----------------------------------------------------------------------
  const tiles = [
    ["Drinking", r.drinking.label, drinkingSub(r)],
    ["Weight", r.weight.latestLb != null ? `${r.weight.latestLb.toFixed(1)} lb` : "Not weighed", r.weight.label],
    ["Breathing", r.breathing.latest ? `${r.breathing.latest.bpm}/min` : "Not counted", breathingSub(r)],
  ];
  const gap = 10;
  const tw = (W - 2 * M - 2 * gap) / 3;
  tiles.forEach(([label, value, sub], i) => {
    const x = M + i * (tw + gap);
    page.drawRectangle({ x, y: y - 62, width: tw, height: 62, color: PAPER, borderColor: LINE, borderWidth: 0.5 });
    text(label, x + 10, y - 16, 9, bold, SLATE);
    text(value, x + 10, y - 34, 14, bold, i === 2 && r.breathing.latest?.red ? RED : NAVY);
    text(wrap(sub, 8.5, tw - 20)[0] ?? "", x + 10, y - 50, 8.5, regular, SLATE);
  });
  y -= 62;

  // Drinking ---------------------------------------------------------------------------
  heading(`Drinking · daily check-ins (${r.drinking.checkIns} of ${r.period.days} days)`);
  ensure(40);
  const step = (W - 2 * M) / r.drinking.days.length;
  r.drinking.days.forEach((d, i) => {
    const cx = M + step * i + step / 2;
    const color = d.drinking === "more" ? BLUE : d.drinking === "less" ? NAVY : d.drinking === "normal" ? LILAC : undefined;
    if (color) page.drawCircle({ x: cx, y: y - 4, size: Math.min(5, step / 2 - 1), color });
    else page.drawCircle({ x: cx, y: y - 4, size: Math.min(5, step / 2 - 1), borderColor: LINE, borderWidth: 1 });
  });
  y -= 22;
  text(dayLabel(r.period.from), M, y, 8, regular, MUTED);
  text(dayLabel(r.period.to), W - M - width(dayLabel(r.period.to), 8), y, 8, regular, MUTED);
  const legend = `Normal ${r.drinking.counts.normal}   ·   More ${r.drinking.counts.more}   ·   Less ${r.drinking.counts.less}   ·   Missed ${r.period.days - r.drinking.checkIns}`;
  text(legend, (W - width(legend, 8.5)) / 2, y, 8.5, regular, SLATE);
  y -= 8;

  // Weight -----------------------------------------------------------------------------
  heading("Weight · two-step weigh-ins on a home scale");
  if (!r.weight.points.length) para("No weigh-ins in this period.");
  else {
    if (r.weight.changePct != null && r.weight.since) {
      row(`Change since ${dayLabel(r.weight.since)}`, `${r.weight.changePct > 0 ? "+" : ""}${r.weight.changePct}%`, { bold: true, color: r.weight.changePct <= -5 ? RED : NAVY });
    }
    const pts = r.weight.points.slice(-LIST_LIMIT);
    for (const p of pts) row(dayLabel(p.date, true), `${p.lb.toFixed(2)} lb`);
    if (r.weight.points.length > pts.length) para(`Showing the latest ${pts.length} of ${r.weight.points.length} weigh-ins.`, 8.5, MUTED);
  }
  if (r.cat.startEstimateLb != null) para(`Owner's estimate at sign-up: ${r.cat.startEstimateLb.toFixed(1)} lb (not weighed).`, 8.5, MUTED);

  // Breathing --------------------------------------------------------------------------
  heading(`Breathing · sleeping breaths a minute (normal ${BREATHING_NORMAL.low}–${BREATHING_NORMAL.high})`);
  const counts = r.breathing.counts;
  if (!counts.length) para("No breathing counts in this period.");
  else {
    // A small chart with the normal band shaded; red dots are over 30.
    ensure(80);
    const ch = 60;
    const top = 60;
    const yOf = (bpm: number) => y - ch + (Math.min(bpm, top) / top) * ch;
    page.drawRectangle({ x: M, y: y - ch, width: W - 2 * M, height: ch, color: PAPER });
    page.drawRectangle({ x: M, y: yOf(BREATHING_NORMAL.low), width: W - 2 * M, height: yOf(BREATHING_NORMAL.high) - yOf(BREATHING_NORMAL.low), color: BAND });
    text(String(BREATHING_NORMAL.high), M - 14, yOf(BREATHING_NORMAL.high) - 3, 7, regular, MUTED);
    text(String(BREATHING_NORMAL.low), M - 14, yOf(BREATHING_NORMAL.low) - 3, 7, regular, MUTED);
    const span = counts.length > 1 ? (W - 2 * M - 16) / (counts.length - 1) : 0;
    counts.forEach((c, i) => {
      page.drawCircle({ x: M + 8 + span * i + (counts.length === 1 ? (W - 2 * M - 16) / 2 : 0), y: yOf(c.bpm), size: 3, color: c.red ? RED : GREEN });
    });
    y -= ch + 16;

    if (r.breathing.red.length) {
      ensure(30);
      text(`Over 30 at rest (${r.breathing.red.length}) — kept on record even when a later recount was normal`, M, y, 9.5, bold, RED);
      y -= 15;
      for (const c of r.breathing.red) row(`${dayLabel(c.date, true)}, ${c.time}`, `${c.bpm}/min`, { color: RED });
      y -= 4;
    }
    const shown = counts.slice(-LIST_LIMIT);
    ensure(20);
    text("All counts", M, y, 9.5, bold, NAVY);
    y -= 15;
    for (const c of [...shown].reverse()) row(`${dayLabel(c.date, true)}, ${c.time}`, `${c.bpm}/min${c.red ? "  (over 30)" : ""}`, c.red ? { color: RED } : {});
    if (counts.length > shown.length) para(`Showing the latest ${shown.length} of ${counts.length} counts (range ${r.breathing.min}–${r.breathing.max}). Every count over 30 is listed above.`, 8.5, MUTED);
  }

  // Alerts -----------------------------------------------------------------------------
  heading("Kidney Watch alerts in this period");
  if (!r.alerts.length) para("No Kidney Watch alerts in this period.");
  for (const a of r.alerts) {
    row(`${a.level === "red" ? "Red" : "Amber"} · ${a.title}`, `opened ${dayLabel(a.openedOn)}, ${a.resolvedOn ? `cleared ${dayLabel(a.resolvedOn)}` : "still open"}`, {
      color: a.level === "red" ? RED : NAVY,
    });
  }
  para("Kidney Watch flags 4 or more of the last 7 check-ins drinking more (or less), weight down 5% or more against 4 weeks earlier, and a sleeping breathing count over 30.", 8.5, MUTED);

  // Profile ----------------------------------------------------------------------------
  heading("Profile");
  row("Conditions", r.cat.conditions.length ? r.cat.conditions.join(", ") : "None noted");
  if (r.cat.food) row("Food", r.cat.food);
  if (r.cat.lives) row("Lives", r.cat.lives);
  row("Vet", r.cat.vetSaved ? `${r.cat.vet}${r.cat.vetPhone ? `, ${r.cat.vetPhone}` : ""}` : "Not saved");

  // Footer on every page ---------------------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M }, end: { x: W - M, y: M }, thickness: 0.5, color: LINE });
    p.drawText(clean(`${DISCLAIMER} Owner-recorded at home with AquaOne Health.`), { x: M, y: M - 14, size: 8.5, font: bold, color: SLATE });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: W - M - regular.widthOfTextAtSize(n, 8.5), y: M - 14, size: 8.5, font: regular, color: MUTED });
  });

  return doc.save();
}
