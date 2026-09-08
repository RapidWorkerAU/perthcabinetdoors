// HOW A QUOTE LINE IS NAMED AND DESCRIBED TO THE CUSTOMER.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The quote viewer stacked four things under every line: the product type, then
// the material, the finish and the colour, each falling back to "N/A" when it
// was blank. That reads correctly for a door and it reads as a fault for a
// piece of hardware, which has no board at all: the customer saw the word
// "Hardware" and three N/As, and never saw WHICH hinge they were being quoted
// for even though the line knew its name all along.
//
// A hardware line is a different kind of thing and has to be described as one:
// what kind it is, and which item. So the question "what does this line say to
// the customer" is answered here, once, rather than in each place that shows a
// line.
//
// ── WHAT IT DOES NOT DECIDE ──────────────────────────────────────────────────
//
// Nothing about presentation. It hands back words; the placeholder for a blank,
// the order of the rows and how they are marked up belong to the screen or the
// document showing them.

import { isCabinetType, isHardwareType } from "./pcd-product-fields";
import { hardwareTypeLabel } from "./pcd-hardware-types";

const text = (value) => String(value ?? "").trim();

export function isHardwareLine(line) {
  return isHardwareType(line?.product_type);
}

export function isCabinetLine(line) {
  return isCabinetType(line?.product_type);
}

/**
 * WHAT THE LINE IS, in one short phrase, for the top of the row.
 *
 * A hardware line is named by its KIND rather than by the bare word "Hardware".
 * "Hinge" and "Drawer runner" are what a customer is scanning a quote for, and
 * "Hardware" on six rows in a row is indistinguishable at a glance.
 *
 * The kind falls back to "Hardware" on a line saved before the kind was
 * recorded, which is the honest answer rather than a guess made from the item
 * name.
 */
export function lineHeading(line) {
  if (isCabinetLine(line)) return "Base Cabinet";
  if (isHardwareLine(line)) {
    const kind = text(line?.hardware_type);
    return kind ? hardwareTypeLabel(kind) : "Hardware";
  }
  return text(line?.product_type) || text(line?.product_name) || "Quote item";
}

/**
 * The lines that sit under the heading.
 *
 * Each entry is `{ key, label, value }`. `value` may be empty, and what to show
 * then is the caller's decision: a table that has always printed "N/A" for a
 * blank finish keeps doing it, and a hardware row has nothing to print a
 * placeholder for in the first place.
 *
 * A HARDWARE LINE'S OWN ROWS, not the board ones left blank:
 *
 *   the item      which hinge, which handle. It is the whole answer to what is
 *                 being bought and it was the one thing never shown.
 *   supplied by   only when the customer is supplying it themselves, because
 *                 that is the case that changes what they are paying for. "We
 *                 supply" is the assumption and saying it adds nothing.
 */
/**
 * EVERY ROW READS THE SAME SHAPE: a bold label, then the quiet detail.
 *
 * The bold line is WHAT KIND OF THING IT IS, on every row without exception.
 * A Door, a Filler, a Hinge. Everything else about that line sits under it in
 * the same quieter type: which hinge it is, who supplies it, and the note.
 *
 * That is the shape the PDF draws, and it is the reason a hardware row does
 * not read differently from the door row directly above it.
 *
 * WHAT A BOARD LINE DOES NOT GET is its material, finish and colour. Those
 * are said once at the top of the group and putting them back on every row
 * is what the grouping exists to stop. lineSubLines returns them, so a
 * caller has to ask isHardwareLine before it prints them.
 */
export function lineDisplayName(line) {
  return lineHeading(line);
}

export function lineSubLines(line) {
  if (isHardwareLine(line)) {
    const out = [{ key: "item", label: "Item", value: text(line?.product_name) }];
    const supplied = text(line?.supplied_by);
    if (supplied && supplied.toLowerCase() !== "we supply") {
      out.push({ key: "supplied_by", label: "Supplied by", value: supplied });
    }
    return out;
  }

  return [
    { key: "material", label: "Material", value: text(line?.material) },
    { key: "finish", label: "Finish", value: text(line?.finish) },
    { key: "colour", label: "Colour", value: text(line?.colour) },
  ];
}

/**
 * Whether a column applies to this line at all.
 *
 * The difference between "we do not know" and "the question does not arise". A
 * hinge has no edge profile and no grain, and printing N/A against six columns
 * of a hardware row makes a complete line look like an incomplete one.
 */
export function lineHasBoard(line) {
  return !isHardwareLine(line);
}

/**
 * WHAT MAKES ONE BOARD DIFFERENT FROM ANOTHER.
 *
 * This decides two things at once, which is why it lives here rather than in
 * each document: which lines are one group, and what is said once at the top of
 * that group instead of on every row. They have to be the same list. A group
 * keyed on three things whose heading names four is a heading that lies about
 * the lines under it.
 *
 * THICKNESS IS ONE OF THEM. An 18mm door and a 21mm door in the same colour are
 * different products at different prices, and some profiles are only made in
 * 21mm at all. It was recorded on the line, priced from, and then left off the
 * customer's copy entirely.
 */
export const BOARD_FIELDS = [
  { key: "material", label: "Material" },
  { key: "finish", label: "Finish" },
  { key: "colour", label: "Colour" },
  { key: "thickness", label: "Thickness" },
];

/** Which group a line belongs to. Hardware has no board and forms its own. */
export function boardGroupKey(line) {
  if (isHardwareLine(line)) return "hardware";
  return BOARD_FIELDS.map((field) => text(line?.[field.key]).toLowerCase()).join("|");
}

/** The board, as [label, value] pairs, with nothing said about a blank field. */
export function boardGroupSpec(line) {
  if (isHardwareLine(line)) return [];
  return BOARD_FIELDS.map((field) => [field.label, text(line?.[field.key])]).filter((pair) => pair[1]);
}

/**
 * THE FRONT PROFILE ON A LINE, IF IT HAS ONE.
 *
 * The customer's quote used to decide this for itself: a profile was shown only
 * on a thermolaminate line that was not a panel and not a table top. The quote
 * editor has never had that rule, so a panel that was quoted WITH a profile,
 * priced with it and made with it, reached the customer with a dash in the
 * profile column. The office and the customer were reading different quotes.
 *
 * The only question worth asking is whether the line has one. A line that has
 * not got one puts nothing here, and a column where no line has one is dropped
 * by the screen and the PDF alike.
 */
export function lineFrontProfile(line) {
  return text(line?.profile);
}
