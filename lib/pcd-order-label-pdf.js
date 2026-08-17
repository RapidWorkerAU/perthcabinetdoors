// Workshop labels for a Brother QL, on 62mm stock.
//
// Each page IS one label, drawn at the exact width of the roll, so the file
// prints straight from any PDF viewer with the Brother driver set to match. No
// P-touch Editor, no USB scripting.
//
// ── WHY EVERY LABEL IS THE SAME HEIGHT ───────────────────────────────────────
// A continuous roll can cut each label to its own length, and the temptation is
// to size every page to its content. Print drivers routinely take the paper
// size from the first page of a file and apply it to the rest, which would cut
// every label to the length of whichever one happened to be first. So the
// tallest label sets the height and they all print at that: predictable at the
// printer, and a drawer full of labels that are the same size.
//
// ── WHY NOTHING HERE IS POSITIONED BY EYE ────────────────────────────────────
// The content is not fixed: a cut size is three digits or four, a colour name is
// one line or two, a thermolaminated door carries a front profile a carcass
// panel does not. Every block is therefore MEASURED, so a longer string makes
// the layout adapt rather than run off the edge or land on the block beneath.
//
// What it does NOT do is stretch. The bands run top down at fixed sizes and
// stop where they stop; the variation strip has its space at the foot reserved
// whether or not it is used. A label with room left at the bottom simply has
// room left at the bottom.

import { PdfDocument, loadLogo } from "./pcd-cabinet-pdf.js";
import { LABEL_UNKNOWN } from "./pcd-order-labels.js";
import { DEFAULT_LABEL_STOCK, resolveLabelStock } from "./pcd-label-stocks.js";

const MM = 2.834645669; // points per millimetre

// Bumped whenever this layout changes. Written into the PDF and returned by the
// route as ?format=json, so a label in hand can always be matched to the code.
export const LABEL_LAYOUT_VERSION = "labels-2026-08-17-fixed-v10";

// The Brother feed is not perfectly registered, so the content sits inside a
// margin rather than running to the edge.
const LABEL_WIDTH = 62 * MM;
const LABEL_MARGIN = 3.5 * MM;
const CONTENT_WIDTH = LABEL_WIDTH - LABEL_MARGIN * 2;
const MIN_LABEL_HEIGHT = 40 * MM;
const MAX_LABEL_HEIGHT = 110 * MM;

// Cap height as a fraction of the point size. Both Helvetica faces are 0.717,
// and it is what vertical centring actually has to use: a baseline placed by
// half the POINT size sits the text high, because the point size includes
// descender room that a line of capitals never uses. That is why the number in
// the black plate looked lifted.
const CAP = 0.717;

// Thermal printing has no colour, so emphasis is size, weight and inversion.
// Greys are used sparingly and only for section captions, which are labels
// rather than instructions: a dithered grey reads as a quieter black, and that
// is exactly the job.
//
// ── EVERY SIZE HERE IS FIXED ─────────────────────────────────────────────────
// The layout runs top down at these sizes and stops where it stops. It does NOT
// stretch to fill the label, and the variation strip's space at the foot is
// reserved whether or not there is a variation to put in it. So a label with a
// variation and a label without are identical above the foot, and a label with
// spare room at the bottom simply has spare room at the bottom.
//
// The one thing still measured against the run is the DIMENSION type size, and
// only against width: four digits in both dimensions has to fit the column, and
// every label in a batch has to be set the same or the eye starts reading the
// type size as though it meant something.

// Ink colours. Both are true greys, so nothing dithers into a tint.
const INK = [0.05, 0.05, 0.05];
// Section captions: Edge Profile, Front Profile, Order Details. Quieter than an
// instruction, still white text on a solid ground.
const CAPTION_GREY = [0.32, 0.32, 0.32];

// A divider, not a rule. It separates, it does not announce.
const DIVIDER = 0.4;
// Air either side of a divider. One setting for every band, so the label reads
// as evenly spaced from top to bottom, and a fraction more under the masthead
// because the logo there is the full height of the number plate beside it.
const SECTION_PAD = 1.8 * MM;
const MASTHEAD_PAD = 2 * MM;

const CELL_PAD = 5;
// Stroked rectangles centre the line on the path, so a border pushes half its
// width outside the box on every side. Left alone, an outlined cell is a whole
// line width taller and wider than the filled cell it sits beside, which is
// visible at this size. Every outlined cell is inset by half instead.
const CELL_STROKE = 0.8;

// ── masthead ──
const LABEL_LOGO = "rectangle-pcd-logo";
const PLATE_WIDTH = 21 * MM;
const BADGE_FONT = 17;
const BADGE_BOX_HEIGHT = BADGE_FONT * CAP + 9;
const COUNTER_FONT = 8;
const COUNTER_BOX_HEIGHT = COUNTER_FONT * CAP + 6;
// The logo is exactly as tall as the number plate and its count together, so
// the two sides of the masthead start and finish on the same lines.
const PLATE_HEIGHT = BADGE_BOX_HEIGHT + COUNTER_BOX_HEIGHT;
const LOGO_MAX_WIDTH = 30 * MM;

// ── dimensions and drilling ──
const MEAS_MAX = 16;
const MEAS_MIN = 11;
const MEAS_LEADING = 1.3;
// The reversed W / H square, and the letter inside it, as fractions of the
// number beside them. The square is deliberately smaller than the digits: it
// says which dimension this is, it is not the dimension.
const MARKER_RATIO = 0.8;
const MARKER_TEXT_RATIO = 0.54;
const MARKER_GAP_RATIO = 0.3;

// The same width as the number plate above it, so the label's right hand edge
// reads as one column rather than two that nearly line up.
const DRILL_COLUMN_WIDTH = PLATE_WIDTH;
const DRILL_CAPTION_FONT = 8;
const DRILL_VALUE_FONT = 10;
const DRILL_CAPTION_HEIGHT = DRILL_CAPTION_FONT * CAP + 5;
const DRILL_VALUE_HEIGHT = DRILL_VALUE_FONT * CAP + 6;
const DRILL_QTY_HEIGHT = DRILL_VALUE_FONT * CAP + 5;

// ── material ──
const SPEC_FONT = 8.5;
const SPEC_LINE = SPEC_FONT * 1.4;
const COLOUR_FONT = 11;
const COLOUR_MIN_FONT = 9;
// The size a colour name drops to once it has to take two lines.
const COLOUR_WRAP_FONT = 8.5;
const COLOUR_LINE = COLOUR_FONT * 1.25;
const FINISH_FONT = 8;
const FINISH_LINE = FINISH_FONT * 1.35;

// ── profiles ──
const PROFILE_CAPTIONS = ["Edge Profile", "Front Profile"];
const PROFILE_CAPTION_FONT = 7.5;
const PROFILE_FONT = 8;
const PROFILE_ROW_HEIGHT = PROFILE_FONT * CAP + 6;
const PROFILE_ROW_GAP = 2;

// ── order details ──
const DETAILS_BAR_FONT = 7.5;
const DETAILS_BAR_HEIGHT = DETAILS_BAR_FONT * CAP + 5;
const DETAILS_FONT = 7;
const DETAILS_LINE = DETAILS_FONT * 1.14;
const DETAILS_CAPTIONS = ["Customer Name:", "Order ID:", "Order Date:", "Manufacturing Date:"];

// ── the variation strip ──
const BAND_FONT = 7;
const BAND_MIN_FONT = 5;
// The clear air between the strip's two halves. "PROPOSED - VAR 6120B2 - 2 OF 2"
// on the left and "DO NOT CUT" on the right is the longest pair we produce, and
// at a flat 7pt the two ran into each other.
const BAND_GAP = 8;
const VARIATION_HEIGHT = 4.4 * MM;
const STRIP_CLEARANCE = 0.9 * MM;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// ── Measuring ────────────────────────────────────────────────────────────────
//
// The rest of the PDF code estimates text at half a point size per character.
// On a wide document with wrapping columns that is close enough. On a 55mm wide
// label it is not, in both directions:
//
//   Too narrow: a cut size is mostly digits (0.556 em) and the letter m (0.889
//   em), so "597mm x 1397mm" really measures 8.6 em, not the 7 the estimate
//   predicts. At 25pt that is 214pt of text in a 156pt label.
//
//   Too wide, which is worse: right-aligned text is positioned by subtracting
//   the estimate from the right edge. Under-read a line of bold capitals by a
//   fifth and it does not get shorter, it starts too far right and its tail
//   goes off the label. "NOT RECORDED" in the drill box was doing exactly that.
//
// So these are the real Helvetica advance widths, per 1000 units, from the AFM.
// Anything unlisted falls back to a deliberately wide 0.6 em.
function widthTable(spec) {
  const widths = {};
  for (const [chars, width] of spec) for (const ch of chars) widths[ch] = width;
  return widths;
}

const BOLD_WIDTHS = widthTable([
  [" ", 278], ["!", 333], ['"', 474], ["#$", 556], ["%", 889], ["&", 722],
  ["'", 238], ["()", 333], ["*", 389], ["+", 584], [",", 278], ["-", 333],
  [".", 278], ["/", 278], ["0123456789", 556], [":;", 333], ["<=>", 584],
  ["?", 611], ["@", 975],
  ["ABCD", 722], ["E", 667], ["F", 611], ["G", 778], ["H", 722], ["I", 278],
  ["J", 556], ["K", 722], ["L", 611], ["M", 833], ["N", 722], ["O", 778],
  ["P", 667], ["Q", 778], ["R", 722], ["S", 667], ["T", 611], ["U", 722],
  ["V", 667], ["W", 944], ["XY", 667], ["Z", 611],
  ["[", 333], ["\\", 278], ["]", 333], ["^", 584], ["_", 556], ["`", 278],
  ["a", 556], ["b", 611], ["c", 556], ["d", 611], ["e", 556], ["f", 333],
  ["g", 611], ["h", 611], ["ij", 278], ["k", 556], ["l", 278], ["m", 889],
  ["nopq", 611], ["r", 389], ["s", 556], ["t", 333], ["u", 611], ["v", 556],
  ["w", 778], ["xy", 556], ["z", 500],
  ["{", 389], ["|", 280], ["}", 389], ["~", 584],
]);

const REGULAR_WIDTHS = widthTable([
  [" !", 278], ['"', 355], ["#$", 556], ["%", 889], ["&", 667], ["'", 191],
  ["()", 333], ["*", 389], ["+", 584], [",", 278], ["-", 333], [".", 278],
  ["/", 278], ["0123456789", 556], [":;", 278], ["<=>", 584], ["?", 556],
  ["@", 1015],
  ["AB", 667], ["CD", 722], ["E", 667], ["F", 611], ["G", 778], ["H", 722],
  ["I", 278], ["J", 500], ["K", 667], ["L", 556], ["M", 833], ["N", 722],
  ["O", 778], ["P", 667], ["Q", 778], ["R", 722], ["S", 667], ["T", 611],
  ["U", 722], ["V", 667], ["W", 944], ["XY", 667], ["Z", 611],
  ["[", 278], ["\\", 278], ["]", 278], ["^", 469], ["_", 556], ["`", 333],
  ["a", 556], ["b", 556], ["c", 500], ["d", 556], ["e", 556], ["f", 278],
  ["g", 556], ["h", 556], ["ij", 222], ["k", 500], ["l", 222], ["m", 833],
  ["n", 556], ["o", 556], ["p", 556], ["q", 556], ["r", 333], ["s", 500],
  ["t", 278], ["u", 556], ["v", 500], ["w", 722], ["x", 500], ["y", 500],
  ["z", 500],
  ["{", 334], ["|", 260], ["}", 334], ["~", 584],
]);

export function textWidth(value, size, bold = false) {
  const table = bold ? BOLD_WIDTHS : REGULAR_WIDTHS;
  let units = 0;
  for (const ch of clean(value)) units += table[ch] ?? 600;
  return (units / 1000) * size;
}

export function boldTextWidth(value, size) {
  return textWidth(value, size, true);
}

// The largest point size, at or below `max`, that fits every one of `values`
// inside `width`.
//
// Measured across the whole run, not per label, for the same reason every label
// in the run is the same height. A drawer of labels where 597mm is set smaller
// than 347mm reads as two different documents, and the eye starts reading the
// type size as though it meant something.
function fitFont(values, width, max, min, bold = true) {
  const widest = values
    .map((value) => textWidth(value, max, bold))
    .reduce((a, b) => Math.max(a, b), 0);
  if (!widest || widest <= width) return max;
  return Math.max(min, Math.floor((width / widest) * max * 10) / 10);
}

// Wrapping done on real widths, and able to break inside a word. A colour name
// with no spaces in it is not a reason to run off the label.
function wrap(value, width, size, bold = false) {
  const text = clean(value);
  if (!text) return [];
  const lines = [];
  let current = "";

  const breakLongWord = (word) => {
    let part = "";
    for (const ch of word) {
      if (part && textWidth(part + ch, size, bold) > width) {
        lines.push(part);
        part = ch;
        continue;
      }
      part += ch;
    }
    return part;
  };

  // A material reads "Decorative Board - Woodmatt - Florentine Walnut", and a
  // break either side of a separator can leave a line starting with a dash,
  // where it reads as a minus sign rather than as a join. Sticking it to the
  // word before it makes it part of that token, so it is carried and MEASURED
  // with it rather than fixed up afterwards and pushed over the margin.
  const words = text.split(" ").reduce((out, word) => {
    if (word === "-" && out.length) {
      out[out.length - 1] += " -";
      return out;
    }
    return out.concat(word);
  }, []);

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size, bold) <= width) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = textWidth(word, size, bold) <= width ? word : breakLongWord(word);
  });
  if (current) lines.push(current);
  return lines;
}

// Wrapping with a ceiling on how many lines it may take.
//
// Without one, a long value grows the block it is in, the block pushes on the
// one below it, and a label that has to be exactly 90mm runs out of stock. A
// colour name is normally two or three words; the rare long one comes down a
// point or two rather than taking four lines off everything else.
//
// Returns the size it settled on as well as the lines, since the caller has to
// lay out at that size rather than the one it asked for.
function wrapToLines(value, width, maxSize, minSize, maxLines, bold = false) {
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    const lines = wrap(value, width, size, bold);
    if (lines.length <= maxLines) return { lines, size };
  }
  return { lines: wrap(value, width, minSize, bold).slice(0, maxLines), size: minSize };
}

// Baseline that puts a line of capitals in the optical centre of a box.
function centredBaseline(top, boxHeight, size) {
  return top + (boxHeight + size * CAP) / 2;
}

function textRight(page, value, rightEdge, baseline, size, options = {}) {
  const bold = options.bold !== false;
  page.text(value, rightEdge - textWidth(value, size, bold), baseline, size, { ...options, bold });
}// ── The layout ──────────────────────────────────────────────────────────────
//
// Four bands down the label, each separated by a hard rule, plus a variation
// strip across the foot when there is one.
//
//   MASTHEAD      the logo, and the piece's number on a filled plate with its
//                 count under it. What the piece IS, in one glance.
//   WHAT TO DO    the two dimensions on the left, the drilling instruction as a
//                 small table on the right. The band read across a workshop.
//   WHAT IT IS    the colour as the headline, board above, brand and finish
//                 below, then the two profiles in captioned boxes.
//   WHOSE IT IS   customer, order, and the two dates, as a captioned list.
//
// Nothing here uses colour. A variation shows as a strip that is solid, hatched
// or outlined, because a thermal printer renders an amber bar and a green bar
// identically. The same three treatments the production sheet uses.
//
// Every block is MEASURED and laid out from those measurements. A cut size is
// three digits or four, a colour name is one line or two, a profile name has no
// useful upper bound. Positioning any of it by eye is how text ends up on top
// of other text on a label that has 55mm of usable width.
// ── The layout ──────────────────────────────────────────────────────────────
//
// Five bands down the label, each separated by a divider, and the variation
// strip's space reserved at the foot.
//
//   MASTHEAD    the logo, and the piece's number on a plate with its count.
//   INSTRUCTION the two dimensions on the left, the drilling table on the
//               right. The band read across a workshop.
//   MATERIAL    the colour as the headline, board above, brand and finish
//               below in italic.
//   PROFILES    the edge and the front, each a caption and a value.
//   ORDER       customer, order, and the two dates.
//
// Drawn top down at fixed sizes. Nothing stretches to fill the label: whatever
// room is left at the foot of a label without a variation stays empty, and the
// band positions are identical on every label whether or not it has one.

// ── shared cell drawing ─────────────────────────────────────────────────────
//
// The label is built from two kinds of cell and only two: a filled one with
// knocked-out white text for a caption, and an outlined one with black text for
// its value. That pairing is the whole visual language, so it lives in one
// place rather than being re-expressed at each of the nine places it appears.

function fillCell(page, { x, y, width, height, text, size, ground = INK, align = "center" }) {
  page.fillColor(ground);
  page.rect(x, y, width, height, { fill: true, stroke: false });
  page.fillColor([1, 1, 1]);
  const w = boldTextWidth(text, size);
  page.text(text, align === "left" ? x + CELL_PAD : x + (width - w) / 2,
    centredBaseline(y, height, size), size, { bold: true });
}

function outlineCell(page, { x, y, width, height, text, size, bold = false, align = "center", stroke = INK }) {
  // The border matches the caption cell this value belongs to, so a pair reads
  // as one control: black beside a black caption, grey beside a grey one.
  page.strokeColor(stroke);
  page.lineWidth(CELL_STROKE);
  // Inset by half the stroke, so the OUTER edge of the border lands exactly on
  // the box, matching the filled cell beside it rather than overhanging it.
  const half = CELL_STROKE / 2;
  page.rect(x + half, y + half, width - CELL_STROKE, height - CELL_STROKE);
  page.fillColor(INK);
  const w = textWidth(text, size, bold);
  page.text(text, align === "left" ? x + CELL_PAD : x + (width - w) / 2,
    centredBaseline(y, height, size), size, { bold });
}

function divider(page, y) {
  page.fillColor(INK);
  page.rect(0, y, LABEL_WIDTH, DIVIDER, { fill: true, stroke: false });
  return y + DIVIDER;
}

// ── the pieces of data the layout reads ─────────────────────────────────────

function splitSize(value) {
  const parts = clean(value).split(" x ");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { width: parts[0], height: parts[1] };
}

function dimensionRows(label) {
  const split = splitSize(label.size);
  if (!split) return [{ marker: "", value: clean(label.size) || "-" }];
  return [
    { marker: "W", value: split.width },
    { marker: "H", value: split.height },
  ];
}

function orderDetailRows(label) {
  const values = [label.customer, label.orderNumber, label.orderDate, label.manufacturingDate];
  return DETAILS_CAPTIONS.map((caption, index) => [caption, clean(values[index]) || "-"]);
}

// The colour is the headline of the material band. A long name shrinks as far
// as it usefully can on one line before taking a second.
function headlineLines(value) {
  const single = wrapToLines(value, CONTENT_WIDTH, COLOUR_FONT, COLOUR_MIN_FONT, 1, true);
  if (textWidth(value, single.size, true) <= CONTENT_WIDTH) return single;
  return wrapToLines(value, CONTENT_WIDTH, COLOUR_WRAP_FONT, 7.5, 2, true);
}

function materialLines(label) {
  return {
    // One line each: the board and the brand are single facts, and a second
    // line for either costs 4mm of a 90mm label for nothing.
    above: wrapToLines(label.materialAbove, CONTENT_WIDTH, SPEC_FONT, 6.5, 1),
    headline: headlineLines(label.colourHeadline),
    below: wrapToLines(label.materialBelow, CONTENT_WIDTH, FINISH_FONT, 6, 1),
  };
}

// A profile name has no useful upper bound, so the type comes down and in the
// last resort the name is cut short. The row then never changes height and can
// never collide with the caption cell beside it.
function profileValue(value, width) {
  const size = fitFont([value], width, PROFILE_FONT, 5.5, false);
  if (textWidth(value, size) <= width) return { text: value, size };
  let cut = value;
  while (cut.length > 1 && textWidth(`${cut}...`, size) > width) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}...`, size };
}

function profileCaptionWidth() {
  return PROFILE_CAPTIONS
    .map((caption) => boldTextWidth(caption, PROFILE_CAPTION_FONT))
    .reduce((a, b) => Math.max(a, b), 0) + CELL_PAD * 2;
}

function profileRows(label) {
  const room = CONTENT_WIDTH - profileCaptionWidth() - CELL_PAD - 4;
  return [
    { caption: PROFILE_CAPTIONS[0], raw: clean(label.edge) || "-" },
    { caption: PROFILE_CAPTIONS[1], raw: clean(label.profile) || "-" },
  ].map((row) => ({ ...row, ...profileValue(row.raw, room) }));
}

function detailsCaptionWidth() {
  return DETAILS_CAPTIONS
    .map((caption) => textWidth(caption, DETAILS_FONT, true))
    .reduce((a, b) => Math.max(a, b), 0) + 8;
}

// ── band heights ────────────────────────────────────────────────────────────
//
// The INK height of each band: from the top of its first row to the bottom of
// its last, with no trailing leading. Padding is added around it by the caller,
// which is what makes the gap above a band equal to the gap below it. Adding
// the trailing leading here is what made those gaps unequal before.

// A stack of text lines, measured from the cap line of the first to the
// descender of the last.
function stackHeight(rows) {
  const advances = rows.slice(0, -1).reduce((total, row) => total + row.leading, 0);
  const last = rows[rows.length - 1];
  return last ? advances + last.size * (CAP + 0.21) : 0;
}

function logoBox(logo) {
  if (!logo) return { width: 0, height: 0 };
  const aspect = logo.height / logo.width;
  // Height first, and never distorted. The width cap only bites if a future
  // lockup is wide enough to reach the plate.
  const maxWidth = Math.min(LOGO_MAX_WIDTH, CONTENT_WIDTH - PLATE_WIDTH - 10);
  const height = Math.min(PLATE_HEIGHT, maxWidth * aspect);
  return { width: height / aspect, height };
}

function mastheadHeight(logo) {
  return Math.max(PLATE_HEIGHT, logoBox(logo).height);
}

function drillTableHeight() {
  return DRILL_CAPTION_HEIGHT + DRILL_VALUE_HEIGHT + DRILL_QTY_HEIGHT;
}

// The INK the dimensions put on the page, which is not the same as the space
// two lines of type occupy: leading sits above the first cap and below the last
// descender, and counting it made the band taller than anything visible in it.
// The band was then 1.3pt deeper than its content and the air above the divider
// beneath it no longer matched the air below the divider above it.
function dimensionsInkHeight(measFont) {
  const row = Math.max(measFont * MARKER_RATIO, measFont * (CAP + 0.21));
  return measFont * MEAS_LEADING + row;
}

function instructionHeight(measFont) {
  return Math.max(drillTableHeight(), dimensionsInkHeight(measFont));
}

function materialHeight(label) {
  const { above, headline, below } = materialLines(label);
  return stackHeight([
    ...above.lines.map(() => ({ size: above.size, leading: SPEC_LINE })),
    ...headline.lines.map(() => ({ size: headline.size, leading: COLOUR_LINE })),
    ...below.lines.map(() => ({ size: below.size, leading: FINISH_LINE })),
  ]);
}

function profilesHeight() {
  return 2 * PROFILE_ROW_HEIGHT + PROFILE_ROW_GAP;
}

function orderDetailsHeight() {
  return DETAILS_BAR_HEIGHT + 4
    + stackHeight(DETAILS_CAPTIONS.map(() => ({ size: DETAILS_FONT, leading: DETAILS_LINE })));
}

// Every band, its dividers and its padding, plus the strip's reserved space.
// This is what the label must be tall enough for, and it does not depend on
// whether this particular label carries a variation.
function labelContentHeight(label, logo, measFont) {
  const bands = [
    mastheadHeight(logo),
    instructionHeight(measFont),
    materialHeight(label),
    profilesHeight(),
    orderDetailsHeight(),
  ];
  const pads = [MASTHEAD_PAD, SECTION_PAD, SECTION_PAD, SECTION_PAD, SECTION_PAD];
  const gaps = pads.slice(1).reduce((total, pad, i) => total + 2 * Math.max(pads[i], pad), 0);
  return LABEL_MARGIN
    + bands.reduce((total, band) => total + band, 0)
    + gaps
    + (bands.length - 1) * DIVIDER
    // Clear air between the last line of the order details and the strip, then
    // the strip itself, which sits on the label's bottom edge. This is not a
    // band gap: nothing is divided here, the strip simply must not touch the
    // list above it.
    + STRIP_CLEARANCE + VARIATION_HEIGHT;
}

function minimumLabelHeight(label, logo) {
  return labelContentHeight(label, logo, MEAS_MIN);
}

// Only two things are measured across the run, and neither is height.
//
// The dimension size, so four digits in both dimensions fits the column and
// every label in a batch is set the same. And the variation strip's type, so
// its two halves never run into each other.
function runFonts(labels) {
  const column = CONTENT_WIDTH - DRILL_COLUMN_WIDTH - 6;
  const widest = labels.flatMap(dimensionRows).map((row) => {
    const marker = row.marker ? MARKER_RATIO + MARKER_GAP_RATIO : 0;
    return boldTextWidth(row.value, 1) + marker;
  }).reduce((a, b) => Math.max(a, b), 0);

  const bandPairs = labels
    .filter((label) => label.band)
    .map((label) => boldTextWidth(label.band.left, BAND_FONT) + boldTextWidth(label.band.right, BAND_FONT))
    .reduce((a, b) => Math.max(a, b), 0);

  return {
    band: bandPairs + BAND_GAP <= CONTENT_WIDTH
      ? BAND_FONT
      : Math.max(BAND_MIN_FONT, Math.floor(((CONTENT_WIDTH - BAND_GAP) / bandPairs) * BAND_FONT * 10) / 10),
    meas: Math.max(MEAS_MIN, Math.floor(Math.min(MEAS_MAX, widest ? column / widest : MEAS_MAX) * 10) / 10),
  };
}

// ── drawing ─────────────────────────────────────────────────────────────────

function drawMasthead(page, label, y, logo) {
  const left = LABEL_MARGIN;
  const right = LABEL_WIDTH - LABEL_MARGIN;
  const height = mastheadHeight(logo);

  if (logo) {
    const box = logoBox(logo);
    page.image("Logo", left, y + (height - box.height) / 2, box.width, box.height);
  }

  const plateX = right - PLATE_WIDTH;
  fillCell(page, {
    x: plateX, y, width: PLATE_WIDTH, height: BADGE_BOX_HEIGHT,
    text: label.badge, size: BADGE_FONT,
  });
  outlineCell(page, {
    x: plateX, y: y + BADGE_BOX_HEIGHT, width: PLATE_WIDTH, height: COUNTER_BOX_HEIGHT,
    // Always stated, even for a single piece: "1 of 1" is an answer, a blank is
    // a question about whether anything is missing from the pile.
    text: label.counter || "1 of 1", size: COUNTER_FONT,
  });

  return y + height;
}

function drawInstructions(page, label, top, measFont) {
  const left = LABEL_MARGIN;
  const right = LABEL_WIDTH - LABEL_MARGIN;
  const height = instructionHeight(measFont);

  // ── right: the drilling table ──
  // Centred in the band, like the dimensions beside it. Whichever of the two
  // columns is taller sets the band's height and fills it exactly, so the air
  // above the band equals the air below it.
  const tableX = right - DRILL_COLUMN_WIDTH;
  const y = top + Math.max(0, (height - drillTableHeight()) / 2);

  fillCell(page, {
    x: tableX, y, width: DRILL_COLUMN_WIDTH, height: DRILL_CAPTION_HEIGHT,
    text: "DRILLING", size: DRILL_CAPTION_FONT,
  });

  // Sized to what this label says, not to the longest answer there is. YES set
  // small enough that NOT RECORDED would also have fitted is YES made timid for
  // the sake of a label it is not on.
  const answer = label.drill === "Yes" ? "YES" : label.drill === "No" ? "NO" : LABEL_UNKNOWN.toUpperCase();
  outlineCell(page, {
    x: tableX, y: y + DRILL_CAPTION_HEIGHT, width: DRILL_COLUMN_WIDTH, height: DRILL_VALUE_HEIGHT,
    text: answer, bold: true,
    size: fitFont([answer], DRILL_COLUMN_WIDTH - CELL_PAD * 2, DRILL_VALUE_FONT, 6, true),
  });

  const qtyY = y + DRILL_CAPTION_HEIGHT + DRILL_VALUE_HEIGHT;
  const qtyCaption = boldTextWidth("QTY", DRILL_CAPTION_FONT) + CELL_PAD * 2;
  fillCell(page, {
    x: tableX, y: qtyY, width: qtyCaption, height: DRILL_QTY_HEIGHT,
    text: "QTY", size: DRILL_CAPTION_FONT,
  });
  outlineCell(page, {
    x: tableX + qtyCaption, y: qtyY, width: DRILL_COLUMN_WIDTH - qtyCaption, height: DRILL_QTY_HEIGHT,
    text: clean(label.hingeQty) || "-", size: DRILL_VALUE_FONT, bold: true,
  });

  // ── left: the dimensions, centred against the table beside them ──
  const rows = dimensionRows(label);
  const rowHeight = measFont * MEAS_LEADING;
  const markerSize = measFont * MARKER_RATIO;
  // Each row is a box the height of its ink, laid out from the top of the first
  // cap, so the block centres on what you can see rather than on the leading.
  const rowInk = Math.max(markerSize, measFont * (CAP + 0.21));
  let my = top + Math.max(0, (height - dimensionsInkHeight(measFont)) / 2);

  rows.forEach((row) => {
    // Centre the text's FULL extent, cap line to descender, inside the row box.
    // Centring the cap height alone left the descender hanging below the box,
    // so the band's ink reached lower than the band's measured height and the
    // gap under the divider came out short.
    const extent = measFont * (CAP + 0.21);
    const baseline = my + (rowInk - extent) / 2 + measFont * CAP;
    if (row.marker) {
      fillCell(page, {
        x: left, y: my + (rowInk - markerSize) / 2, width: markerSize, height: markerSize,
        text: row.marker, size: measFont * MARKER_TEXT_RATIO,
      });
    }
    const numberX = row.marker ? left + markerSize + measFont * MARKER_GAP_RATIO : left;
    page.fillColor(INK);
    page.text(row.value, numberX, baseline, measFont, { bold: true });
    if (label.struckSize) {
      page.strokeColor(INK);
      page.lineWidth(Math.max(1.2, measFont * 0.07));
      const strikeY = baseline - measFont * CAP * 0.42;
      page.line(numberX, strikeY, numberX + boldTextWidth(row.value, measFont), strikeY);
    }
    my += rowHeight;
  });

  return top + height;
}

function drawMaterial(page, label, y) {
  const left = LABEL_MARGIN;
  const { above, headline, below } = materialLines(label);
  let sy = y;

  page.fillColor(INK);
  above.lines.forEach((line) => {
    page.text(line, left, sy + above.size * CAP, above.size);
    sy += SPEC_LINE;
  });
  headline.lines.forEach((line) => {
    page.text(line, left, sy + headline.size * CAP, headline.size, { bold: true });
    sy += COLOUR_LINE;
  });
  below.lines.forEach((line) => {
    page.text(line, left, sy + below.size * CAP, below.size, { italic: true });
    sy += FINISH_LINE;
  });
  return y + materialHeight(label);
}

function drawProfiles(page, label, y) {
  const left = LABEL_MARGIN;
  const captionWidth = profileCaptionWidth();
  let sy = y;

  profileRows(label).forEach((row) => {
    fillCell(page, {
      x: left, y: sy, width: captionWidth, height: PROFILE_ROW_HEIGHT,
      text: row.caption, size: PROFILE_CAPTION_FONT, ground: CAPTION_GREY,
    });
    outlineCell(page, {
      x: left + captionWidth, y: sy, width: CONTENT_WIDTH - captionWidth, height: PROFILE_ROW_HEIGHT,
      text: row.text, size: row.size, align: "left", stroke: CAPTION_GREY,
    });
    sy += PROFILE_ROW_HEIGHT + PROFILE_ROW_GAP;
  });

  return y + profilesHeight();
}

function drawOrderDetails(page, label, y) {
  const left = LABEL_MARGIN;
  // Full width, like the divider above it: it is a section heading, not a chip.
  fillCell(page, {
    x: left, y, width: CONTENT_WIDTH, height: DETAILS_BAR_HEIGHT,
    text: "Order Details", size: DETAILS_BAR_FONT, ground: CAPTION_GREY, align: "left",
  });

  let sy = y + DETAILS_BAR_HEIGHT + 4;
  const valueX = left + detailsCaptionWidth();
  const room = CONTENT_WIDTH - detailsCaptionWidth();
  orderDetailRows(label).forEach(([caption, value]) => {
    const baseline = sy + DETAILS_FONT * CAP;
    page.fillColor(INK);
    page.text(caption, left, baseline, DETAILS_FONT, { bold: true });
    // Shrunk rather than wrapped: these are one fact each, and a wrapped order
    // number reads as two.
    page.text(value, valueX, baseline, fitFont([value], room, DETAILS_FONT, 5.5, false));
    sy += DETAILS_LINE;
  });
  return y + orderDetailsHeight();
}

function drawVariation(page, label, y, bandFont) {
  const band = label.band;
  if (!band) return y;
  const width = LABEL_WIDTH;

  if (band.tone === "solid") {
    page.fillColor(INK);
    page.rect(0, y, width, VARIATION_HEIGHT, { fill: true, stroke: false });
  } else if (band.tone === "hatch") {
    // Diagonal hatching, clipped to the strip. A pattern rather than a tint, so
    // it survives the print and cannot be mistaken for a solid bar.
    page.save();
    page.clipRect(0, y, width, VARIATION_HEIGHT);
    page.strokeColor(INK);
    page.lineWidth(0.8);
    for (let offset = -VARIATION_HEIGHT; offset < width + VARIATION_HEIGHT; offset += 5) {
      page.line(offset, y + VARIATION_HEIGHT, offset + VARIATION_HEIGHT, y);
    }
    page.restore();
    page.strokeColor(INK);
    page.lineWidth(1.2);
    page.line(0, y, width, y);
  } else {
    page.strokeColor(INK);
    page.lineWidth(0.9);
    page.line(0, y, width, y);
  }

  const baseline = centredBaseline(y, VARIATION_HEIGHT, bandFont);

  // On the hatched strip the text sits on knocked-out white, or the stripes run
  // straight through the letters and nothing is readable.
  if (band.tone === "hatch") {
    page.fillColor([1, 1, 1]);
    page.rect(LABEL_MARGIN - 3, y + 1.2, boldTextWidth(band.left, bandFont) + 6, VARIATION_HEIGHT - 2.4,
      { fill: true, stroke: false });
    const rightWidth = boldTextWidth(band.right, bandFont) + 6;
    page.rect(LABEL_WIDTH - LABEL_MARGIN - rightWidth + 3, y + 1.2, rightWidth, VARIATION_HEIGHT - 2.4,
      { fill: true, stroke: false });
  }

  page.fillColor(band.tone === "solid" ? [1, 1, 1] : INK);
  page.text(band.left, LABEL_MARGIN, baseline, bandFont, { bold: true });
  textRight(page, band.right, LABEL_WIDTH - LABEL_MARGIN, baseline, bandFont);
  return y + VARIATION_HEIGHT;
}

// The bands, top to bottom, each with the air it wants around it.
//
// A divider's gap is the LARGER of the two bands it separates, applied to both
// sides. Bands ask for different amounts — the masthead needs room under a logo
// this size, the profiles and order details read fine tight — but a divider
// with more space above it than below reads as a mistake, so no divider is ever
// given an uneven gap.
function bandsFor(page, label, logo, fonts) {
  return [
    { pad: MASTHEAD_PAD, draw: (top) => drawMasthead(page, label, top, logo) },
    { pad: SECTION_PAD, draw: (top) => drawInstructions(page, label, top, fonts.meas) },
    { pad: SECTION_PAD, draw: (top) => drawMaterial(page, label, top) },
    { pad: SECTION_PAD, draw: (top) => drawProfiles(page, label, top) },
    { pad: SECTION_PAD, draw: (top) => drawOrderDetails(page, label, top) },
  ];
}

function drawLabel(page, label, height, logo, fonts) {
  let y = LABEL_MARGIN;
  bandsFor(page, label, logo, fonts).forEach((band, index, all) => {
    if (index > 0) {
      const gap = Math.max(all[index - 1].pad, band.pad);
      y = divider(page, y + gap) + gap;
    }
    y = band.draw(y);
  });

  // Hard against the bottom edge of the label, not floating a margin above it:
  // it is a strip across the foot, and a gap under it reads as a mistake. Its
  // space is reserved whether or not it is used, so a label with a variation
  // and one without are laid out identically above the foot.
  if (label.band) {
    drawVariation(page, label, height - VARIATION_HEIGHT, fonts.band);
  }
  return height;
}

export function generateOrderLabelsPdf({ labels = [], manufacturingDate = null, stock = DEFAULT_LABEL_STOCK } = {}) {
  if (!labels.length) {
    throw new Error("No items on this order to label.");
  }
  const paper = resolveLabelStock(stock);

  // buildCutListLabels stamps the date, so both the PDF and the CSV carry the
  // same one. This only fills in for a caller that built rows by hand.
  const dated = labels.map((label) => ({
    ...label,
    manufacturingDate: label.manufacturingDate || manufacturingDate || new Date().toLocaleDateString("en-AU"),
  }));

  // Trimmed to its ink, so the height it is given is the height it appears.
  const logo = loadLogo(LABEL_LOGO, { trim: true });

  // The layout is measured, not assumed: the masthead and the specification
  // block are fixed, and the open middle absorbs whatever is left. What has to
  // fit is everything except that middle.
  const needed = Math.max(MIN_LABEL_HEIGHT, ...dated.map((label) => minimumLabelHeight(label, logo)));
  const contentHeight = Math.ceil(needed / MM) * MM;

  let height;
  if (paper.heightMm) {
    // A die-cut label is the size it is. Cropping is not an option: the thing
    // that would fall off the bottom is the drill instruction, and a door
    // drilled wrong is scrap. So say so instead.
    height = paper.heightMm * MM;
    if (contentHeight > height) {
      throw new Error(
        `These labels need ${Math.ceil(contentHeight / MM)}mm of height and the ${paper.label} is ${paper.heightMm}mm. Print them on the continuous roll, or shorten the notes on the longest line.`
      );
    }
  } else {
    height = Math.min(MAX_LABEL_HEIGHT, contentHeight);
  }

  // The layout is built around a 62mm web. A narrower stock added later would
  // need the blocks re-measured, so it fails here rather than drawing off the
  // edge of the label.
  if (paper.widthMm * MM !== LABEL_WIDTH) {
    throw new Error(`The label layout is built for 62mm stock, not ${paper.widthMm}mm.`);
  }
  const width = paper.widthMm * MM;
  const fonts = runFonts(dated, height, logo);

  // Stamped into the file so a printed label can be traced to the code that
  // drew it. Visible in any viewer under File > Properties.
  const pdf = new PdfDocument({ logo, producer: `Perth Cabinet Doors - ${LABEL_LAYOUT_VERSION}` });
  dated.forEach((label) => {
    pdf.addPage((page) => drawLabel(page, label, height, logo, fonts), { width, height });
  });
  return pdf.toBuffer();
}

export const LABEL_PAGE = { widthMm: 62, minHeightMm: 40 };
