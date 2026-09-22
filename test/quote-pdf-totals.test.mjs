// THE MONEY ON THE CUSTOMER'S PDF IS THE MONEY THE EDITOR WORKED OUT.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Found in the Pass 1 audit, 21 September 2026. Three test files already
// generate a real quote PDF and read the text back, which is the right way to
// check a document. None of them imported `calculateQuoteTotals`.
//
// So everything about how a line is DESCRIBED was covered, and nothing about
// what it COSTS. A change to the totals block on the PDF, or to the arithmetic
// behind it, could put a different number in front of the customer than the one
// the office approved, and the whole suite would stay green.
//
// ── WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT ──────────────────────
//
// It checks that the figures printed on the page are the figures
// `calculateQuoteTotals` produced from the same lines. It does not check the
// arithmetic itself: test/quote-totals.test.mjs does that, and the two answer
// different questions. This one would still pass if the arithmetic were wrong
// in both places, which is exactly why both files are needed.
//
// ── WHY THE NUMBERS ARE SEARCHED FOR RATHER THAN READ FROM A KNOWN POSITION ──
//
// The PDF writer places the totals block itself and that layout is allowed to
// change. Pinning this to a position would make it a test of the layout, which
// would then fail every time somebody moved the box, and the pressure would be
// to delete it. What must never change is that the figures are present and
// correct, so that is what is asserted.

import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { generateQuotePdf } from "../lib/pcd-cabinet-pdf.js";
import { calculateQuoteTotals, formatMoney } from "../lib/pcd-quote-utils.js";

// Every string the file draws, in the order it draws them.
function printedText(buffer) {
  const raw = buffer.toString("latin1");
  const streamRe = /<< \/Length (\d+) >>\nstream\n/g;
  const out = [];
  let match;
  while ((match = streamRe.exec(raw))) {
    const start = match.index + match[0].length;
    const length = Number(match[1]);
    let body = raw.substr(start, length);
    if (!body.includes("Tj")) {
      try {
        body = zlib.inflateSync(Buffer.from(body, "latin1")).toString("latin1");
      } catch {
        body = "";
      }
    }
    for (const hit of body.matchAll(/\((.*?)\) Tj/g)) {
      out.push(hit[1].replace(/\\([()\\])/g, "$1"));
    }
    streamRe.lastIndex = start + length;
  }
  return out;
}

const line = (extra = {}) => ({
  id: `l${Math.random()}`,
  product_type: "Door",
  product_name: "Door",
  material: "Thermolaminate",
  finish: "Smooth",
  colour: "Agave",
  thickness: "18mm",
  height_mm: 720,
  width_mm: 397,
  qty: 1,
  // product_unit_cost_ex_gst is what actually drives the money, times qty, plus
  // markup. Setting unit_price_ex_gst or material_cost_ex_gst on the way in
  // does nothing: calculateQuoteLine works both of those out for itself, so a
  // fixture built on them prices every line at zero and the assertions below
  // pass against an empty page. Learned the hard way writing this file.
  product_unit_cost_ex_gst: 100,
  markup_percent: 0,
  ...extra,
});

/**
 * Build a quote, price it the way the editor does, and print it.
 *
 * The SAME totals go into the PDF that come back for comparison, which is the
 * whole point: this proves the document agrees with the arithmetic, not that
 * two separate calculations happen to match.
 */
function quoteAndPdf(lines, costs = {}) {
  const gstRate = costs.gst_rate ?? 0.1;
  const totals = calculateQuoteTotals(lines, gstRate, { ...costs, business_defaults: {} });
  const quote = {
    quote_number: "PCD-Q-2026-0001",
    customer_name: "Test Customer",
    created_at: "2026-02-24",
    valid_until: "2026-03-14",
    currency: costs.currency ?? "AUD",
    subtotal_ex_gst: totals.subtotal_ex_gst,
    gst_amount: totals.gst_amount,
    total_inc_gst: totals.total_inc_gst,
    ...costs,
  };
  const printed = printedText(
    generateQuotePdf({ quote, lines, businessDefaults: {}, includeCabinetDrawings: false })
  );
  return { totals, printed, currency: quote.currency };
}

/** Did this exact amount print anywhere on the page? */
function printedAmount(printed, amount, currency) {
  const written = formatMoney(amount, currency);
  // The writer may split a cell, so compare against the joined page as well.
  return printed.includes(written) || printed.join(" ").includes(written);
}

// ── The three figures a customer reads ───────────────────────────────────────

test("the subtotal, the GST and the total all print, and all match the arithmetic", () => {
  const { totals, printed, currency } = quoteAndPdf([line(), line({ qty: 2 })], {
    travel_cost_ex_gst: 120,
    delivery_cost_ex_gst: 80,
  });

  assert.ok(totals.total_inc_gst > 0, "the fixture must produce a real total, or this proves nothing");

  for (const [name, amount] of [
    ["subtotal", totals.subtotal_ex_gst],
    ["GST", totals.gst_amount],
    ["total", totals.total_inc_gst],
  ]) {
    assert.ok(
      printedAmount(printed, amount, currency),
      `the ${name} the editor worked out (${formatMoney(amount, currency)}) is not on the customer's PDF`
    );
  }
});

// ── The figures must follow the lines, not a remembered fixture ──────────────
//
// A test that only ever checks one quote passes just as happily against a
// writer that prints a constant. Changing the lines has to change the page.

test("changing the lines changes the money on the page", () => {
  const small = quoteAndPdf([line()]);
  const large = quoteAndPdf([line({ qty: 9 })]);

  assert.notEqual(small.totals.total_inc_gst, large.totals.total_inc_gst, "the two fixtures must differ");
  assert.ok(
    printedAmount(large.printed, large.totals.total_inc_gst, large.currency),
    "the larger quote's total is not on its own PDF"
  );
  assert.equal(
    printedAmount(large.printed, small.totals.total_inc_gst, small.currency),
    false,
    "the larger quote's PDF is showing the smaller quote's total"
  );
});

// ── GST is charged at the rate the quote carries ─────────────────────────────
//
// The editor caption used to read `form.gst_rate || 0.1`, so a legitimate rate
// of 0 printed as "GST (10%)" beside an amount of nothing. That was fixed in
// the same pass. This holds the document end of it.

test("a quote at a different GST rate prints that rate's GST", () => {
  const { totals, printed, currency } = quoteAndPdf([line()], { gst_rate: 0.15, travel_cost_ex_gst: 100 });

  assert.equal(totals.gst_rate, 0.15, "the totals must carry the rate they used");
  assert.ok(
    printedAmount(printed, totals.gst_amount, currency),
    `GST at 15% (${formatMoney(totals.gst_amount, currency)}) is not on the PDF`
  );
});

// ── A currency nothing can format must not take the PDF down ─────────────────
//
// The Currency box on the quote editor was free text and nothing validated it,
// so a typo reached `Intl.NumberFormat` and threw. The save routes refuse a bad
// code now, but quotes saved before that are still in the database and their
// PDFs still have to build.

test("a quote saved with an unusable currency still produces a PDF", () => {
  const lines = [line()];
  const totals = calculateQuoteTotals(lines, 0.1, { travel_cost_ex_gst: 100, business_defaults: {} });
  const build = () =>
    generateQuotePdf({
      quote: {
        quote_number: "PCD-Q-2026-0002",
        customer_name: "Test Customer",
        created_at: "2026-02-24",
        currency: "AUDD",
        subtotal_ex_gst: totals.subtotal_ex_gst,
        gst_amount: totals.gst_amount,
        total_inc_gst: totals.total_inc_gst,
      },
      lines,
      businessDefaults: {},
      includeCabinetDrawings: false,
    });

  assert.doesNotThrow(build, "a bad currency code must not stop the document being produced");
  assert.ok(printedText(build()).length > 0, "the PDF came out empty");
});
