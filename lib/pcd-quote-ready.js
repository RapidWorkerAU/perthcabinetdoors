// One answer to "have we been given enough to quote this line?", shared by
// every screen that asks it.
//
// WHY THIS EXISTS. The same question was being answered three different ways
// and none of them agreed:
//
//   - the website's request form let a row through if it had ANY value on it,
//     so a row with a material and a thickness and no colour was sent as a real
//     line. 21 of the 82 request lines in the database have no colour on them.
//   - the request API's only check was validateQuoteLineColour, which starts
//     `if (!material || !thickness || !colour) return true`. It checks that a
//     colour that IS there is real, and waves through one that is missing.
//   - the conversion to a quote found out last, when the board resolver could
//     not price the line, by which point the customer is gone and the line sits
//     at $0 on a quote nobody can send.
//
// Board prices are held per material, thickness, finish and colour, so all four
// have to be there or there is no price to look up. Sizes decide the area, so a
// flat board line with no size prices at $0 however good the rate is. That is
// the whole rule, and it now lives here so the form, the API, the conversion
// and the design import all apply exactly the same one.
//
// The wording is what a customer or a staff member reads, so it is written in
// plain words rather than field names.

import { materialsForProductType } from "./pcd-materials";
import { isHardwareType } from "./pcd-product-fields";

// Lines that are not cut from a board. Hardware is a unit cost, a benchtop is
// priced from its own material list, so neither has a board spec to be missing.
export const BOARD_FREE_PRODUCT_TYPES = ["Hardware", "Benchtop"];

// A cabinet is the one line that is complete on its own. It is priced from its
// cut list rather than as a flat sheet, so it carries no width or height on
// purpose, and it lands on the quote flagged "Needs configuration" for someone
// to set up from its description. Its board can legitimately be blank too: on a
// cabinet the customer already owns (an IKEA carcass they are only buying fronts
// for) we are not making the box, so naming a board for it would be wrong.
export const CABINET_PRODUCT_TYPE = "base_cabinet";

function text(value) {
  return String(value ?? "").trim();
}

function size(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Accepts a line in any of the three shapes the flows use: the website form's
// (width / height), a stored request line's (width_mm / height_mm) and a quote
// line's (also width_mm / height_mm). Everything else is named the same in all
// three.
function readLine(line = {}) {
  return {
    productType: text(line.productType ?? line.product_type ?? line.type),
    material: text(line.material),
    thickness: text(line.thickness),
    colour: text(line.colour),
    width: size(line.width_mm ?? line.width),
    height: size(line.height_mm ?? line.height),
    // Which catalogue item a hardware line is for. Named three ways for the
    // same three shapes as everything above.
    hardwareId: text(line.hardwareCatalogueId ?? line.hardware_catalogue_id ?? line.hardwareId),
  };
}

/**
 * What is missing before this line can be priced.
 *
 * `requireSize` is what separates the two flows, and it is a real difference
 * rather than a leniency:
 *
 *   - on the website form a person TYPES the width and the height, so leaving
 *     one out is something they can and should fix before sending it.
 *   - from a design planner every size is worked out from what they drew. Where
 *     one genuinely is not known yet (a filler panel closing a gap that has to
 *     be measured on site) the line says so in its notes and goes through on
 *     purpose. Refusing to take the design over it would lose the whole lead
 *     over a number the customer was never asked for.
 *
 * @returns {Array<{field: string, message: string}>} empty when the line is ready
 */
export function lineGaps(line = {}, { requireSize = true } = {}) {
  const read = readLine(line);

  // A hardware line is a bought item and a quantity. No board, no size, no
  // finish. But it must say WHICH item: this used to pass anything through,
  // so "handles" arrived as a priceable line and somebody had to email and
  // ask which ones. The form offers the catalogue now, so the answer exists.
  if (isHardwareType(read.productType)) {
    return read.hardwareId ? [] : [{ field: "hardware", message: "which hardware you need" }];
  }
  if (BOARD_FREE_PRODUCT_TYPES.includes(read.productType)) return [];

  const gaps = [];
  // Without this the line lands on the quote with a blank Type, which decides
  // how it is priced, cut and listed. The form's dropdown opens on a disabled
  // placeholder, so leaving it is a real thing a person does.
  if (!read.productType) gaps.push({ field: "type", message: "a product type" });
  // A cabinet is complete with a type alone. See CABINET_PRODUCT_TYPE above.
  if (read.productType === CABINET_PRODUCT_TYPE) return gaps;

  if (!read.material) {
    gaps.push({ field: "material", message: "a material" });
  } else if (!materialsForProductType(read.productType).includes(read.material)) {
    // Named both ways round, because "a material" alone would send somebody
    // back to a dropdown that looks already answered.
    gaps.push({
      field: "material",
      message: `a material we can make a ${String(read.productType).toLowerCase()} from (${read.material} is not one)`,
    });
  }
  // Held per thickness, so this is not a detail that can be filled in later.
  if (!read.thickness) gaps.push({ field: "thickness", message: "a thickness" });
  if (!read.colour) gaps.push({ field: "colour", message: "a colour" });

  if (requireSize) {
    if (!read.width) gaps.push({ field: "width", message: "a width" });
    if (!read.height) gaps.push({ field: "height", message: "a height" });
  }

  return gaps;
}

/** Just the field names, for marking up a form. */
export function missingFields(line = {}, options) {
  return lineGaps(line, options).map((gap) => gap.field);
}

export function lineIsReady(line = {}, options) {
  return lineGaps(line, options).length === 0;
}

/** "a thickness and a colour", to drop into a sentence. */
export function describeGaps(gaps = []) {
  const parts = gaps.map((gap) => gap.message);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Every line that is not ready, with a label a person can find the row by.
 *
 * @param {Array} lines
 * @param {(line: object, index: number) => string} label
 */
export function unreadyLines(lines = [], label = (line, index) => `Line ${index + 1}`, options) {
  return lines
    .map((line, index) => ({ index, label: label(line, index), gaps: lineGaps(line, options) }))
    .filter((entry) => entry.gaps.length > 0);
}
