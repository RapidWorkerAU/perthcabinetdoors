// The PDF object table itself, rather than what the pages draw.
//
// Every other PDF test in here reads the content stream: it checks that the
// right text was emitted at the right place, and it will happily pass on a file
// no viewer can render. That is not hypothetical. Adding a third font gave one
// object number to both the italic font and the logo image, the image won, and
// the page then declared /F3 as a font resource pointing at an image XObject.
//
// The content stream was perfect. Every text-level test passed. But a viewer
// that cannot resolve a font stops drawing the stream at that point and says
// nothing, so every label lost everything below its first italic word, and the
// tests insisted the labels were fine.
//
// Note which check below actually catches that: "every font a page declares
// really is a font". The duplicate-number check does NOT, because the objects
// are collected in an array and the second write simply replaces the first, so
// only one header is ever emitted. Checking that a resource resolves to the
// KIND of thing it is declared as is the check that matters; counting is not
// enough. Both are kept, since they fail on different mistakes.
import test from "node:test";
import assert from "node:assert/strict";
import { generateOrderLabelsPdf } from "../lib/pcd-order-label-pdf.js";
import { generateQuotePdf } from "../lib/pcd-cabinet-pdf.js";

function labelPdf() {
  return generateOrderLabelsPdf({
    labels: [{
      badge: "1", counter: "1 of 1", section: "Cut list",
      orderNumber: "PCD-O-2026-E7651A", customer: "Juliet Grist",
      orderDate: "12th July 2026", manufacturingDate: "17th August 2026",
      size: "597mm x 1397mm", thickness: "16mm",
      materialAbove: "Decorative Board - 16mm Thickness",
      colourHeadline: "Florentine Walnut",
      materialBelow: "Polytec - Woodmatt",
      edge: "1mm Square Edge", profile: "Not Listed",
      drill: "Yes", hinges: "2 hinges", hingeQty: "2",
      madeToOrder: false, band: null, struckSize: false,
    }],
  }).toString("latin1");
}

// Every "N 0 obj" header in the file.
function objectIds(pdf) {
  return [...pdf.matchAll(/(?:^|\n)(\d+) 0 obj/g)].map((m) => Number(m[1]));
}

// The body of one object, by number.
function objectBody(pdf, id) {
  const start = pdf.indexOf(`\n${id} 0 obj`);
  if (start < 0) return null;
  const end = pdf.indexOf("endobj", start);
  return pdf.slice(start, end);
}

test("no object number is used twice", () => {
  // The whole bug in one assertion. Two objects sharing a number means one of
  // them is silently gone, and which one depends on write order.
  const ids = objectIds(labelPdf());
  const seen = new Set();
  const duplicates = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual(duplicates, [], `object numbers written more than once: ${duplicates.join(", ")}`);
});

test("every font a page declares really is a font", () => {
  // /F3 pointed at an image XObject. A viewer stops drawing the content stream
  // when it cannot resolve a font, without reporting anything.
  const pdf = labelPdf();
  const resources = [...pdf.matchAll(/\/Font << ((?:\/F\d+ \d+ 0 R ?)+)>>/g)];
  assert.ok(resources.length > 0, "pages declare font resources");

  resources.forEach(([, block]) => {
    [...block.matchAll(/\/(F\d+) (\d+) 0 R/g)].forEach(([, name, id]) => {
      const body = objectBody(pdf, Number(id));
      assert.ok(body, `${name} points at object ${id}, which does not exist`);
      assert.match(body, /\/Type \/Font/, `${name} points at object ${id}, which is not a font`);
    });
  });
});

test("every image a page declares really is an image", () => {
  const pdf = labelPdf();
  [...pdf.matchAll(/\/XObject << ((?:\/\w+ \d+ 0 R ?)+)>>/g)].forEach(([, block]) => {
    [...block.matchAll(/\/(\w+) (\d+) 0 R/g)].forEach(([, name, id]) => {
      const body = objectBody(pdf, Number(id));
      assert.ok(body, `${name} points at object ${id}, which does not exist`);
      assert.match(body, /\/Subtype \/Image/, `${name} points at object ${id}, which is not an image`);
    });
  });
});

test("every object the label references exists", () => {
  const pdf = labelPdf();
  const declared = new Set(objectIds(pdf));
  const referenced = new Set([...pdf.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1])));
  const dangling = [...referenced].filter((id) => !declared.has(id));
  assert.deepEqual(dangling, [], `referenced but never written: ${dangling.join(", ")}`);
});

test("the cross reference table has an entry for every object", () => {
  // A short xref is the other way a structurally broken file reads as fine
  // until something tries to open it.
  const pdf = labelPdf();
  const size = Number(/\/Size (\d+)/.exec(pdf)[1]);
  const highest = Math.max(...objectIds(pdf));
  assert.ok(size > highest, `xref says ${size} objects, highest written is ${highest}`);
});

test("the three faces are all present and distinct", () => {
  const pdf = labelPdf();
  ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique"].forEach((face) => {
    assert.ok(pdf.includes(`/BaseFont /${face}`), `${face} is embedded`);
  });
  const fontObjects = [...pdf.matchAll(/\/BaseFont \/([\w-]+)/g)].map((m) => m[1]);
  assert.equal(new Set(fontObjects).size, fontObjects.length, "no face is written twice");
});

test("the same checks hold for the quote document", () => {
  // The object table lives in the shared engine, so a collision there would
  // break every document we produce, not only the labels.
  const pdf = generateQuotePdf({
    quote: { quote_number: "PCD-Q-2026-0001", customer_name: "Juliet Grist" },
    lines: [{ id: "l1", product_name: "Door", qty: 1, width_mm: 597, height_mm: 1397 }],
    businessDefaults: {},
    includeCabinetDrawings: false,
  }).toString("latin1");

  const ids = objectIds(pdf);
  assert.equal(new Set(ids).size, ids.length, "no object number is used twice");

  const declared = new Set(ids);
  const dangling = [...new Set([...pdf.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1])))]
    .filter((id) => !declared.has(id));
  assert.deepEqual(dangling, [], `referenced but never written: ${dangling.join(", ")}`);
});
