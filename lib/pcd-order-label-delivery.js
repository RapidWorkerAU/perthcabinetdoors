// The delivery label: who the order goes to, on the same stock as the workshop
// labels.
//
// WHAT IT IS FOR. Every other label on this roll is about a PIECE: which panel,
// what colour, drill it or do not. This one is about the ORDER, and it is read
// by whoever is loading the van or handing a job over the counter. It goes on
// the outside of the bundle.
//
// SAME ROLL, SAME MASTHEAD, DELIBERATELY. It prints on the same 62 x 90mm stock
// as the production labels, with the same logo and a rule underneath, so a
// bundle carries one family of labels and not two. The difference is the
// content, not the look.
//
// EVERY FIELD IS ALWAYS THERE. A phone number nobody recorded prints as "Not
// recorded" rather than vanishing. A missing line makes a person wonder whether
// the label is wrong or the record is; a line that says it is empty answers
// that on the spot, and the answer is actionable: go and fill it in.
//
// ── IT ALWAYS FITS, AND THAT IS NOT FREE ─────────────────────────────────────
//
// The content is not fixed. "Jo Ng" and "Christopher Alexander
// Fitzwilliam-Smythe" are both customer names; an address is two lines or four.
// Laid out at one size, the long end of that ran off a 90mm label, and a label
// that will not print is worse than one set a point smaller.
//
// So the layout is measured at full size, and if it does not fit it is measured
// again a step smaller, and again, until it does. Every size and every gap
// comes out of metrics(scale), so they all shrink together and the label reads
// as one thing set slightly smaller rather than as a layout with the air
// squeezed out of it.

import { PdfDocument, loadLogo } from "./pcd-cabinet-pdf.js";
import { LABEL_UNKNOWN } from "./pcd-order-labels.js";
import { DEFAULT_LABEL_STOCK, resolveLabelStock } from "./pcd-label-stocks.js";
import { textWidth, boldTextWidth } from "./pcd-order-label-pdf.js";

const MM = 2.834645669;

// Bumped whenever this layout changes, and written into the PDF, so a label in
// hand can be matched to the code that drew it.
export const DELIVERY_LABEL_VERSION = "delivery-2026-08-24-v1";

const LABEL_WIDTH = 62 * MM;
const LABEL_MARGIN = 3.5 * MM;
const CONTENT_WIDTH = LABEL_WIDTH - LABEL_MARGIN * 2;
const MIN_HEIGHT = 40 * MM;
const MAX_HEIGHT = 150 * MM;

// Cap height as a fraction of the point size, for both Helvetica faces. Used
// for vertical centring: a baseline placed at half the POINT size sits high,
// because the point size includes descender room a line of capitals never uses.
const CAP = 0.717;

const INK = [0.05, 0.05, 0.05];
// Captions are labels, not instructions. A quieter black says so without
// needing a second type size.
const CAPTION_GREY = [0.32, 0.32, 0.32];
const DIVIDER = 0.4;

const LOGO_NAME = "rectangle-pcd-logo";

// How far the type is allowed to be taken down before the answer is that this
// really does not fit. Below about four fifths it stops being readable across a
// workshop, and at that point the record itself is the problem.
const SCALE_STEPS = [1, 0.95, 0.9, 0.85, 0.8];

// HOW MANY LINES EACH BLOCK MAY TAKE. Without these one enormous address could
// take the whole label however small the type went. Anything longer is cut with
// an ellipsis, which reads as "there is more" rather than as the whole answer.
const MAX_NAME_LINES = 2;
const MAX_ADDRESS_LINES = 3;
const MAX_EMAIL_LINES = 2;
const MAX_JOB_LINES = 1;

/**
 * Every size and gap on the label, at a given scale.
 *
 * One place, so a step down takes the type, the leading and the air with it
 * together. Three sizes and two weights is all a label this size can carry
 * before the hierarchy stops meaning anything.
 */
function metrics(scale) {
  const caption = 6.5 * scale;
  const body = 9 * scale;
  return {
    scale,
    captionFont: caption,
    captionLine: caption * 1.35,
    bodyFont: body,
    bodyLine: body * 1.32,
    nameFont: 14 * scale,
    nameMinFont: 10 * scale,
    nameLine: 1.2,
    badgeFont: 8 * scale,
    sectionPad: 1.6 * MM * scale,
    tightPad: 1 * MM * scale,
    logoMaxHeight: 12 * MM * scale,
    logoMaxWidth: 30 * MM * scale,
  };
}

const clean = (value) => String(value ?? "").trim();

/** Whatever was recorded, or a line that says nothing was. */
function orUnknown(value) {
  return clean(value) || LABEL_UNKNOWN;
}

// ── measuring ───────────────────────────────────────────────────────────────

const measure = (text, size, bold) => (bold ? boldTextWidth(text, size) : textWidth(text, size));

function wrap(value, width, size, bold = false) {
  const text = clean(value);
  if (!text) return [];
  const lines = [];
  let current = "";

  // A WORD WITH NOWHERE TO BREAK still has to be broken. An email address is
  // one word sixty characters long: split on spaces alone it stays one line and
  // walks straight off the edge of the label, which is exactly what it did.
  const breakLongWord = (word) => {
    let part = "";
    for (const character of word) {
      if (part && measure(part + character, size, bold) > width) {
        lines.push(part);
        part = character;
        continue;
      }
      part += character;
    }
    return part;
  };

  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, size, bold) > width) {
      lines.push(current);
      current = "";
    }
    if (measure(word, size, bold) > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      current = breakLongWord(word);
      continue;
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Wrapped, then cut to a line count, with the cut said out loud.
 *
 * Three dots rather than the ellipsis character: this is going through a
 * WinAnsi encoded Helvetica onto a thermal printer, and a full stop is a full
 * stop everywhere.
 */
function wrapCapped(value, width, size, maxLines, bold = false) {
  const lines = wrap(value, width, size, bold);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  // Room made for the dots rather than added to the line, or the cut line is
  // the one that overflows.
  let trimmed = last;
  while (trimmed && measure(`${trimmed}...`, size, bold) > width) {
    trimmed = trimmed.slice(0, -1);
  }
  kept[maxLines - 1] = `${trimmed.trimEnd()}...`;
  return kept;
}

/** The biggest the name fits at within its line budget, down to a floor. */
function fitName(name, m) {
  for (let size = m.nameFont; size >= m.nameMinFont; size -= 0.5) {
    if (wrap(name, CONTENT_WIDTH, size, true).length <= MAX_NAME_LINES) return size;
  }
  return m.nameMinFont;
}

function logoBox(logo, m) {
  if (!logo) return { width: 0, height: 0 };
  const aspect = logo.height / logo.width;
  const width = Math.min(m.logoMaxWidth, m.logoMaxHeight / aspect);
  return { width, height: width * aspect };
}

function mastheadHeight(logo, m) {
  return Math.max(logoBox(logo, m).height, m.badgeFont * CAP + 8 * m.scale);
}

// ── what the label says ─────────────────────────────────────────────────────

/**
 * The address as its own lines.
 *
 * The parts are preferred over the single stored string, because they are what
 * a person typed into separate boxes and they break where an address should
 * break. The one line version is the fallback for records made before the parts
 * existed.
 */
export function addressLines(order = {}) {
  const parts = [
    clean(order.site_street),
    [clean(order.site_suburb), clean(order.site_postcode)].filter(Boolean).join("  "),
  ].filter(Boolean);
  if (parts.length) return parts;

  const single = clean(order.site_address);
  if (!single) return [LABEL_UNKNOWN];
  return single.split(/\s*,\s*/).filter(Boolean);
}

/**
 * How many things are on this order.
 *
 * Counted as PIECES, not lines: a line for six doors is six things to load, and
 * the person checking the van off is counting objects. A line a variation
 * removed is not counted, because it is not going in the van.
 */
export function orderPieceCount(items = []) {
  return (items || [])
    .filter((item) => item?.variation_status !== "removed")
    .reduce((total, item) => {
      const qty = Number(item?.qty);
      return total + (Number.isFinite(qty) && qty > 0 ? qty : 1);
    }, 0);
}

/** A date as somebody reading a label would want it: no year clutter. */
function formatLabelDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return LABEL_UNKNOWN;
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * The day the order was placed.
 *
 * Acceptance first, falling back to when the row was created, which is the same
 * rule the financials date an order by. The two agreeing matters more than
 * either being clever: a label and a report that disagree about when a job was
 * ordered send somebody looking for a discrepancy that is not there.
 */
function orderDate(order = {}) {
  const raw = order.accepted_at || order.created_at;
  if (!raw) return LABEL_UNKNOWN;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return LABEL_UNKNOWN;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Everything the label prints, worked out once.
 *
 * Separated from the drawing so the fields can be tested without a PDF, and so
 * anything else that needs to say "who is this order for" reads the same
 * answers. Taken from the ORDER rather than the customer record it was copied
 * from: the order is what was agreed, and a customer who has since moved house
 * has not moved the job going out today.
 */
export function deliveryLabelFields({ order = {}, items = [], printedOn = new Date() } = {}) {
  const pieces = orderPieceCount(items);
  return {
    customerName: orUnknown(order.customer_name),
    email: orUnknown(order.customer_email),
    phone: orUnknown(order.customer_phone),
    address: addressLines(order),
    orderNumber: orUnknown(order.order_number),
    orderDate: orderDate(order),
    jobName: clean(order.name || ""),
    pieces: pieces > 0 ? `${pieces} ${pieces === 1 ? "piece" : "pieces"}` : LABEL_UNKNOWN,
    // The day the label was printed, which is the day it is going out: you
    // print this when you pack it. Passed in rather than read here so a test
    // can pin it and two labels printed a second apart cannot disagree.
    deliveryDate: formatLabelDate(printedOn),
  };
}

// ── the blocks, measured and drawn from one description ─────────────────────
//
// Each block knows how tall it is and how to draw itself, so the measuring pass
// and the drawing pass can never disagree about the layout. A block measured
// one way and drawn another is how a label runs off the bottom.

function blocks(fields, m) {
  const nameSize = fitName(fields.customerName, m);
  const half = (CONTENT_WIDTH - 6 * m.scale) / 2;

  const stack = (lines, size, bold) => ({
    height: m.captionLine + Math.max(1, lines.length) * size * 1.32,
    draw(page, y) {
      page.fillColor(INK);
      let cursor = y + m.captionLine;
      for (const line of lines) {
        page.text(line, LABEL_MARGIN, cursor + size * CAP, size, { bold });
        cursor += size * 1.32;
      }
      return cursor;
    },
  });

  const field = (label, value, { bold = false, maxLines = 2 } = {}) => {
    const lines = wrapCapped(orUnknown(value), CONTENT_WIDTH, m.bodyFont, maxLines, bold);
    const inner = stack(lines, m.bodyFont, bold);
    return {
      height: inner.height,
      draw(page, y) {
        page.fillColor(CAPTION_GREY);
        page.text(String(label).toUpperCase(), LABEL_MARGIN, y + m.captionFont * CAP, m.captionFont, { bold: true });
        return inner.draw(page, y);
      },
    };
  };

  // Two short facts side by side. Only ever a date and a count: an address or an
  // email cut in half would be worse than either taking its own row.
  const pair = (left, right) => {
    const lines = Math.max(
      wrap(orUnknown(left.value), half, m.bodyFont, left.bold).length || 1,
      wrap(orUnknown(right.value), half, m.bodyFont, right.bold).length || 1
    );
    return {
      height: m.captionLine + lines * m.bodyFont * 1.32,
      draw(page, y) {
        for (const [item, x] of [[left, LABEL_MARGIN], [right, LABEL_MARGIN + half + 6 * m.scale]]) {
          page.fillColor(CAPTION_GREY);
          page.text(String(item.label).toUpperCase(), x, y + m.captionFont * CAP, m.captionFont, { bold: true });
          page.fillColor(INK);
          let cursor = y + m.captionLine;
          for (const line of wrap(orUnknown(item.value), half, m.bodyFont, item.bold)) {
            page.text(line, x, cursor + m.bodyFont * CAP, m.bodyFont, { bold: item.bold });
            cursor += m.bodyFont * 1.32;
          }
        }
        return y + m.captionLine + lines * m.bodyFont * 1.32;
      },
    };
  };

  const out = [];
  const gap = (size) => out.push({ height: size, draw: (_page, y) => y + size });
  const rule = () => out.push({
    height: DIVIDER,
    draw(page, y) {
      page.fillColor(INK);
      page.rect(0, y, LABEL_WIDTH, DIVIDER, { fill: true, stroke: false });
      return y + DIVIDER;
    },
  });

  gap(m.sectionPad);
  rule();
  gap(m.sectionPad);

  // WHO IT IS FOR. The biggest thing on the label, because it is the one thing
  // somebody is looking for when they pick a bundle up.
  const nameLines = wrapCapped(fields.customerName, CONTENT_WIDTH, nameSize, MAX_NAME_LINES, true);
  out.push({
    height: nameLines.length * nameSize * m.nameLine,
    draw(page, y) {
      page.fillColor(INK);
      let cursor = y;
      for (const line of nameLines) {
        page.text(line, LABEL_MARGIN, cursor + nameSize * CAP, nameSize, { bold: true });
        cursor += nameSize * m.nameLine;
      }
      return cursor;
    },
  });

  // WHERE IT GOES.
  gap(m.sectionPad);
  out.push(field("Address", fields.address.join(", "), { maxLines: MAX_ADDRESS_LINES }));
  gap(m.tightPad);
  out.push(field("Phone", fields.phone, { maxLines: 1 }));
  gap(m.tightPad);
  out.push(field("Email", fields.email, { maxLines: MAX_EMAIL_LINES }));

  // WHAT IT IS.
  gap(m.sectionPad);
  rule();
  gap(m.sectionPad);
  out.push(field("Order", fields.orderNumber, { bold: true, maxLines: 1 }));
  if (fields.jobName) {
    gap(m.tightPad);
    out.push(field("Job", fields.jobName, { maxLines: MAX_JOB_LINES }));
  }
  gap(m.tightPad);
  out.push(pair(
    { label: "Ordered", value: fields.orderDate },
    { label: "Items", value: fields.pieces, bold: true }
  ));

  // THE DELIVERY DATE, last and loudest.
  //
  // It is the day the label was PRINTED, which is the day the bundle is going
  // out: you print this when you pack it. Reversed out of a solid plate because
  // it is the one thing on the label somebody reads across a loading bay, and
  // because it is the only field here that is not copied from a record. Full
  // width, at the very bottom, so it is the last thing read and the first thing
  // seen.
  gap(m.sectionPad);

  // ONE ROW, ONE SIZE. The caption and the date read as a single line, so the
  // size is whatever makes both of them fit across the plate rather than a size
  // chosen first and wrapped around afterwards. A date broken over two lines in
  // a black box is the messiest thing that can happen on a label this small.
  const platePad = 6 * m.scale;
  const plateGap = 8 * m.scale;
  const plateRoom = CONTENT_WIDTH - platePad * 2 - plateGap;
  const caption = "RFD";
  const value = fields.deliveryDate;

  let plateFont = m.bodyFont;
  while (
    plateFont > 4.5 &&
    boldTextWidth(caption, plateFont) + boldTextWidth(value, plateFont) > plateRoom
  ) {
    plateFont -= 0.25;
  }

  const plateHeight = plateFont * CAP + 11 * m.scale;
  out.push({
    height: plateHeight,
    draw(page, y) {
      page.fillColor(INK);
      page.rect(LABEL_MARGIN, y, CONTENT_WIDTH, plateHeight, { fill: true, stroke: false });
      page.fillColor([1, 1, 1]);
      const baseline = y + (plateHeight + plateFont * CAP) / 2;
      page.text(caption, LABEL_MARGIN + platePad, baseline, plateFont, { bold: true });
      page.text(
        value,
        LABEL_WIDTH - LABEL_MARGIN - platePad - boldTextWidth(value, plateFont),
        baseline,
        plateFont,
        { bold: true }
      );
      return y + plateHeight;
    },
  });

  return out;
}

function layoutHeight(fields, logo, m) {
  const body = blocks(fields, m).reduce((total, block) => total + block.height, 0);
  return LABEL_MARGIN + mastheadHeight(logo, m) + body + LABEL_MARGIN;
}

function drawMasthead(page, y, logo, m) {
  const box = logoBox(logo, m);
  const height = mastheadHeight(logo, m);

  if (logo) {
    page.image("Logo", LABEL_MARGIN, y + (height - box.height) / 2, box.width, box.height);
  } else {
    page.fillColor(INK);
    page.text("PERTH CABINET DOORS", LABEL_MARGIN, y + height / 2 + 3 * m.scale, 9 * m.scale, { bold: true });
  }

  // What KIND of label this is, so a bundle of production labels with this one
  // on the front is told apart without reading it.
  const badge = "DELIVERY";
  const badgeWidth = boldTextWidth(badge, m.badgeFont) + 12 * m.scale;
  const badgeHeight = m.badgeFont * CAP + 8 * m.scale;
  const badgeX = LABEL_WIDTH - LABEL_MARGIN - badgeWidth;
  const badgeY = y + (height - badgeHeight) / 2;
  page.fillColor(INK);
  page.rect(badgeX, badgeY, badgeWidth, badgeHeight, { fill: true, stroke: false });
  page.fillColor([1, 1, 1]);
  page.text(badge, badgeX + 6 * m.scale, badgeY + (badgeHeight + m.badgeFont * CAP) / 2, m.badgeFont, { bold: true });

  return y + height;
}

function drawLabel(page, fields, logo, m) {
  let y = drawMasthead(page, LABEL_MARGIN, logo, m);
  for (const block of blocks(fields, m)) y = block.draw(page, y);
}

/**
 * One label for one order.
 *
 * Set at the biggest scale that fits the stock. There is only ever one page, so
 * a driver cannot take the size from the first page and misapply it to the
 * rest, which is why the production labels all share a height and this one is
 * free to be its own.
 */
export function generateDeliveryLabelPdf({ order = {}, items = [], stock = DEFAULT_LABEL_STOCK, printedOn = new Date() } = {}) {
  if (!order?.id && !order?.order_number) {
    throw new Error("There is no order to make a label for.");
  }

  const paper = resolveLabelStock(stock);
  if (paper.widthMm * MM !== LABEL_WIDTH) {
    throw new Error(`The delivery label is built for 62mm stock, not ${paper.widthMm}mm.`);
  }

  const logo = loadLogo(LOGO_NAME, { trim: true });
  const fields = deliveryLabelFields({ order, items, printedOn });
  const ceiling = paper.heightMm ? paper.heightMm * MM : MAX_HEIGHT;

  // Full size first, then a step smaller, until it fits. The last step is used
  // whether or not it fitted: by then the type is as small as it is allowed to
  // get, and a label set slightly tight is far better than no label at all.
  let m = metrics(SCALE_STEPS[0]);
  let needed = layoutHeight(fields, logo, m);
  for (const scale of SCALE_STEPS) {
    m = metrics(scale);
    needed = layoutHeight(fields, logo, m);
    if (needed <= ceiling) break;
  }

  const height = paper.heightMm
    ? paper.heightMm * MM
    : Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(needed / MM) * MM));

  const pdf = new PdfDocument({ logo, producer: `Perth Cabinet Doors - ${DELIVERY_LABEL_VERSION}` });
  pdf.addPage((page) => drawLabel(page, fields, logo, m), { width: LABEL_WIDTH, height });
  return pdf.toBuffer();
}
