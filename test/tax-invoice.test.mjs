// THE TAX INVOICE.
//
// Issued once the money is all in, so it is a record of a completed transaction
// rather than a request for payment. Two things have to be true of it and they
// are what these protect:
//
//   it may not go out early   an invoice saying a job is settled when it is not
//   it has to add up          a tax document whose lines do not sum to its
//                             total is not a lesser invoice, it is a wrong one

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ORDER_COST_LINES,
  lineDescription,
  orderCostLines,
  taxInvoiceFileName,
  taxInvoiceLines,
  taxInvoiceModel,
  taxInvoiceNumber,
  taxInvoiceReadiness,
} from "../lib/pcd-tax-invoice.js";
import { generateTaxInvoicePdf, paginateInvoiceLines } from "../lib/pcd-tax-invoice-pdf.js";
import { defaultTaxInvoiceMessage, taxInvoiceHtml, taxInvoiceSubject } from "../lib/pcd-tax-invoice-email.js";
// Measured the same way the drawing measures. A checker with its own idea of
// how wide a word is reports overlaps that are not there and misses ones that
// are, which makes it worse than no checker.
import { textWidth } from "../lib/pcd-pdf-text-width.js";

const SEND_ROUTE = readFileSync(
  new URL("../app/api/admin/orders/[id]/tax-invoice/send/route.js", import.meta.url),
  "utf8"
);
// The left margin, so a rule that spans the whole page can be told apart from
// one that only spans the totals block on the right.
const MARGIN_X = 34;

const LOADER = readFileSync(new URL("../lib/pcd-tax-invoice-load.js", import.meta.url), "utf8");

// The invoice in the sample we were asked to match, to the cent.
const ORDER = {
  order_number: "PCD-O-0318",
  name: "PCD Quote",
  currency: "AUD",
  gst_rate: 0.1,
  customer_name: "Antony Maylor",
  customer_email: "antony.maylor@gmail.com",
  delivery_cost_ex_gst: 58,
  subtotal_ex_gst: 221.4,
  gst_amount: 22.14,
  total_inc_gst: 243.54,
};
const ITEMS = [
  {
    title: "Door", height_mm: 600, width_mm: 508, colour: "Polar White", finish: "Matt",
    edge_mould: "Square", qty: 2, line_total_ex_gst: 140,
    hinge_holes: true, hinge_qty: "2 hinges", quote_line_item_id: "q1",
  },
  { title: "110 full cover hinge and plates", product_type: "Hardware", qty: 4, line_total_ex_gst: 23.4 },
];
const PAID = [{ payment_type: "final", amount: 243.54, is_paid: true }];
const DRILLING = new Map([["q1", { cost: 20, qty: 4 }]]);

const model = (over = {}) =>
  taxInvoiceModel({
    order: ORDER, items: ITEMS, payments: PAID, drillingByLineId: DRILLING,
    issuedOn: new Date("2026-07-10T02:00:00Z"), ...over,
  });

// ── it may not go out early ─────────────────────────────────────────────────

test("an order that is not paid in full cannot be invoiced", () => {
  const part = [{ payment_type: "deposit", amount: 100, is_paid: true }];
  const ready = taxInvoiceReadiness(ORDER, part);
  assert.equal(ready.ok, false);
  // The reason says what would have to change, in money, not a rule name.
  assert.match(ready.reason, /\$143\.54 is still outstanding/);
});

test("a paid order can", () => {
  assert.deepEqual(taxInvoiceReadiness(ORDER, PAID), { ok: true, reason: "" });
});

test("a requested but unpaid payment does not count as received", () => {
  const requested = [{ payment_type: "final", amount: 243.54, is_paid: false }];
  assert.equal(taxInvoiceReadiness(ORDER, requested).ok, false);
});

test("a job that was paid and then refunded is not settled again", () => {
  // The refund comes off both sides, the same way the board nets it, so an
  // order that has had money back is not treated as square when it is not.
  const refunded = [...PAID, { payment_type: "refund", amount: -50, is_paid: true }];
  const ready = taxInvoiceReadiness(ORDER, refunded);
  assert.equal(ready.ok, true, "the total came down by the refund too, so it is still square");

  // But a refund with no matching reduction in what was received is not.
  const overRefunded = [
    { payment_type: "deposit", amount: 100, is_paid: true },
    { payment_type: "refund", amount: -50, is_paid: true },
  ];
  assert.equal(taxInvoiceReadiness(ORDER, overRefunded).ok, false);
});

test("an order with nothing on it, or no payment at all, cannot be invoiced", () => {
  assert.match(taxInvoiceReadiness({ ...ORDER, total_inc_gst: 0 }, []).reason, /nothing on it/);
  assert.match(taxInvoiceReadiness(ORDER, []).reason, /No payment has been received/);
  assert.match(taxInvoiceReadiness({ ...ORDER, order_number: "" }, PAID).reason, /no order number/);
});

test("the gate is on the route, not just the button", () => {
  // A disabled button is a courtesy; the route is the boundary.
  assert.match(LOADER, /taxInvoiceReadiness\(order, payments \|\| \[\]\)/);
  assert.match(LOADER, /status: 409/);
});

// ── the number ──────────────────────────────────────────────────────────────

test("the invoice number is the order number", () => {
  // No counter to keep in step with Xero, no way to collide with a number it
  // has already issued, and re-issuing cannot produce a second invoice for one
  // piece of work.
  assert.equal(taxInvoiceNumber(ORDER), "PCD-O-0318");
  assert.equal(taxInvoiceFileName(ORDER), "Tax-Invoice-PCD-O-0318.pdf");
});

test("the issue date is the day it was first issued, not the day it was re-sent", () => {
  // A tax document that changes its own date each time somebody asks for
  // another copy is not a tax document.
  assert.match(SEND_ROUTE, /if \(!order\.invoice_issued_at\)/);
  assert.match(SEND_ROUTE, /invoice_issued_at: new Date\(\)\.toISOString\(\)/);
  assert.match(LOADER, /order\.invoice_issued_at \? new Date\(order\.invoice_issued_at\) : now/);

  const migration = readFileSync(
    new URL("../supabase/202608251900_pcd_order_invoice_issued.sql", import.meta.url), "utf8"
  );
  assert.match(migration, /add column if not exists invoice_issued_at timestamptz/);
});

// ── it has to add up ────────────────────────────────────────────────────────

test("the lines reproduce the invoice we were asked to match, to the cent", () => {
  const invoice = model();
  assert.deepEqual(
    invoice.lines.map((line) => [line.description, line.qty, line.unitPriceExGst, line.totalExGst]),
    [
      ["Door Height: 600mm Width: 508mm Colour: Polar White Matt with Square edges with 2 hinge holes", 2, 60, 120],
      ["Hinge holes drilling", 4, 5, 20],
      ["110 full cover hinge and plates", 4, 5.85, 23.4],
      ["Delivery", 1, 58, 58],
    ]
  );
  assert.equal(invoice.subtotal, 221.4);
  assert.equal(invoice.gst, 22.14);
  assert.equal(invoice.total, 243.54);
  assert.equal(invoice.paid, 243.54);
  assert.equal(invoice.due, 0);
  assert.equal(invoice.reconciled, true);
  assert.equal(invoice.difference, 0);
});

test("splitting the drilling out never changes what the line was charged", () => {
  // The door is shown WITHOUT its drilling and the drilling on its own, so the
  // two add to exactly the line total. Any other split would make the invoice
  // disagree with the order it came from.
  const lines = taxInvoiceLines({ order: ORDER, items: ITEMS, drillingByLineId: DRILLING });
  const doorAndDrilling = lines[0].totalExGst + lines[1].totalExGst;
  assert.equal(doorAndDrilling, ITEMS[0].line_total_ex_gst);
});

test("a line with no drilling on record is not split, and still totals right", () => {
  // A line a variation added has no quote line to read the drilling off. It
  // comes through as one line at its full total, which is correct.
  const lines = taxInvoiceLines({ order: ORDER, items: ITEMS, drillingByLineId: new Map() });
  assert.equal(lines.length, 3, "no separate drilling line");
  assert.equal(lines[0].totalExGst, 140, "the drilling stays inside the door");
  const sum = lines.reduce((total, line) => total + line.totalExGst, 0);
  assert.equal(Math.round(sum * 100) / 100, 221.4);
});

test("an invoice that does not add up is refused rather than drawn", () => {
  // Worse than no invoice: a tax document that is wrong.
  const wrong = model({ order: { ...ORDER, subtotal_ex_gst: 500 } });
  assert.equal(wrong.reconciled, false);
  assert.throws(() => generateTaxInvoicePdf({ invoice: wrong }), /do not add up/);
  assert.match(LOADER, /if \(!invoice\.reconciled\)/);
});

test("a removed variation line is not invoiced", () => {
  const withRemoved = [...ITEMS, { title: "Door", qty: 1, line_total_ex_gst: 90, variation_status: "removed" }];
  const lines = taxInvoiceLines({ order: ORDER, items: withRemoved, drillingByLineId: DRILLING });
  assert.equal(lines.length, 4, "the removed line is not on it");
});

test("every job cost on the order becomes its own line, and only when it is not zero", () => {
  const order = { ...ORDER };
  ORDER_COST_LINES.forEach(({ field }) => { order[field] = 10; });
  const lines = taxInvoiceLines({ order, items: [], drillingByLineId: new Map() });
  assert.deepEqual(lines.map((line) => line.description), ORDER_COST_LINES.map((entry) => entry.label));

  // A zero cost is not a line saying zero.
  assert.deepEqual(taxInvoiceLines({ order: { order_number: "x" }, items: [] }), []);
});

test("consumables is called what the business calls it", () => {
  // The column is installation_cost_ex_gst and the box on the quote says
  // Consumables. Naming it Installation on the one document the customer keeps
  // would be the only place in the business it was called that.
  const entry = ORDER_COST_LINES.find((line) => line.field === "installation_cost_ex_gst");
  assert.equal(entry.label, "Consumables");
});

// ── how a line reads ────────────────────────────────────────────────────────

test("a line reads the way the invoices we are replacing read", () => {
  assert.equal(
    lineDescription(ITEMS[0]),
    "Door Height: 600mm Width: 508mm Colour: Polar White Matt with Square edges with 2 hinge holes"
  );
});

test("height comes before width", () => {
  const at = lineDescription(ITEMS[0]);
  assert.ok(at.indexOf("Height") < at.indexOf("Width"));
});

test("a line says only what it has", () => {
  assert.equal(lineDescription({ title: "Delivery" }), "Delivery");
  assert.equal(lineDescription({}), "Cabinetry item");
  assert.equal(lineDescription({ product_type: "base_cabinet" }), "Base Cabinet");
  assert.ok(!/hinge/.test(lineDescription({ title: "Panel", hinge_holes: false })));
});

test("the handing is named on a drilled door", () => {
  assert.match(lineDescription({ ...ITEMS[0], hinge_side: "Left" }), /2 hinge holes hinged left/);
});

// ── what is deliberately not on it ──────────────────────────────────────────

test("nothing about how to pay, because there is nothing to pay", () => {
  const pdf = generateTaxInvoicePdf({ invoice: model() }).toString("latin1");
  ["BSB", "Account Number", "View and pay online", "Due date", "remit"].forEach((phrase) => {
    assert.ok(!pdf.includes(phrase), `"${phrase}" should not be on a paid invoice`);
  });
});

test("but the money summary stays, because that is what makes it a receipt", () => {
  const pdf = generateTaxInvoicePdf({ invoice: model() }).toString("latin1");
  ["Subtotal", "Total GST 10%", "Less amount paid", "Amount due", "paid in full"].forEach((phrase) => {
    assert.ok(pdf.includes(phrase), `"${phrase}" is missing`);
  });
});

test("it is A4 portrait, not the landscape the shared engine defaults to", () => {
  // An invoice that comes out sideways is one a customer cannot file with their
  // other invoices.
  const pdf = generateTaxInvoicePdf({ invoice: model() }).toString("latin1");
  assert.match(pdf, /MediaBox \[0 0 595 842\]/);
});

test("a refund that happened is shown rather than hidden", () => {
  const refunded = model({
    payments: [...PAID, { payment_type: "refund", amount: -50, is_paid: true }],
    order: { ...ORDER },
  });
  assert.equal(refunded.refunded, 50);
  const pdf = generateTaxInvoicePdf({ invoice: { ...refunded, reconciled: true } }).toString("latin1");
  assert.ok(pdf.includes("Less refunded"));
});

test("a long order runs onto more pages instead of off the bottom", () => {
  const many = Array.from({ length: 40 }, (unused, index) => ({
    description: `Door ${index + 1}`, qty: 1, unitPriceExGst: 10, totalExGst: 10,
  }));
  const pages = paginateInvoiceLines(many, 250, 74, 640);
  assert.ok(pages.length > 1);
  assert.equal(pages.flat().length, many.length, "no line is lost between pages");
});

// ── the email ───────────────────────────────────────────────────────────────

test("the covering note says what it is and that it is done", () => {
  const message = defaultTaxInvoiceMessage({ invoice: model() });
  assert.match(message, /^Hi Antony,/);
  assert.match(message, /PCD-O-0318/);
  assert.match(message, /paid in full, so there is nothing further to do/);
  // Nothing about paying: the job is settled.
  assert.ok(!/BSB|remit|pay online/i.test(message));
});

test("it opens politely when we do not know their name", () => {
  const message = defaultTaxInvoiceMessage({ invoice: { ...model(), customer: { name: "" } } });
  assert.match(message, /^Hi,/);
});

test("what somebody types cannot reach the customer as markup", () => {
  const html = taxInvoiceHtml({ invoice: model(), message: "Sizes are <600 & \"square\"." });
  assert.ok(!html.includes("<600"));
  assert.match(html, /&lt;600 &amp; &quot;square&quot;/);
});

test("the subject names the invoice", () => {
  assert.match(taxInvoiceSubject(model()), /Tax invoice PCD-O-0318/);
});

// ── the send ────────────────────────────────────────────────────────────────

test("the send is checked, because Resend does not throw when it refuses", () => {
  assert.match(SEND_ROUTE, /sendEmail\(resend, \{/);
  assert.match(SEND_ROUTE, /if \(!sent\.ok\)/);
});

test("filing it on the desk cannot make a sent invoice report as unsent", () => {
  const filing = SEND_ROUTE.slice(SEND_ROUTE.indexOf("recordOutboundEmail"));
  assert.match(filing, /catch \(deskError\)/);
  assert.ok(!/catch \(deskError\)[\s\S]{0,200}throw/.test(filing));
});

test("a reply goes back to whoever sent it", () => {
  assert.match(SEND_ROUTE, /replyTo: context\.user\?\.email/);
});

// ── nothing is drawn through anything else ──────────────────────────────────

/**
 * Every rule and every piece of text on the page, in page coordinates.
 *
 * The content stream is uncompressed, so this reads what was actually drawn
 * rather than what the code meant to draw. `text` places the BASELINE at y and
 * the glyphs sit above it, which is the detail that made the first version draw
 * its rules through its own words.
 */
function drawnOn(pdf) {
  const source = pdf.toString("latin1");
  const at = source.indexOf("stream", source.indexOf("/Contents"));
  const body = source.slice(at, source.indexOf("endstream", at));
  const height = Number(source.match(/MediaBox \[0 0 [\d.]+ ([\d.]+)\]/)[1]);

  const rules = [];
  for (const hit of body.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g)) {
    // Horizontal only: a vertical rule cannot strike a line of text through.
    if (Math.abs(Number(hit[2]) - Number(hit[4])) > 0.5) continue;
    rules.push({ y: height - Number(hit[2]), x1: Number(hit[1]), x2: Number(hit[3]) });
  }

  const texts = [];
  for (const hit of body.matchAll(/BT \/(F[123]) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(([^)]*)\) Tj ET/g)) {
    const size = Number(hit[2]);
    const x = Number(hit[3]);
    const baseline = height - Number(hit[4]);
    texts.push({
      text: hit[5],
      x1: x,
      x2: x + textWidth(hit[5], size, { bold: hit[1] === "F2" }),
      top: baseline - size * 0.72,
      bottom: baseline + size * 0.21,
    });
  }
  return { rules, texts };
}

test("no rule is drawn through a line of text", () => {
  // THE BUG THIS PINS. The totals block drew each rule a few points above the
  // baseline of the row under it, and a baseline is not the top of the words:
  // a 10pt row reaches about 7.5pt higher than that. So "Total" and "Amount
  // due" both came out struck through.
  const { rules, texts } = drawnOn(generateTaxInvoicePdf({ invoice: model() }));
  assert.ok(rules.length >= 4, "expected the table and totals rules");
  assert.ok(texts.length > 10, "expected the invoice to have text on it");

  const struck = [];
  texts.forEach((item) => {
    rules.forEach((rule) => {
      const overlapsAcross = rule.x1 < item.x2 && rule.x2 > item.x1;
      const cutsThrough = rule.y > item.top && rule.y < item.bottom;
      if (overlapsAcross && cutsThrough) struck.push(`"${item.text}" at y${item.top.toFixed(0)}`);
    });
  });
  assert.deepEqual(struck, [], `a rule is drawn through: ${struck.join(", ")}`);
});

test("no two pieces of text are drawn on top of each other", () => {
  const { texts } = drawnOn(generateTaxInvoicePdf({ invoice: model() }));
  const collisions = [];
  texts.forEach((a, index) => {
    texts.slice(index + 1).forEach((b) => {
      const across = a.x1 < b.x2 - 1 && a.x2 > b.x1 + 1;
      const down = a.top < b.bottom - 1 && a.bottom > b.top + 1;
      if (across && down) collisions.push(`"${a.text}" / "${b.text}"`);
    });
  });
  assert.deepEqual(collisions, [], `overlapping text: ${collisions.join(", ")}`);
});

test("everything stays inside the A4 page", () => {
  const pdf = generateTaxInvoicePdf({ invoice: model() });
  const { texts, rules } = drawnOn(pdf);
  texts.forEach((item) => {
    assert.ok(item.top > 0 && item.bottom < 842, `"${item.text}" runs off the page`);
    assert.ok(item.x1 >= 30, `"${item.text}" starts left of the margin`);
  });
  rules.forEach((rule) => assert.ok(rule.y > 0 && rule.y < 842, "a rule runs off the page"));
});

test("no cell's text crosses into the column beside it", () => {
  // THE BUG THIS PINS. The description was given a width that ran 19pt past
  // where the Quantity column started. Nothing overlapped exactly, so nothing
  // looked broken, but a long description ran on under the Quantity heading and
  // read as though it had spilled into the next column.
  //
  // A long description is used deliberately: a short one would fit whatever the
  // boundaries were and prove nothing.
  const long = {
    ...ORDER,
    subtotal_ex_gst: 140,
    gst_amount: 14,
    total_inc_gst: 154,
    delivery_cost_ex_gst: 0,
  };
  const wordy = [{
    title: "Door", height_mm: 600, width_mm: 508,
    colour: "Polar White Everest Antique Oak Notaio Walnut", finish: "Matt Woodmatt",
    edge_mould: "EM1 6mm Pencil Round", profile_type: "Detailed", profile: "Nostalgia Soft Arch",
    qty: 2, line_total_ex_gst: 140, hinge_holes: true, hinge_qty: "4 hinges", hinge_side: "Left",
  }];
  const invoice = taxInvoiceModel({
    order: long, items: wordy,
    payments: [{ payment_type: "final", amount: 154, is_paid: true }],
    issuedOn: new Date("2026-07-10T02:00:00Z"),
  });
  assert.ok(invoice.reconciled);

  const { texts } = drawnOn(generateTaxInvoicePdf({ invoice }));
  // Where the numeric columns begin, read off the page rather than assumed:
  // the Quantity heading is the leftmost thing in the first of them.
  const quantity = texts.find((item) => item.text === "Quantity");
  assert.ok(quantity, "no Quantity heading found");

  const spilling = texts.filter(
    (item) => item.text.startsWith("Door ") || item.text.includes("Nostalgia")
  );
  assert.ok(spilling.length >= 2, "expected the description to wrap over more than one line");
  spilling.forEach((item) => {
    assert.ok(
      item.x2 < quantity.x1,
      `"${item.text}" ends at ${item.x2.toFixed(0)}, past where the Quantity column starts at ${quantity.x1.toFixed(0)}`
    );
  });
});

test("every row in the totals block has equal air above and below it", () => {
  // Stacked baselines put the first row almost against the rule closing the
  // table. Each row owns a band now and its text is centred in it.
  //
  // The LAST match for each label, not the first: "Total" is also a column
  // heading at the top of the page, and an earlier version of this test found
  // that one, failed to see a rule above it, and silently checked nothing.
  const { texts, rules } = drawnOn(generateTaxInvoicePdf({ invoice: model() }));
  const lastNamed = (label) => texts.filter((entry) => entry.text === label).pop();

  // These two sit alone between two rules, so their air is measurable without
  // guessing which band a neighbour belongs to.
  let checked = 0;
  ["Total", "Amount due"].forEach((label) => {
    const item = lastNamed(label);
    assert.ok(item, `${label} is missing from the totals`);
    const above = rules.filter((rule) => rule.y < item.top).sort((a, b) => b.y - a.y)[0];
    const below = rules.filter((rule) => rule.y > item.bottom).sort((a, b) => a.y - b.y)[0];
    assert.ok(above, `no rule above ${label}`);
    if (!below) return;
    const air = { top: item.top - above.y, bottom: below.y - item.bottom };
    assert.ok(
      air.top > 3,
      `${label} sits only ${air.top.toFixed(1)} below the rule above it, which reads as crowded`
    );
    checked += 1;
  });
  assert.ok(checked >= 1, "the totals rows were not actually checked");

  // And the first row of the block is not jammed against the rule that closes
  // the table, which is what it used to be.
  const subtotal = lastNamed("Subtotal");
  const closing = rules.filter((rule) => rule.y < subtotal.top).sort((a, b) => b.y - a.y)[0];
  assert.ok(
    subtotal.top - closing.y > 4,
    `Subtotal sits ${(subtotal.top - closing.y).toFixed(1)} below the rule above it`
  );
});

test("the summary strip is three things across the full width", () => {
  // Reference said the same thing the invoice number already says on a job
  // whose reference is its own quote, so it was a column of nothing.
  const { texts } = drawnOn(generateTaxInvoicePdf({ invoice: model() }));
  const heads = texts.filter((item) => ["Amount due", "Issue date", "Invoice number", "Reference"].includes(item.text));
  const inStrip = heads.filter((item) => item.top < 260);
  assert.deepEqual(
    inStrip.map((item) => item.text).sort(),
    ["Amount due", "Invoice number", "Issue date"],
    "the strip should be those three and nothing else"
  );
  // Spread across the page, not bunched into the first three quarters of it.
  const xs = inStrip.map((item) => item.x1).sort((a, b) => a - b);
  assert.ok(xs[0] < 40, "the first should start at the margin");
  assert.ok(xs[2] > 380, `the last should reach across the page, it starts at ${xs[2].toFixed(0)}`);
});

test("every rule in the totals block has the same air above it as below it", () => {
  // THE UNEVENNESS THIS PINS. Each rule used to be drawn in a gap of its own,
  // so a row sat 7.4pt below the rule above it and 12.6pt above the rule below
  // it. The same separator had different air on each side, which is exactly
  // what "the spacing does not look even" is.
  //
  // Rules sit on a band boundary now, so the air either side is the band's own
  // padding, which is one number by construction.
  const { texts, rules } = drawnOn(generateTaxInvoicePdf({ invoice: model() }));

  // The totals block only: below the table, above the closing note.
  const note = texts.find((item) => item.text.startsWith("This invoice has been paid"));
  const totalsRules = rules.filter((rule) => rule.x1 > MARGIN_X && rule.y < note.top);
  assert.ok(totalsRules.length >= 2, "expected the rules inside the totals block");

  totalsRules.forEach((rule) => {
    const above = texts.filter((item) => item.bottom <= rule.y).sort((a, b) => b.bottom - a.bottom)[0];
    const below = texts.filter((item) => item.top >= rule.y && item.top < note.top).sort((a, b) => a.top - b.top)[0];
    if (!above || !below) return;
    const air = { top: rule.y - above.bottom, bottom: below.top - rule.y };
    assert.ok(
      Math.abs(air.top - air.bottom) < 1.5,
      `a rule has ${air.top.toFixed(2)} above it and ${air.bottom.toFixed(2)} below it`
    );
  });
});

test("the totals rows are evenly spaced from each other", () => {
  const { texts } = drawnOn(generateTaxInvoicePdf({ invoice: model() }));
  const labels = ["Subtotal", "Total GST 10%", "Less amount paid"].map((label) =>
    texts.filter((item) => item.text === label).pop()
  );
  assert.ok(labels.every(Boolean), "a totals label is missing");

  // Subtotal to Total GST sit in the same group with no rule between them, so
  // the step from one to the next is the honest measure of the rhythm.
  const step = labels[1].top - labels[0].top;
  assert.ok(step > 20 && step < 28, `rows step ${step.toFixed(1)}, which is not the band height`);
});

test("the invoice can be read before it is sent", () => {
  // A QA check has to be one click from the modal, and it has to OPEN rather
  // than download: an attachment lands in a downloads folder, which is a worse
  // way to check something you are about to email and leaves a folder full of
  // near-identical files behind.
  const modal = readFileSync(
    new URL("../app/admin/orders/[id]/TaxInvoiceModal.js", import.meta.url), "utf8"
  );
  assert.match(modal, /tax-invoice\?inline=1/, "no way to open the PDF from the modal");
  assert.match(modal, /window\.open\(/);
  // Beside the invoice it is checking, not down in the footer next to Cancel.
  //
  // Checked by where it is NOT: the footer is a prop, so it appears earlier in
  // the file than the body it renders below. Source order is not screen order
  // and an assertion built on it proves nothing.
  const footerStart = modal.indexOf("footer={");
  const footerEnd = modal.indexOf("      }\n    >", footerStart);
  const footer = modal.slice(footerStart, footerEnd);
  assert.ok(footer.includes("Send invoice"), "the footer should still hold the decision");
  assert.ok(
    !footer.includes("Open the PDF to check it"),
    "the check belongs beside the invoice, not in the footer next to Cancel"
  );
});

test("inline is for reading, attachment is for keeping", () => {
  const route = readFileSync(
    new URL("../app/api/admin/orders/[id]/tax-invoice/route.js", import.meta.url), "utf8"
  );
  assert.match(route, /searchParams\.get\("inline"\) === "1"/);
  assert.match(route, /inline \? "inline" : "attachment"/);
  // And the gate still applies to both: reading it early would be reading a
  // document that says a job is settled when it is not.
  assert.match(route, /loadTaxInvoice\(context\.supabase, orderId\)/);
  assert.match(route, /if \(!loaded\.ok\)/);
});

// ── the two costs an order does not store as a column ───────────────────────

test("labour is worked out from hours and rate, because there is no cost column", () => {
  // THE BUG THIS PINS. pcd_orders carries labour_hours and worker_hourly_rate,
  // NOT a labour_cost_ex_gst. Reading a column that does not exist gave zero, so
  // a real order with one hour on it invoiced 85 dollars light and the
  // reconciliation refused it with no idea why.
  const withLabour = { ...ORDER, labour_hours: 1, worker_hourly_rate: 85, subtotal_ex_gst: 306.4 };
  const lines = taxInvoiceLines({ order: withLabour, items: ITEMS, drillingByLineId: DRILLING });
  const labour = lines.find((line) => line.description === "Labour");

  assert.ok(labour, "labour is missing from the invoice");
  assert.equal(labour.totalExGst, 85);
  // Hours at a rate, not a lump: it is what the customer agreed to and the
  // table already has a column for each.
  assert.equal(labour.qty, 1);
  assert.equal(labour.unitPriceExGst, 85);
});

test("an order with no labour on it does not get a labour line", () => {
  const lines = taxInvoiceLines({ order: ORDER, items: ITEMS, drillingByLineId: DRILLING });
  assert.ok(!lines.some((line) => line.description === "Labour"));
});

test("edging comes off the quote, because the order never stored it", () => {
  // It was worked out from the lines when the quote was priced and baked into
  // the subtotal the order inherited. Recomputing it here would use today's ABS
  // rate, which is not what the customer was charged.
  const lines = taxInvoiceLines({
    order: ORDER, items: ITEMS, drillingByLineId: DRILLING, edgingCostExGst: 12.5,
  });
  const edging = lines.find((line) => line.description === "Edging");
  assert.ok(edging, "edging is missing");
  assert.equal(edging.totalExGst, 12.5);
});

test("a real order's costs reconcile once labour is counted", () => {
  // The exact shape that failed: two lines, an hour of labour and a delivery.
  const order = {
    ...ORDER,
    labour_hours: 1, worker_hourly_rate: 85, delivery_cost_ex_gst: 40,
    subtotal_ex_gst: 405, gst_amount: 40.5, total_inc_gst: 445.5,
  };
  const items = [
    { title: "Drawer front", height_mm: 177, width_mm: 897, qty: 2, line_total_ex_gst: 175 },
    { title: "Drawer front", height_mm: 356, width_mm: 897, qty: 1, line_total_ex_gst: 105 },
  ];
  const invoice = taxInvoiceModel({
    order, items,
    payments: [{ payment_type: "final", amount: 445.5, is_paid: true }],
    issuedOn: new Date("2026-08-25T02:00:00Z"),
  });
  assert.equal(invoice.reconciled, true, `off by ${invoice.difference}`);
  assert.equal(invoice.subtotal, 405);
  assert.deepEqual(
    invoice.lines.map((line) => line.description),
    ["Drawer front Height: 177mm Width: 897mm", "Drawer front Height: 356mm Width: 897mm", "Labour", "Delivery"]
  );
});

test("every term in the order's subtotal has somewhere to appear", () => {
  // The guard against the next one of these. calculateQuoteTotals adds nine
  // things together; if the invoice cannot show one of them, an order that uses
  // it can never be invoiced and the message will not say why.
  const order = {
    ...ORDER,
    labour_hours: 2, worker_hourly_rate: 85,
    travel_cost_ex_gst: 10, delivery_cost_ex_gst: 20, installation_cost_ex_gst: 30,
    painting_cost_ex_gst: 40, glass_cost_ex_gst: 50, removal_cost_ex_gst: 60,
  };
  const shown = orderCostLines(order, { edgingCostExGst: 70 }).map((line) => line.description);
  assert.deepEqual(shown, [
    "Labour", "Travel", "Delivery", "Consumables", "Painting", "Glass", "Removal and disposal", "Edging",
  ]);
  const sum = orderCostLines(order, { edgingCostExGst: 70 }).reduce((t, line) => t + line.totalExGst, 0);
  assert.equal(sum, 170 + 10 + 20 + 30 + 40 + 50 + 60 + 70);
});

test("a refusal talks in money, not bare numbers", () => {
  // "adds up to 320 but the order says 405" reads as a count of something and
  // makes a costing problem look like a system fault.
  assert.match(LOADER, /money\(invoice\.subtotal \+ invoice\.difference, order\.currency\)/);
  assert.match(LOADER, /money\(invoice\.subtotal, order\.currency\)/);
});
