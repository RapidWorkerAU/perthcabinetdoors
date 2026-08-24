// THE DELIVERY LABEL.
//
// Every other label on this roll is about a PIECE: which panel, what colour,
// drill it or do not. This one is about the ORDER, and it is read by whoever is
// loading the van or handing a job over the counter.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   IT FITS THE STOCK. The roll loaded in the Brother is 62 x 90mm die cut. A
//   label that needs 101mm does not print short, it does not print.
//
//   EVERY FIELD IS ALWAYS THERE. A phone number nobody recorded prints as "Not
//   recorded". A missing line makes a person wonder whether the label is wrong
//   or the record is; a line that says it is empty answers that on the spot.
//
//   THE COUNT IS PIECES, NOT LINES. A line for six doors is six things to load,
//   and the person checking the van off is counting objects.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

import {
  addressLines,
  deliveryLabelFields,
  generateDeliveryLabelPdf,
  orderPieceCount,
} from "../lib/pcd-order-label-delivery.js";
import { LABEL_UNKNOWN } from "../lib/pcd-order-labels.js";

const MM = 2.834645669;
const PRINTED = new Date("2026-08-24T02:00:00Z");

const FULL = {
  id: "o1",
  order_number: "PCD-O-2026-E7651A",
  customer_name: "Juliet Grist",
  customer_email: "juliet.grist@example.com",
  customer_phone: "0412 345 678",
  site_street: "14 Bellevue Terrace",
  site_suburb: "Scarborough",
  site_postcode: "6019",
  name: "Kitchen doors and panels",
  accepted_at: "2026-08-24T02:00:00Z",
};

const ITEMS = [{ id: "a", qty: 6 }, { id: "b", qty: 4 }, { id: "c", qty: 1, variation_status: "removed" }];

/** What the label actually puts on the page, in the order it draws it. */
function printed(pdf) {
  const text = pdf.toString("latin1");
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  const out = [];
  let match;
  while ((match = re.exec(text)) !== null) out.push(match[1].replace(/\\([()\\])/g, "$1"));
  return out;
}

function pageSize(pdf) {
  const match = /MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString("latin1"));
  return match ? { widthMm: Number(match[1]) / MM, heightMm: Number(match[2]) / MM } : null;
}

// ── It fits the stock ───────────────────────────────────────────────────────

test("the label is the size of the roll that is loaded", () => {
  const size = pageSize(generateDeliveryLabelPdf({ order: FULL, items: ITEMS }));
  assert.ok(size, "the page has a size");
  assert.equal(Math.round(size.widthMm), 62);
  assert.equal(Math.round(size.heightMm), 90, "the 62 x 90mm die cut label, same as the production ones");
});

test("a long address and an empty record both still fit", () => {
  const long = {
    ...FULL,
    customer_name: "Christopher Alexander Fitzwilliam-Smythe",
    site_street: "Unit 14B, 220 Wellington Parade South",
    site_suburb: "East Melbourne Victoria",
    name: "Kitchen, laundry, butler pantry and wardrobe wall",
  };
  for (const order of [long, { id: "o2", order_number: "PCD-O-1" }]) {
    const size = pageSize(generateDeliveryLabelPdf({ order, items: ITEMS }));
    assert.equal(Math.round(size.heightMm), 90, "still on the stock");
  }
});

// ── Every field is always there ─────────────────────────────────────────────

test("a record with nothing in it still prints a full label", () => {
  const pdf = generateDeliveryLabelPdf({ order: { id: "o2", order_number: "PCD-O-2026-9A4C10" }, items: [] });
  const lines = printed(pdf);

  for (const caption of ["ADDRESS", "PHONE", "EMAIL", "ORDER", "ORDERED", "ITEMS"]) {
    assert.ok(lines.includes(caption), `${caption} is missing, so nobody knows it was not recorded`);
  }
  assert.ok(
    lines.filter((line) => line === LABEL_UNKNOWN).length >= 4,
    "the empty ones say so rather than vanishing"
  );
  assert.ok(lines.includes("PCD-O-2026-9A4C10"), "what IS known is still on it");
});

test("the fields say what was recorded, and what was not", () => {
  const fields = deliveryLabelFields({ order: FULL, items: ITEMS });
  assert.equal(fields.customerName, "Juliet Grist");
  assert.equal(fields.phone, "0412 345 678");
  assert.equal(fields.pieces, "10 pieces");
  assert.deepEqual(fields.address, ["14 Bellevue Terrace", "Scarborough  6019"]);

  const empty = deliveryLabelFields({ order: {}, items: [] });
  for (const key of ["customerName", "email", "phone", "orderNumber", "orderDate", "pieces"]) {
    assert.equal(empty[key], LABEL_UNKNOWN, `${key} should say it was not recorded`);
  }
  assert.deepEqual(empty.address, [LABEL_UNKNOWN]);
});

test("an address stored as one string is still broken into lines", () => {
  // Records made before the address had separate boxes.
  assert.deepEqual(
    addressLines({ site_address: "14 Bellevue Terrace, Scarborough, 6019" }),
    ["14 Bellevue Terrace", "Scarborough", "6019"]
  );
  // The separate boxes win when they are there, because that is where somebody
  // typed it and it wraps where an address should wrap.
  assert.deepEqual(addressLines(FULL), ["14 Bellevue Terrace", "Scarborough  6019"]);
});

// ── The count ───────────────────────────────────────────────────────────────

test("the count is pieces, and a line a variation removed is not one", () => {
  assert.equal(orderPieceCount(ITEMS), 10, "six plus four, and the removed one left out");
  assert.equal(orderPieceCount([{ id: "a" }, { id: "b" }]), 2, "a line with no quantity is one thing");
  assert.equal(orderPieceCount([]), 0);
  assert.equal(deliveryLabelFields({ order: FULL, items: [{ qty: 1 }] }).pieces, "1 piece", "not 1 pieces");
});

// ── It reads as one of ours ─────────────────────────────────────────────────

test("the label carries the masthead and says what kind of label it is", () => {
  const lines = printed(generateDeliveryLabelPdf({ order: FULL, items: ITEMS }));
  assert.equal(lines[0], "DELIVERY", "so a bundle of production labels with this on the front is told apart");
});

test("the customer is the first and biggest thing on it", () => {
  const lines = printed(generateDeliveryLabelPdf({ order: FULL, items: ITEMS }));
  assert.equal(lines[1], "Juliet Grist", "straight under the masthead, before anything else");
});

test("it reads top to bottom the way somebody loading a van would want it", () => {
  const lines = printed(generateDeliveryLabelPdf({ order: FULL, items: ITEMS }));
  const order = ["Juliet Grist", "ADDRESS", "PHONE", "EMAIL", "ORDER", "ORDERED", "ITEMS"];
  const positions = order.map((value) => lines.indexOf(value));
  assert.ok(positions.every((at) => at >= 0), "every block is on the label");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "who, then where, then what");
});

// ── The button ──────────────────────────────────────────────────────────────

test("the order page offers it beside the other order actions", () => {
  const page = readFileSync(new URL("../app/admin/orders/[id]/OrderDetail.js", import.meta.url), "utf8");
  assert.match(page, /Print Delivery Label/);
  assert.match(page, /downloadDeliveryLabel/);
  // Dark green, like the other thing on this page that produces something.
  assert.match(page, /onClick=\{downloadDeliveryLabel\}[\s\S]{0,300}bg-\[#1c2b1e\]/);
  // On the phone too, where the other order actions are.
  assert.equal((page.match(/Print Delivery Label/g) || []).length, 2);
});

// ── The RFD plate ─────────────────────────────────────────────────
//
// The day the label was printed, which is the day the bundle goes out: you
// print this when you pack it. Reversed out of a solid plate because it is the
// one thing on the label read across a loading bay.

/** The raw drawing operators, so position and size can be checked, not assumed. */
function operators(pdf) {
  let text = pdf.toString("latin1");
  for (const stream of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(stream[1], "latin1")).toString("latin1");
      if (inflated.includes("Tj")) text = inflated;
    } catch { /* not a compressed content stream */ }
  }
  const drawn = [];
  const re = /\/(F\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    drawn.push({
      font: match[1],
      size: Number(match[2]),
      x: Number(match[3]),
      y: Number(match[4]),
      text: match[5].replace(/\\([()\\])/g, "$1"),
    });
  }
  return drawn;
}

test("the caption and the date sit on one row at one size", () => {
  const drawn = operators(generateDeliveryLabelPdf({ order: FULL, items: ITEMS, printedOn: PRINTED }));
  const caption = drawn.find((item) => item.text === "RFD");
  const value = drawn.find((item) => item.text === "Mon, 24 Aug 2026");

  assert.ok(caption && value, "both are on the label");
  assert.equal(caption.size, value.size, "one size, so it reads as a single line");
  assert.equal(caption.y, value.y, "one baseline, so it IS a single line");
  assert.ok(value.x > caption.x, "the date sits to the right of its caption");
});

test("the plate is the last thing on the label", () => {
  const drawn = operators(generateDeliveryLabelPdf({ order: FULL, items: ITEMS, printedOn: PRINTED }));
  const lowest = Math.min(...drawn.map((item) => item.y));
  const caption = drawn.find((item) => item.text === "RFD");
  assert.equal(caption.y, lowest, "nothing is drawn below it");
});

test("a longer date still fits on the one row", () => {
  // September is the longest month name, and a Wednesday the longest weekday.
  const drawn = operators(
    generateDeliveryLabelPdf({ order: FULL, items: ITEMS, printedOn: new Date("2026-09-30T02:00:00Z") })
  );
  const caption = drawn.find((item) => item.text === "RFD");
  // Found by where it sits, not by what it says: the month abbreviation is the
  // runtime's business ("Sep" or "Sept" depending on the ICU build) and pinning
  // it would make this fail on a different machine rather than on a real fault.
  const value = drawn.find((item) => item.y === caption.y && item !== caption);
  assert.ok(value, "the date is on the label");
  assert.match(value.text, /2026$/, "and it is a date");
  assert.ok(value.x > caption.x, "still one row, still in order");
});

test("the date is the day it was printed, not a date off the order", () => {
  const fields = deliveryLabelFields({ order: FULL, items: ITEMS, printedOn: new Date("2026-12-01T02:00:00Z") });
  assert.match(fields.deliveryDate, /1 Dec 2026/);
  assert.match(fields.orderDate, /24 Aug 2026/, "the order date is a different thing and stays itself");
});

// ── Long content is broken, never left to run off ───────────────────────────

test("an email with no spaces in it is broken rather than run off the label", () => {
  const long = { ...FULL, customer_email: "christopher.fitzwilliam.smythe@a-very-long-domain-name.com.au" };
  const printed_ = printed(generateDeliveryLabelPdf({ order: long, items: ITEMS, printedOn: PRINTED }));
  const at = printed_.indexOf("EMAIL");
  assert.ok(at >= 0);
  // It arrives as two or more lines, and every piece of it is still there.
  const rejoined = printed_.slice(at + 1, printed_.indexOf("ORDER")).join("");
  assert.equal(rejoined, long.customer_email, "broken up, but nothing lost");
});

test("something too long for its lines is cut, and says it was cut", () => {
  const long = { ...FULL, name: "Kitchen, laundry, butler pantry, wardrobe wall and the whole upstairs bathroom" };
  const printed_ = printed(generateDeliveryLabelPdf({ order: long, items: ITEMS, printedOn: PRINTED }));
  const job = printed_[printed_.indexOf("JOB") + 1];
  assert.match(job, /\.\.\.$/, "three dots, which every font on a thermal printer has");
});
