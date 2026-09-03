// WHERE THE HINGES GO.
//
// One module for the four things a drilled door has to say, so the website
// form, the quote editor, the order, the production sheet and the Excel order
// form cannot come to different answers about the same door.
//
//   how many        how many cups that door hangs on
//   which side      left or right, looking at the front
//   the bottom cup  measured up from the bottom edge
//   the top cup     measured down from the top edge
//
// WHY THE TOP IS MEASURED FROM THE TOP. Because that is how a joiner's spec
// sheet reads and how somebody matching an existing run has it written down.
// It is turned round to a distance from the bottom before anything is worked
// out, because that is the only datum the two ends share.
//
// WHY THERE IS NO "PAIR". A door is hinged left or it is hinged right. A pair
// is two doors drilled as mirror images, so it is two lines. Offering "pair"
// as one answer let a pair be ordered on a single line, which the workshop then
// had to interpret, and interpreting handing is how a pair reaches a customer
// as two identical doors.

/** The only two answers. See above. */
export const HINGE_SIDES = ["Left", "Right"];

/** What the form offers for the number of cups. */
export const HINGE_COUNTS = [2, 3, 4, 5, 6];

// HOW MANY CUPS A DOOR OF THAT HEIGHT HANGS ON.
//
// One rule, in one place, because it is answered in two: the Excel order form
// fills the column in as an Excel formula, and everything on this side reads it
// from here. Two copies of a rule about a number is two answers to "why does
// the sheet say three and the quote say two".
//
// It is a starting point rather than a verdict. Every place that uses it lets
// the number be changed, because weight is what actually decides it and a
// height is only a proxy for weight: a 21mm profiled door is heavier than an
// 18mm flat one of exactly the same size.
export const HINGE_COUNT_BREAKS = [
  { upToMm: 900, hinges: 2 },
  { upToMm: 1600, hinges: 3 },
  { upToMm: 2000, hinges: 4 },
];

/** The most any door gets, past the last break. */
const HINGE_COUNT_ABOVE = 5;

/**
 * How many hinges a door of this height starts at.
 *
 * Zero for a height we have not got, so a caller can tell "no answer yet" from
 * "two", and a blank column stays blank rather than filling itself in with a
 * guess about a door nobody has measured.
 */
export function hingesForHeight(heightMm) {
  const height = Number(heightMm);
  if (!Number.isFinite(height) || height <= 0) return 0;
  const found = HINGE_COUNT_BREAKS.find((step) => height <= step.upToMm);
  return found ? found.hinges : HINGE_COUNT_ABOVE;
}

const text = (value) => String(value ?? "").trim();

/**
 * How many cups, from whatever the line happens to carry.
 *
 * `hinge_qty` is free text on a request and an order line ("3 hinges") and the
 * quote also holds a numeric `hinge_drilling_qty` for pricing. Both are read
 * here so a line cannot be counted one way when it is priced and another way
 * when it is drilled.
 */
export function hingeCount(line) {
  if (line === null || line === undefined) return 0;
  // A bare number or a bare string, for callers that only have the one value.
  if (typeof line === "number") return Number.isFinite(line) ? Math.max(0, Math.round(line)) : 0;
  if (typeof line === "string") {
    const match = line.match(/\d+/);
    return match ? Number(match[0]) : 0;
  }
  const written = text(line.hinge_qty ?? line.hingeQty);
  const match = written.match(/\d+/);
  if (match) return Number(match[0]);
  const priced = Number(line.hinge_drilling_qty ?? line.hingeDrillingQty);
  return Number.isFinite(priced) && priced > 0 ? Math.round(priced) : 0;
}

/** Left or Right, or "" for anything we do not recognise. */
export function normaliseHingeSide(value) {
  const wanted = text(value).toLowerCase();
  if (!wanted) return "";
  return HINGE_SIDES.find((side) => side.toLowerCase() === wanted) || "";
}

function millimetres(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** The measurements off a line, in whichever of the three shapes it arrives. */
export function readHinges(line = {}) {
  const drills = Boolean(line.hinge_holes ?? line.hingeHoles ?? false);
  return {
    drills,
    count: drills ? hingeCount(line) : 0,
    side: normaliseHingeSide(line.hinge_side ?? line.hingeSide),
    fromBottom: millimetres(line.hinge_from_bottom_mm ?? line.hingeFromBottomMm),
    fromTop: millimetres(line.hinge_from_top_mm ?? line.hingeFromTopMm),
    middles: readMiddles(line.hinge_middles_mm ?? line.hingeMiddlesMm),
    height: millimetres(line.height_mm ?? line.height),
  };
}

/**
 * The middle cups off a line. Stored as a list of numbers, and accepted as a
 * comma separated string too, because that is what a spreadsheet cell and a
 * hand typed value look like.
 */
export function readMiddles(value) {
  if (Array.isArray(value)) return value.map(millimetres).filter((mm) => mm !== null);
  const written = text(value);
  if (!written) return [];
  return written
    .split(/[,;/]+/)
    .map((part) => millimetres(part))
    .filter((mm) => mm !== null);
}

/**
 * Where the middle cups go when nobody has said.
 *
 * Evenly between the bottom cup and the top one, which is what the workshop
 * does anyway and what formatHingeNote in lib/pcd-door-utils.js already
 * describes. Empty when there is nothing to space between, either because the
 * door hangs on two hinges or because the two ends have not been given.
 */
export function evenMiddles({ height, count, fromBottom, fromTop } = {}) {
  const h = millimetres(height);
  const bottom = millimetres(fromBottom);
  const top = millimetres(fromTop);
  const n = Number(count) || 0;
  if (!h || bottom === null || top === null || n < 3) return [];

  const topFromBottom = h - top;
  const span = topFromBottom - bottom;
  // A top cup at or below the bottom one is a door somebody has mistyped. Even
  // spacing has no answer for it, so it gets none rather than a run of numbers
  // that look deliberate.
  if (span <= 0) return [];

  const out = [];
  for (let i = 1; i <= n - 2; i += 1) {
    out.push(Math.round(bottom + (span * i) / (n - 1)));
  }
  return out;
}

/**
 * Every cup on the door, measured from the BOTTOM edge, bottom first.
 *
 * One datum for the whole door, because whoever is marking it out has a tape
 * hooked over one end and should not be doing arithmetic to find the second
 * number.
 *
 * Null when we are setting the pattern ourselves: with no bottom and no top
 * there is nothing to report, and reporting a guess would be worse than saying
 * "our standard positions".
 */
export function cupPositions(line = {}) {
  const read = readHinges(line);
  if (!read.drills || read.fromBottom === null || read.fromTop === null || !read.height) return null;
  const topFromBottom = read.height - read.fromTop;
  const middles = read.middles.length
    ? read.middles
    : evenMiddles({ height: read.height, count: read.count, fromBottom: read.fromBottom, fromTop: read.fromTop });
  return [read.fromBottom, ...middles, topFromBottom];
}

/** True when the customer has left the whole pattern to us. */
export function usesStandardPositions(line = {}) {
  const read = readHinges(line);
  return read.drills && (read.fromBottom === null || read.fromTop === null);
}

/**
 * The drilling in words, for a screen or a printed sheet.
 *
 * Returned as separate lines rather than one sentence so a caller can put them
 * where they fit. Empty when the line is not drilled, so a caller can add them
 * without asking whether there is anything to add.
 */
export function hingeSummaryLines(line = {}) {
  const read = readHinges(line);
  if (!read.drills) return [];

  const out = [];
  out.push(`Hinge Holes Drilled: ${read.count || "-"} quantity`);
  if (read.side) out.push(`Hinged ${read.side.toLowerCase()}`);

  const cups = cupPositions(line);
  if (!cups) {
    out.push("Hinge positions: standard PCD positions");
  } else {
    out.push(`Hinge cups from bottom: ${cups.join(", ")}mm`);
  }
  return out;
}

/** The same thing on one line, for somewhere with no room. */
export function hingeSummaryText(line = {}) {
  return hingeSummaryLines(line).join(" · ");
}

/**
 * What is wrong with the drilling on this line, in the customer's words.
 *
 * Deliberately not part of lib/pcd-quote-ready.js: a door with no measurements
 * is perfectly quotable, because blank means our standard positions. These are
 * the ones that are actually contradictory.
 */
export function hingeProblems(line = {}) {
  const read = readHinges(line);
  if (!read.drills) return [];

  const problems = [];
  if (!read.count) problems.push("how many hinges per door");
  if (!read.side) problems.push("which side the hinges go");

  const oneEnd = (read.fromBottom === null) !== (read.fromTop === null);
  if (oneEnd) problems.push("both hinge positions, or neither");

  if (read.fromBottom !== null && read.fromTop !== null && read.height) {
    if (read.height - read.fromTop <= read.fromBottom) {
      problems.push("hinge positions that do not overlap");
    }
  }
  return problems;
}
