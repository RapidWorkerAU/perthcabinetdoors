// The copy of the quote that goes to the customer.
//
// Sending a quote now builds the same PDF the editor's download button builds
// and files it against the quote, so it appears in the Attachments section of
// the viewer. The customer's copy leaves off the cabinet drawings: those pages
// are a workshop drawing set, not part of the quote.
//
// Two things have to hold. The drawings must actually be gone, not merely
// unreferenced, or the customer gets a drawing set anyway. And the page count
// printed in every footer has to match the pages that exist, because it is
// computed up front from a list the drawings were removed from.

import test from "node:test";
import assert from "node:assert/strict";
import { generateQuotePdf } from "../lib/pcd-cabinet-pdf.js";

const QUOTE = {
  id: "00000000-0000-0000-0000-000000000001",
  quote_number: "PCD-Q-2026-0042",
  customer_name: "Sarah Jones",
  customer_email: "sarah@example.com",
  site_address: "14 Rokeby Road, Subiaco 6008",
  gst_rate: 0.1,
  markup_percent: 0,
};

// A configured base cabinet earns a drawing page; a door never does.
const cabinet = (id, width) => ({
  id,
  product_type: "base_cabinet",
  product_name: "Base cabinet",
  qty: 1,
  sort_order: 0,
  cabinet_config: { width_mm: width, height_mm: 720, depth_mm: 560 },
});

const DOOR = {
  id: "line-door",
  product_type: "door",
  product_name: "Door",
  material: "MDF",
  colour: "Dulux Natural White",
  width_mm: 597,
  height_mm: 717,
  qty: 2,
  sort_order: 1,
};

const LINES = [cabinet("line-a", 600), cabinet("line-b", 900), DOOR];

function pageCount(buffer) {
  const match = String(buffer).match(/\/Type \/Pages [^>]*?\/Count (\d+)/);
  assert.ok(match, "the PDF must have a page tree");
  return Number(match[1]);
}

test("the drawings are on by default, which is what the download button gives", () => {
  const withDrawings = pageCount(generateQuotePdf({ quote: QUOTE, lines: LINES }));
  const withoutDrawings = pageCount(generateQuotePdf({ quote: QUOTE, lines: LINES, includeCabinetDrawings: false }));
  assert.equal(withDrawings, withoutDrawings + 2, "one drawing page per configured cabinet");
});

test("the customer's copy carries no cabinet drawing pages", () => {
  const pdf = String(generateQuotePdf({ quote: QUOTE, lines: LINES, includeCabinetDrawings: false }));
  assert.ok(!pdf.includes("Quote cabinet drawings"), "the drawings page heading must not appear");
  assert.ok(!pdf.includes("Front elevation"), "no drawing frames either");
});

test("the drawing pages really are there when they are wanted", () => {
  // The negative test above is only meaningful if these strings appear at all.
  const pdf = String(generateQuotePdf({ quote: QUOTE, lines: LINES }));
  assert.ok(pdf.includes("Quote cabinet drawings"));
  assert.ok(pdf.includes("Front elevation"));
});

test("the footer page count matches the pages that exist", () => {
  const buffer = generateQuotePdf({ quote: QUOTE, lines: LINES, includeCabinetDrawings: false });
  const pages = pageCount(buffer);
  const printed = String(buffer).match(/Page \d+ of (\d+)/g) || [];
  assert.ok(printed.length, "every page prints a footer");
  printed.forEach((label) => {
    assert.equal(Number(label.match(/of (\d+)/)[1]), pages, `${label} does not match the ${pages} pages present`);
  });
});

test("a quote with no configured cabinets is the same either way", () => {
  const on = pageCount(generateQuotePdf({ quote: QUOTE, lines: [DOOR] }));
  const off = pageCount(generateQuotePdf({ quote: QUOTE, lines: [DOOR], includeCabinetDrawings: false }));
  assert.equal(on, off);
});

test("the line items and totals are still in the customer's copy", () => {
  // Dropping the drawings must not drop the quote.
  const pdf = String(generateQuotePdf({ quote: QUOTE, lines: LINES, includeCabinetDrawings: false }));
  assert.ok(pdf.includes("PCD-Q-2026-0042"), "the quote number");
  assert.ok(pdf.includes("Sarah Jones"), "who it is for");
});
