// How a size is written down, everywhere.
//
// HEIGHT FIRST, THEN WIDTH, THEN DEPTH. A door is 2100 high and 600 wide, and
// that is the order it is said out loud on the bench, so it is the order it is
// written in a quote, an email, a label, a PDF and on screen.
//
// WHY THIS FILE EXISTS. The same size string was being built in a dozen places,
// each with its own idea of the order, so the quote editor's inputs were
// changed to height first while its own display line still read width first.
// One definition means the next change happens once.

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

const round = (value) => {
  const n = num(value);
  return n === null ? null : Math.round(n);
};

// The parts of a size, in the order they are always said. Anything missing is
// left out rather than printed as a zero.
export function dimensionParts({ height, width, depth } = {}) {
  return [round(height), round(width), round(depth)];
}

// "2100 x 600" or "2100 x 600 x 560". `unit` is appended once at the end
// rather than after every number, which is how a person writes it.
export function dimensionText({ height, width, depth, unit = "", dash = "-" } = {}) {
  const parts = dimensionParts({ height, width, depth });
  // A depth on its own is not a size. Printed first it would read as a height,
  // which is worse than saying nothing.
  if (parts[0] === null && parts[1] === null) return "";

  // Depth only ever trails a height and a width, so a lone depth is not a size.
  const shown = parts[2] === null ? parts.slice(0, 2) : parts;
  const text = shown.map((p) => (p === null ? dash : String(p))).join(" x ");
  return unit ? `${text}${unit}` : text;
}

// Each number carrying its own unit: "2100mm x 600mm". Used where the two
// numbers can be read apart from each other, like a label.
export function dimensionTextEach({ height, width, depth, unit = "mm", dash = "-" } = {}) {
  const parts = dimensionParts({ height, width, depth });
  if (parts[0] === null && parts[1] === null) return "";
  const shown = parts[2] === null ? parts.slice(0, 2) : parts;
  return shown.map((p) => (p === null ? dash : `${p}${unit}`)).join(" x ");
}

// Spelled out, for somewhere a bare pair of numbers would not be obvious.
// One dimension on its own still says which it is.
export function dimensionWords({ height, width, depth } = {}) {
  const [h, w, d] = dimensionParts({ height, width, depth });
  const parts = [];
  if (h !== null) parts.push(`${h}mm high`);
  if (w !== null) parts.push(`${w}mm wide`);
  if (d !== null) parts.push(`${d}mm deep`);
  return parts.join(" x ");
}

// The labels on a form, in the order the fields must appear.
export const DIMENSION_FIELDS = [
  { key: "height_mm", short: "H", label: "Height mm" },
  { key: "width_mm", short: "W", label: "Width mm" },
  { key: "depth_mm", short: "D", label: "Depth mm" },
];

// A row straight off a table, which is where most of these come from.
export function dimensionTextFor(row, options = {}) {
  return dimensionText({
    height: row?.height_mm ?? row?.height,
    width: row?.width_mm ?? row?.width,
    depth: options.withDepth ? row?.depth_mm ?? row?.depth : null,
    ...options,
  });
}
