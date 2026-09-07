// WHAT WE CAN ACTUALLY PRESS, in millimetres.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Nothing anywhere checked a size. The website's request form asked only that
// height and width were greater than zero, the quote editor asked nothing at
// all, and the first anybody found out that a 3400mm door cannot be made was
// when it reached the workshop, by which point it had been quoted, accepted and
// paid a deposit on.
//
// ── WHY THE NUMBERS ARE IN CODE ──────────────────────────────────────────────
//
// A limit is not a preference. A wrong number in an admin screen quietly lets
// through work we cannot make, and the cost of that lands after the money has
// changed hands. So these are constants, the same way ROOM_LIMITS in
// lib/pcd-public-design.js is, and changing one is a deliberate edit rather
// than a typo in a settings box.
//
// ── WHAT A MISSING LIMIT MEANS ───────────────────────────────────────────────
//
// A material and brand pair we have not listed has NO limit, and nothing is
// checked against it. That is deliberate and it is honest: an invented limit is
// worse than none, because it blocks real work. Adding a pair below is how a
// board starts being checked.
//
// ── WHAT THIS DOES NOT DECIDE ────────────────────────────────────────────────
//
// Whether a size is missing. That is lib/pcd-quote-ready.js, which answers
// "have we been given enough to quote this line". This answers the different
// question "is what we have been given something we can make", and a line can
// fail one without failing the other.

import { normaliseMaterialKey } from "./pcd-materials";

/**
 * One row a material and brand pair.
 *
 * `material` is the canonical slug from lib/pcd-materials.js, `supplier` is the
 * brand in lower case, matched however it is spelt on the line.
 */
export const SIZE_LIMITS = [
  {
    material: "thermolaminate",
    supplier: "polytec",
    minHeightMm: 35,
    maxHeightMm: 3050,
    minWidthMm: 35,
    maxWidthMm: 1200,
  },
];

function text(value) {
  return String(value ?? "").trim();
}

function size(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * A line in any of the shapes our flows use.
 *
 * The website form carries height / width / supplierName, a stored request line
 * and a quote line carry height_mm / width_mm / supplier_name. Everything reads
 * the same line through here so no caller has to know which shape it holds.
 */
export function readSizeInputs(line = {}) {
  return {
    material: text(line.material),
    supplier: text(line.supplier_name ?? line.supplierName ?? line.supplier),
    heightMm: size(line.height_mm ?? line.height),
    widthMm: size(line.width_mm ?? line.width),
  };
}

/** The limit for a material and brand, or null when we have not set one. */
export function sizeLimitFor(material, supplier) {
  const materialKey = normaliseMaterialKey(material);
  const brand = text(supplier).toLowerCase();
  if (!materialKey || !brand) return null;
  return (
    SIZE_LIMITS.find((limit) => limit.material === materialKey && limit.supplier === brand) || null
  );
}

/** "35 to 3050mm" and "35 to 1200mm", for a hint beside the boxes. */
export function sizeLimitRange(limit) {
  if (!limit) return null;
  return {
    height: `${limit.minHeightMm} to ${limit.maxHeightMm}mm`,
    width: `${limit.minWidthMm} to ${limit.maxWidthMm}mm`,
  };
}

function boardLabel(material, supplier) {
  return [text(supplier), text(material)].filter(Boolean).join(" ");
}

/**
 * Is this line a size we can make?
 *
 * Returns a message a customer can act on for each of height and width, and an
 * empty string where there is nothing wrong. A size that has not been entered
 * yet is not an error here: an empty box is a missing answer, not a wrong one.
 *
 * @returns {{ limit: object|null, ok: boolean, height: string, width: string }}
 */
export function checkSize(line = {}) {
  const { material, supplier, heightMm, widthMm } = readSizeInputs(line);
  const limit = sizeLimitFor(material, supplier);
  if (!limit) return { limit: null, ok: true, height: "", width: "" };

  const label = boardLabel(material, supplier);
  const height =
    heightMm && (heightMm < limit.minHeightMm || heightMm > limit.maxHeightMm)
      ? `${label} is made between ${limit.minHeightMm} and ${limit.maxHeightMm}mm high.`
      : "";
  const width =
    widthMm && (widthMm < limit.minWidthMm || widthMm > limit.maxWidthMm)
      ? `${label} is made between ${limit.minWidthMm} and ${limit.maxWidthMm}mm wide.`
      : "";

  return { limit, ok: !height && !width, height, width };
}

/** Every message on a line, for a caller that just wants to say what is wrong. */
export function sizeProblems(line = {}) {
  const result = checkSize(line);
  return [result.height, result.width].filter(Boolean);
}
