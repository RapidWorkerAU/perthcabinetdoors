// THE CUTTING PLAN AS PAPER: ONE BOARD A PAGE, FOR THE PANEL SAW.
//
// Same brand, fonts and page furniture as the production sheet, drawn by the
// same writer. Everything on a page is for the person at the saw:
//
//   LEFT    the board to scale. Panels with their number and cut size, the trim
//           shaded round the edge, usable offcuts outlined and sized, waste
//           shaded, and the strip cuts drawn and numbered at the edge.
//   RIGHT   what this board is and how it is set up, then every cut in the
//           order to make it, then every panel on it with its order size.
//
// A board whose list will not fit carries on over a second page. Anything that
// needs checking before the first cut (a panel too big for its board, a board
// size nobody has confirmed, tape nobody recorded) goes on a last page.
//
// The PDF fonts are ASCII only, so sizes are written with a letter x.

import { PDF_LAYOUT, PdfDocument, drawFooter, drawHeader, loadLogo, textWidth } from "./pcd-cabinet-pdf.js";
import { mm, panelLabel } from "./pcd-cutting-plan.js";

const { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, CONTENT_TOP, FOOTER_HEIGHT, STROKE, MUTED, LINE } = PDF_LAYOUT;
const FOOTER_TOP = PAGE_HEIGHT - FOOTER_HEIGHT;

const BRAND = [0.11, 0.169, 0.118];
const PANEL_FILL = [0.929, 0.957, 0.922];
const OFFCUT_FILL = [1, 0.965, 0.847];
const OFFCUT_STROKE = [0.62, 0.45, 0.03];
const WASTE_FILL = [0.878, 0.871, 0.847];
const CUT_COLOUR = [0.78, 0.29, 0.04];
const WHITE = [1, 1, 1];

const SIDE_X = 596;
const SIDE_W = PAGE_WIDTH - MARGIN - SIDE_X;
const LINE_H = 10.5;
const SIDE_LIST_TOP = CONTENT_TOP + 104;
const CONT_LIST_TOP = CONTENT_TOP + 34;
const LIST_BOTTOM = FOOTER_TOP - 10;
const FIRST_PAGE_LINES = Math.floor((LIST_BOTTOM - SIDE_LIST_TOP) / LINE_H);
const COLUMN_LINES = Math.floor((LIST_BOTTOM - CONT_LIST_TOP) / LINE_H);
const COLUMN_GAP = 24;
const COLUMN_W = (PAGE_WIDTH - 2 * MARGIN - COLUMN_GAP) / 2;

const FOOTER_NOTE = "Sizes are cut sizes. Taped panels are cut smaller than the order list by the tape on each taped edge. Blade and trim are allowed for.";

function fit(value, size, maxWidth, bold = false) {
  let out = String(value ?? "");
  if (textWidth(out, size, bold) <= maxWidth) return out;
  while (out.length > 1 && textWidth(`${out}...`, size, bold) > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

function boardName(board) {
  const thickness = board.thickness_mm ? `${board.thickness_mm}mm` : "";
  return [
    [board.supplier, board.colour].filter(Boolean).join(" "),
    board.finish,
    [thickness, board.material].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ") || "Board";
}

// ── The list down the side ───────────────────────────────────────────────────

function sideLines(sheet) {
  const lines = [{ kind: "heading", text: "Cut order" }];
  for (const step of sheet.steps) {
    lines.push({ kind: "step", id: step.id, text: step.text, indent: (step.level - 1) * 9, level: step.level });
  }
  lines.push({ kind: "gap" });
  lines.push({ kind: "heading", text: "Panels on this board" });
  const sorted = sheet.placements
    .slice()
    .sort((a, b) => (a.panel.panelNo ?? Infinity) - (b.panel.panelNo ?? Infinity));
  for (const place of sorted) {
    const panel = place.panel;
    const copy = panel.copies > 1 ? ` (${panel.copy} of ${panel.copies})` : "";
    const changed = panel.turnedForCutting ? " (turned for cutting)" : "";
    lines.push({
      kind: "panel",
      id: panelLabel(panel),
      text: `${mm(panel.cutH)} x ${mm(panel.cutW)}  ${panel.name}${copy}${changed}`,
    });
    const tape = !panel.tape.recorded
      ? "tape not recorded, cut to order size"
      : panel.tape.edges.length
        ? `tape ${panel.tape.words}`
        : "no tape";
    const size = panel.piece
      ? `piece of the ${mm(panel.finishedH)} x ${mm(panel.finishedW)} panel, see last page`
      : panel.tape.edges.length ? `order size ${mm(panel.finishedH)} x ${mm(panel.finishedW)}` : "";
    lines.push({ kind: "detail", id: "", text: [panel.source, size, tape].filter(Boolean).join("  |  ") });
  }
  return lines;
}

function drawLines(page, lines, x, top, width) {
  lines.forEach((line, index) => {
    const y = top + index * LINE_H + 7;
    if (line.kind === "gap") return;
    if (line.kind === "heading") {
      page.fillColor(BRAND);
      page.text(line.text, x, y, 9, { bold: true });
      return;
    }
    if (line.kind === "step") {
      const idX = x + line.indent;
      page.fillColor(CUT_COLOUR);
      page.text(line.id, idX, y, 7.5, { bold: true });
      page.fillColor(STROKE);
      page.text(fit(line.text, 7.5, width - line.indent - 30, line.level === 1), idX + 30, y, 7.5, { bold: line.level === 1 });
      return;
    }
    if (line.kind === "panel") {
      page.fillColor(BRAND);
      page.text(line.id, x, y, 8, { bold: true });
      page.fillColor(STROKE);
      page.text(fit(line.text, 7.5, width - 30, true), x + 30, y, 7.5, { bold: true });
      return;
    }
    page.fillColor(MUTED);
    page.text(fit(line.text, 6.8, width - 30), x + 30, y - 1.5, 6.8);
  });
}

// ── Labels inside a rectangle ────────────────────────────────────────────────

// The biggest size, up to 11pt, at which the lines fit the box. Lines are given
// up from the end until they fit, so a thin panel still shows its number.
function labelInRect(page, lines, x, y, w, h, colour, boldFirst = true) {
  let use = lines.slice();
  while (use.length) {
    const byHeight = h / (use.length * 1.2 + 0.3);
    const byWidth = Math.min(...use.map((line, index) => (w - 4) / Math.max(1, textWidth(line, 1, boldFirst && index === 0))));
    const size = Math.min(11, byHeight, byWidth);
    if (size >= 5 || use.length === 1) {
      if (size < 3.2) return;
      const blockHeight = use.length * size * 1.2;
      let lineY = y + (h - blockHeight) / 2 + size * 0.95;
      use.forEach((line, index) => {
        page.fillColor(colour);
        page.text(line, x + w / 2, lineY, index === 0 ? size : size * 0.86, { bold: boldFirst && index === 0, align: "center" });
        lineY += size * 1.2;
      });
      return;
    }
    use = use.slice(0, -1);
  }
}

// ── A board page ─────────────────────────────────────────────────────────────

function drawBoardPage(page, { plan, group, sheet, boardNo, boardCount, lines }) {
  const board = group.board;
  const settings = plan.settings;

  page.fillColor(STROKE);
  page.text(`Board ${boardNo} of ${boardCount}`, MARGIN, CONTENT_TOP + 8, 16, { bold: true });
  page.text(fit(boardName(board), 9.5, SIDE_X - MARGIN - 20, true), MARGIN, CONTENT_TOP + 24, 9.5, { bold: true });
  page.fillColor(MUTED);
  page.text(
    `${mm(board.length_mm)} long x ${mm(board.width_mm)} wide  |  ${board.has_grain ? "Grained, the grain runs along the length" : "No grain"}`,
    MARGIN, CONTENT_TOP + 37, 8
  );

  // The board, to scale, length across the page.
  const marker = 18;
  const areaX = MARGIN + marker;
  const areaY = CONTENT_TOP + 52 + marker;
  const areaW = SIDE_X - 22 - areaX;
  const areaH = FOOTER_TOP - 36 - areaY;
  const scale = Math.min(areaW / board.length_mm, areaH / board.width_mm);
  const bx = areaX;
  const by = areaY;
  const bw = board.length_mm * scale;
  const bh = board.width_mm * scale;
  const X = (value) => bx + value * scale;
  const Y = (value) => by + value * scale;
  const trim = settings.trim_mm;

  page.fillColor(WASTE_FILL);
  page.rect(bx, by, bw, bh, { fill: true, stroke: false });
  page.fillColor(WHITE);
  page.rect(X(trim), Y(trim), (board.length_mm - 2 * trim) * scale, (board.width_mm - 2 * trim) * scale, { fill: true, stroke: false });

  for (const offcut of sheet.offcuts) {
    const rx = X(offcut.x);
    const ry = Y(offcut.y);
    const rw = offcut.w * scale;
    const rh = offcut.h * scale;
    if (offcut.usable) {
      page.fillColor(OFFCUT_FILL);
      page.rect(rx, ry, rw, rh, { fill: true, stroke: false });
      page.strokeColor(OFFCUT_STROKE);
      page.lineWidth(0.6);
      page.dashedRect(rx, ry, rw, rh);
      const longSide = Math.max(offcut.w, offcut.h);
      const shortSide = Math.min(offcut.w, offcut.h);
      labelInRect(page, ["Offcut", `${mm(longSide)} x ${mm(shortSide)}`], rx, ry, rw, rh, OFFCUT_STROKE, false);
    } else {
      page.fillColor(WASTE_FILL);
      page.rect(rx, ry, rw, rh, { fill: true, stroke: false });
    }
  }

  for (const place of sheet.placements) {
    const rx = X(place.x);
    const ry = Y(place.y);
    const rw = place.w * scale;
    const rh = place.h * scale;
    page.fillColor(PANEL_FILL);
    page.strokeColor(BRAND);
    page.lineWidth(0.7);
    page.rect(rx, ry, rw, rh, { fill: true, stroke: true });
    const panel = place.panel;
    labelInRect(
      page,
      [panelLabel(panel), `${mm(panel.cutH)} x ${mm(panel.cutW)}`, panel.name],
      rx, ry, rw, rh, BRAND
    );
  }

  page.strokeColor(CUT_COLOUR);
  for (const cut of sheet.cuts) {
    page.lineWidth(cut.level === 1 ? 1.4 : cut.level === 2 ? 0.9 : 0.55);
    page.line(X(cut.x1), Y(cut.y1), X(cut.x2), Y(cut.y2));
  }
  // The strip cuts are numbered at the edge of the board, where the saw starts.
  for (const cut of sheet.cuts.filter((entry) => entry.level === 1)) {
    const horizontal = Math.abs(cut.y1 - cut.y2) < 0.01;
    const cx = horizontal ? bx - 10 : X(cut.x1);
    const cy = horizontal ? Y(cut.y1) : by - 10;
    page.fillColor(CUT_COLOUR);
    page.circle(cx, cy, 6.5);
    page.fillColor(WHITE);
    page.text(cut.label, cx, cy + 2.6, 7, { bold: true, align: "center" });
  }
  for (const cut of sheet.cuts.filter((entry) => entry.level === 2)) {
    page.fillColor(CUT_COLOUR);
    page.text(cut.label, X(Math.min(cut.x1, cut.x2)) + 2, Y(Math.min(cut.y1, cut.y2)) + 7, 6, { bold: true });
  }

  page.strokeColor(STROKE);
  page.lineWidth(1.2);
  page.rect(bx, by, bw, bh);

  // Legend under the board.
  const legendY = by + bh + 16;
  let legendX = bx;
  const swatch = (fill, label, dashed = false) => {
    page.fillColor(fill);
    page.rect(legendX, legendY - 7, 12, 8, { fill: true, stroke: false });
    page.strokeColor(dashed ? OFFCUT_STROKE : BRAND);
    page.lineWidth(0.5);
    if (dashed) page.dashedRect(legendX, legendY - 7, 12, 8);
    else page.rect(legendX, legendY - 7, 12, 8);
    page.fillColor(MUTED);
    page.text(label, legendX + 16, legendY, 7);
    legendX += 16 + textWidth(label, 7) + 14;
  };
  swatch(PANEL_FILL, "Panel, number and cut size");
  swatch(OFFCUT_FILL, "Offcut worth keeping", true);
  swatch(WASTE_FILL, "Trim and waste");
  page.strokeColor(CUT_COLOUR);
  page.lineWidth(1.4);
  page.line(legendX, legendY - 3, legendX + 14, legendY - 3);
  page.fillColor(MUTED);
  page.text("Cut, numbered in the order to make it", legendX + 18, legendY, 7);

  // What this board is and how the saw is set.
  page.fillColor([0.961, 0.973, 0.957]);
  page.strokeColor(LINE);
  page.lineWidth(0.8);
  page.rect(SIDE_X, CONTENT_TOP, SIDE_W, 90, { fill: true, stroke: true });
  const facts = [
    ["Panels", String(sheet.panel_count)],
    ["Board used", `${sheet.used_pct}%`],
    ["Offcuts to keep", String(sheet.usable_offcuts)],
    ["Blade", `${mm(settings.kerf_mm)}mm`],
    ["Trim", `${mm(settings.trim_mm)}mm each edge`],
    ["Edge tape", `${mm(settings.tape_mm)}mm unless the edge says`],
  ];
  facts.forEach(([label, value], index) => {
    const y = CONTENT_TOP + 16 + index * 12.5;
    page.fillColor(MUTED);
    page.text(label, SIDE_X + 10, y, 7.5);
    page.fillColor(STROKE);
    page.text(fit(value, 7.5, SIDE_W - 90, true), SIDE_X + 80, y, 7.5, { bold: true });
  });

  drawLines(page, lines, SIDE_X, SIDE_LIST_TOP, SIDE_W);
}

function drawContinuedPage(page, { group, boardNo, boardCount, lines }) {
  page.fillColor(STROKE);
  page.text(`Board ${boardNo} of ${boardCount}, continued`, MARGIN, CONTENT_TOP + 8, 16, { bold: true });
  page.fillColor(MUTED);
  page.text(fit(boardName(group.board), 9, PAGE_WIDTH - 2 * MARGIN), MARGIN, CONTENT_TOP + 22, 9);
  drawLines(page, lines.slice(0, COLUMN_LINES), MARGIN, CONT_LIST_TOP, COLUMN_W);
  drawLines(page, lines.slice(COLUMN_LINES), MARGIN + COLUMN_W + COLUMN_GAP, CONT_LIST_TOP, COLUMN_W);
}

const CHECK_LINE_H = 13;
const CHECK_SIZE = 8.5;
const CHECK_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// Long sentences wrap onto more lines rather than being cut off: the workshop
// record has to be read in full.
function wrap(textValue, size, width, bold) {
  const words = String(textValue ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next, size, bold) > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * The last page: first the workshop record of every panel laid out differently
 * to the order, then anything to check before the first cut.
 */
function checkLines(plan) {
  const lines = [];
  const add = (kind, value) => {
    const bold = kind === "strong";
    wrap(value, CHECK_SIZE, CHECK_WIDTH - (kind === "heading" ? 0 : 10), bold).forEach((textLine, index) => {
      lines.push({ kind, text: textLine, continued: index > 0 });
    });
  };

  if (plan.fixes?.length) {
    lines.push({ kind: "heading", text: "Changed for cutting only. The order is not changed." });
    plan.fixes.forEach((record) => add("strong", record.text));
    lines.push({ kind: "gap" });
  }

  const panelLine = (panel, why) =>
    `${panelLabel(panel)}  ${panel.name}, ${mm(panel.cutH ?? panel.heightMm)} x ${mm(panel.cutW ?? panel.widthMm)}  |  ${panel.source || ""}  |  ${why}`;
  const details = [];
  for (const group of plan.groups) {
    for (const panel of group.unplaced) details.push(panelLine(panel, `too big for a ${mm(group.board.length_mm)} x ${mm(group.board.width_mm)} board`));
  }
  for (const panel of plan.tapeNotRecorded) details.push(panelLine(panel, "no taped edges recorded, cut to order size"));
  for (const row of plan.held) details.push(`${row.panelNo ? `#${row.panelNo}` : "-"}  ${row.piece}  |  ${row.source || ""}  |  held by a pending variation`);
  for (const row of plan.noSize) details.push(`${row.panelNo ? `#${row.panelNo}` : "-"}  ${row.piece}  |  ${row.source || ""}  |  no size recorded`);

  if (plan.warnings.length || details.length) {
    lines.push({ kind: "heading", text: "Check before cutting" });
    plan.warnings.forEach((warning) => add("strong", warning));
    details.forEach((detail) => add("detail", detail));
  }
  return lines;
}

function drawChecksPage(page, { title, lines }) {
  page.fillColor(STROKE);
  page.text(title, MARGIN, CONTENT_TOP + 8, 16, { bold: true });
  lines.forEach((line, index) => {
    if (line.kind === "gap") return;
    const y = CONT_LIST_TOP + index * CHECK_LINE_H + 8;
    if (line.kind === "heading") {
      page.fillColor(BRAND);
      page.text(line.text, MARGIN, y, 10, { bold: true });
      return;
    }
    page.fillColor(line.kind === "strong" ? STROKE : MUTED);
    page.text(line.text, MARGIN + 10, y, CHECK_SIZE, { bold: line.kind === "strong" });
  });
}

/** The pages in order, before anything is drawn, so every page knows the count. */
export function planPages(plan) {
  const pages = [];
  let boardNo = 0;
  const boardCount = plan.totals.boards;
  for (const group of plan.groups) {
    for (const sheet of group.sheets) {
      boardNo += 1;
      const lines = sideLines(sheet);
      pages.push({ kind: "board", group, sheet, boardNo, boardCount, lines: lines.slice(0, FIRST_PAGE_LINES) });
      let rest = lines.slice(FIRST_PAGE_LINES);
      while (rest.length) {
        pages.push({ kind: "continued", group, sheet, boardNo, boardCount, lines: rest.slice(0, COLUMN_LINES * 2) });
        rest = rest.slice(COLUMN_LINES * 2);
      }
    }
  }
  const checks = checkLines(plan);
  const perPage = Math.floor((LIST_BOTTOM - CONT_LIST_TOP) / CHECK_LINE_H);
  const title = plan.fixes?.length ? "Workshop record" : "Check before cutting";
  for (let start = 0; start < checks.length; start += perPage) {
    pages.push({ kind: "checks", title: start ? `${title}, continued` : title, lines: checks.slice(start, start + perPage) });
  }
  return pages;
}

export function generateCuttingPlanPdf({ order, plan }) {
  if (!plan?.totals?.boards) throw new Error("Nothing on this order is cut in house.");
  const pages = planPages(plan);
  const logo = loadLogo();
  const pdf = new PdfDocument({ logo, producer: "PCD cutting plan, lib/pcd-cutting-plan-pdf.js" });

  pages.forEach((entry, index) => {
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      page.logoWidth = logo?.width || 1;
      page.logoHeight = logo?.height || 1;
      drawHeader(page, order, "Cutting plan");
      drawFooter(page, index + 1, pages.length, FOOTER_NOTE);
      if (entry.kind === "board") drawBoardPage(page, { plan, ...entry });
      else if (entry.kind === "continued") drawContinuedPage(page, entry);
      else drawChecksPage(page, entry);
    });
  });

  return pdf.toBuffer();
}
