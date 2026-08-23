// Workshop labels: one per physical piece in an order.
//
// A line with qty 4 is four labels, each numbered "3 of 4", because the label
// is stuck to a piece as it arrives. A label that said "Qty 4" could only be
// stuck to one of them.
//
// ── WHERE DRILLING COMES FROM ────────────────────────────────────────────────
// pcd_order_line_items has no hinge columns. hinge_holes and hinge_qty live on
// pcd_quote_line_items, and the order line reaches them through
// quote_line_item_id. So drilling is known for anything that came from a quote
// and genuinely unknown for a piece a variation added, which has nowhere to
// record it. Unknown prints as "Not recorded" rather than "No": a door that
// needed drilling and did not get it is scrap, and a blank is a question
// someone can go and answer.

import { labelVariationForItem } from "./pcd-cut-list-variations.js";
import { colourKey } from "./pcd-order-production-data.js";

export const LABEL_UNKNOWN = "Not recorded";

function text(value) {
  const clean = String(value ?? "").trim();
  return clean || "";
}

/**
 * Drilling for one order line.
 * Returns { drill, hinges }, where drill is "Yes", "No" or LABEL_UNKNOWN.
 *
 * The order line answers for itself now: hinge_holes and hinge_qty are copied
 * across when the order is raised, and a variation carries them too. The read
 * back through the quote line is kept for orders raised before those columns
 * existed, and it is a fallback rather than the source, because a line a
 * variation added has no quote line and used to print "Not recorded" for ever.
 *
 * null still means nobody recorded it, and that stays LABEL_UNKNOWN. Only a
 * real false is "No": a door that needed drilling and did not get it is scrap,
 * so a blank has to read as a question rather than an answer.
 */
export function drillingForItem(item, quoteLinesById) {
  const quoteLine = item?.quote_line_item_id ? quoteLinesById?.get(item.quote_line_item_id) : null;
  const drills = item?.hinge_holes ?? quoteLine?.hinge_holes ?? null;
  if (drills === null || drills === undefined) return { drill: LABEL_UNKNOWN, hinges: "" };
  if (!drills) return { drill: "No", hinges: "" };
  return { drill: "Yes", hinges: text(item?.hinge_qty || quoteLine?.hinge_qty) };
}

// The number out of "2 hinges", for the QTY cell under DRILLING. The field is
// free text, so it can be "2 hinges", "2", or something nobody anticipated; a
// count we cannot read is left as a dash rather than guessed at.
export function hingeCount(hinges) {
  const match = /(\d+)/.exec(text(hinges));
  return match ? match[1] : "";
}

// "17th August 2026". Long-hand on purpose: a workshop label read in a hurry
// should not depend on knowing whether we write day first or month first, and
// 12/07 and 07/12 are both plausible dates.
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function longDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  // 11th, 12th and 13th are the exceptions the naive rule gets wrong.
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th"
    : ["th", "st", "nd", "rd"][day % 10] || "th";
  return `${day}${suffix} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export const LABEL_SECTIONS = {
  cut: "Cut list",
  madeToOrder: "Made to order",
};

/**
 * Labels built from the production sheet itself, so the number on a label is
 * the panel number on the sheet. That is the whole point: the bench works down
 * the sheet and matches each piece to its line.
 *
 * Every panel in the order gets labels, whether we cut it or a supplier makes
 * it, because the sheet covers the whole order and every piece needs
 * identifying when it arrives. The label still says which section it came from,
 * as information rather than to tell two number 1s apart: numbers are unique
 * across the whole order now.
 *
 * A row for four identical pieces becomes four labels, each counted "2 of 4".
 *
 * Pieces a pending variation only proposes are skipped. They are not panels on
 * the order yet, they have no number, and a label on nothing is a label that
 * ends up on the wrong piece.
 */
// Formatted the same way the production rows are, or a was and a now label
// would state the same dimension in two different ways.
function sizeOf(spec) {
  const width = Number(spec?.width_mm) || 0;
  const height = Number(spec?.height_mm) || 0;
  if (!width && !height) return "";
  return `${height ? `${height}mm` : "-"} x ${width ? `${width}mm` : "-"}`;
}

function materialOf(spec) {
  return [spec?.material, spec?.finish, spec?.colour].map(text).filter(Boolean).join(" - ");
}

// The same three facts kept apart, for a variation label that has to restate a
// whole specification rather than override one joined string.
function partsOf(spec) {
  return {
    materialName: text(spec?.material),
    colourName: text(spec?.colour),
    finishName: text(spec?.finish),
  };
}

// Three answers, never a blank box.
//
// A blank reads as "we forgot to print it". These say which of the two silences
// it is: the question does not apply to this piece, or it does and nobody has
// answered it. Only the second one is somebody's job to go and fix.
export const NOT_APPLICABLE = "Not Applicable";
export const NOT_LISTED = "Not Listed";

// cutEdgingDisplay falls back to this when a line has no edge profile recorded.
// It is a non-answer dressed as one, so on a label it is called what it is.
const EDGING_PLACEHOLDER = "As specified";

// The material block as the label sets it: the colour is the headline, the
// board and thickness sit above it, the brand and finish below.
//
// A carcass panel often has no colour recorded, only a board. Rather than print
// a label with an empty headline and the board relegated to the small line, the
// board becomes the headline and the line above it carries the thickness alone.
function materialBlock({ materialName, colourName, finishName }, thickness, library) {
  const thick = text(thickness) && text(thickness) !== "-" ? `${text(thickness)} Thickness` : "";
  // The line's own finish wins when it has one, but it usually does not: the
  // finish is a property of the colour, and that is recorded once in the
  // library rather than copied onto every line that uses it.
  const finish = text(finishName) || text(library?.finish);
  if (!colourName) {
    return { above: thick, headline: materialName || "-", below: finish };
  }
  return {
    above: [materialName, thick].filter(Boolean).join(" - "),
    headline: colourName,
    below: [text(library?.supplier), finish].filter(Boolean).join(" - "),
  };
}

// A band is the only thing on the label that says what to do with the piece.
// Three treatments, no colour: solid is live work, hatched is hold, outline is
// superseded. The same language the production sheet uses.
function bandFor(tone, left, right) {
  return { tone, left, right };
}

export function buildCutListLabels({
  order,
  cutRows = [],
  madeToOrderRows = [],
  proposedRows = [],
  items = [],
  quoteLines = [],
  variationContext = null,
  manufacturingDate = null,
  colourSuppliers = {},
} = {}) {
  const quoteLinesById = new Map((quoteLines || []).map((line) => [line.id, line]));
  const itemsById = new Map((items || []).map((item) => [item.id, item]));
  const printedOn = manufacturingDate || longDate(new Date());
  // When the order was raised. Fixed for the life of the order, unlike the
  // manufacturing date, which is whenever these labels were printed.
  const raisedOn = longDate(order?.created_at);

  // One physical piece can need two labels, so this returns a list per piece
  // rather than a single label. Which of the two is cuttable is the whole point.
  const variantsFor = (row, item) => {
    const variation = variationContext ? labelVariationForItem(item, variationContext) : null;
    if (!variation) return [{}];

    const short = variation.variation.replace(/^PCD-V-\d+-/, "");

    if (variation.kind === "added") {
      return [{ band: bandFor("solid", `ADDED - VAR ${short}`, "CUT THIS") }];
    }

    if (variation.kind === "removal-proposed") {
      return [{ band: bandFor("hatch", `REMOVAL PROPOSED - VAR ${short}`, "HOLD") }];
    }

    if (variation.kind === "changed") {
      // Settled: the old label is dead, the new one is the work.
      const was = variation.was;
      return [
        {
          band: bandFor("outline", `WAS - VAR ${short} - 1 OF 2`, "SUPERSEDED"),
          override: {
            size: sizeOf(was) || row.size,
            material: materialOf(was) || row.material,
            parts: was ? partsOf(was) : null,
          },
          struckSize: Boolean(sizeOf(was)) && sizeOf(was) !== row.size,
        },
        { band: bandFor("solid", `NOW - VAR ${short} - 2 OF 2`, "CUT THIS") },
      ];
    }

    if (variation.kind === "changed-proposed") {
      // Nothing is decided, so neither label may be cut to.
      const proposed = variation.proposed;
      const proposedSize = sizeOf(proposed);
      const proposedMaterial = materialOf(proposed);
      return [
        { band: bandFor("hatch", `CURRENT - VAR ${short} - 1 OF 2`, "HOLD") },
        {
          band: bandFor("hatch", `PROPOSED - VAR ${short} - 2 OF 2`, "DO NOT CUT"),
          override: {
            size: proposedSize || row.size,
            material: proposedMaterial || row.material,
            parts: proposed ? partsOf(proposed) : null,
          },
          wasMaterial: proposedMaterial && proposedMaterial !== row.material ? row.material : "",
          struckSize: Boolean(proposedSize) && proposedSize !== row.size,
        },
      ];
    }

    return [{}];
  };

  const fromRows = (rows, section, options = {}) => rows
    .filter((row) => row.panelNo)
    .flatMap((row) => {
      const item = itemsById.get(row.itemId);
      const total = Math.max(1, Math.floor(Number(row.qty) || 1));
      const { drill, hinges } = drillingForItem(item, quoteLinesById);
      const variants = options.band ? [{ band: options.band }] : variantsFor(row, item);

      return Array.from({ length: total }, (_, index) => index).flatMap((index) =>
        variants.map((variant) => {
          const parts = variant.override?.parts || {
            materialName: text(row.materialName),
            colourName: text(row.colourName),
            finishName: text(row.finishName),
          };
          // Undefined when the colour is not in the library, or when the row is
          // a cabinet piece with no colour of its own. The line then falls back
          // to whatever the order line itself recorded.
          const library = colourSuppliers[colourKey(parts.colourName)];
          // The line's OWN brand wins over the library lookup. The lookup keys
          // on the colour name alone and takes the first row that matches, and
          // two suppliers stocking the same colour name is normal, so it can
          // name the wrong brand with no way to tell. The order line now carries
          // the brand the quote actually recorded; the lookup is only for lines
          // raised before it did.
          const lineSupplier = text(item?.supplier_name);
          const block = materialBlock(
            parts,
            row.thickness,
            lineSupplier ? { ...library, supplier: lineSupplier } : library
          );

          return {
          orderNumber: text(order?.order_number),
          customer: text(order?.customer_name),
          manufacturingDate: printedOn,
          orderDate: raisedOn,
          badge: String(row.panelNo),
          section,
          item: text(row.source || row.item),
          piece: text(row.piece),
          position: index + 1,
          total,
          counter: total > 1 ? `${index + 1} of ${total}` : "",
          size: text(variant.override?.size || row.size),
          thickness: text(row.thickness),
          material: text(variant.override?.material || row.material),
          materialAbove: block.above,
          colourHeadline: block.headline,
          materialBelow: block.below,
          // The front profile is the entire specification of a thermolaminated
          // door: no edge tape, the shape is pressed into the face. A carcass
          // panel does not have one at all, which is a different answer from a
          // door where nobody recorded it.
          profile: text(row.profile) || (row.profileApplies ? NOT_LISTED : NOT_APPLICABLE),
          edge: text(row.edging) && text(row.edging) !== EDGING_PLACEHOLDER
            ? text(row.edging)
            : NOT_LISTED,
          // A supplier made piece has to say so on the piece. It arrives in the
          // same delivery as work we cut, and the difference is not visible.
          madeToOrder: section === LABEL_SECTIONS.madeToOrder,
          drill,
          hinges,
          // The number under DRILLING. Empty when there is nothing to drill, so
          // the cell reads "-" rather than inventing a count.
          hingeQty: drill === "Yes" ? hingeCount(hinges) : "",
          // Boxed only when it has something to say. On a panel or a shelf the
          // answer is No, and a large box saying No is a large box saying
          // nothing. Not recorded is boxed because it is the one that quietly
          // sends an undrilled door out.
          drillLoud: drill !== "No",
          band: variant.band || null,
          struckSize: Boolean(variant.struckSize),
          wasMaterial: text(variant.wasMaterial),
          };
        })
      );
    });

  return [
    ...fromRows(cutRows, LABEL_SECTIONS.cut),
    ...fromRows(madeToOrderRows, LABEL_SECTIONS.madeToOrder),
    // A piece a pending variation proposes gets a label so it can be identified
    // if it is made early, marked so it cannot be mistaken for approved work.
    ...fromRows(proposedRows, LABEL_SECTIONS.cut, {
      band: bandFor("hatch", "PROPOSED", "DO NOT CUT"),
    }),
  ];
}

export const LABEL_CSV_COLUMNS = [
  { key: "badge", header: "Cut list no" },
  { key: "section", header: "Section" },
  { key: "orderNumber", header: "Order" },
  { key: "customer", header: "Customer" },
  { key: "orderDate", header: "Order Date" },
  { key: "manufacturingDate", header: "Manufacturing Date" },
  { key: "item", header: "Item" },
  { key: "piece", header: "Cut piece" },
  { key: "counter", header: "Piece" },
  { key: "size", header: "Size" },
  { key: "thickness", header: "Thickness" },
  { key: "material", header: "Material / colour" },
  { key: "edge", header: "Edge" },
  { key: "profile", header: "Profile" },
  { key: "drill", header: "Drill" },
  { key: "hinges", header: "Hinges" },
  { key: "hingeQty", header: "Hinge Qty" },
  { key: "fulfilment", header: "Fulfilment" },
  { key: "warning", header: "Warning" },
];

function csvCell(value) {
  const cell = String(value ?? "");
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * One row per label, for P-touch Editor's database merge. The header row is
 * the field names it offers when the layout is linked to the file.
 */
export function labelsToCsv(labels = []) {
  const header = LABEL_CSV_COLUMNS.map((column) => csvCell(column.header)).join(",");
  const rows = labels.map((label) => LABEL_CSV_COLUMNS.map((column) => csvCell(label[column.key])).join(","));
  // A BOM, so Excel opens it as UTF-8 rather than mangling the first heading.
  return `﻿${[header, ...rows].join("\r\n")}\r\n`;
}
