// THE QUOTE THE OFFICE SEES AND THE QUOTE THE CUSTOMER SEES ARE ONE QUOTE.
//
// Every one of these started as a real mismatch. A panel quoted with a front
// profile, priced with it and made with it, printed a dash on the customer's
// copy because the customer facing side kept its own rule about which products
// were allowed a profile. A board recorded as 21mm was described to the
// customer with no thickness at all, in a group headed by an 18mm board of the
// same colour. Neither was visible from either screen on its own: you had to
// hold the editor and the PDF side by side to see it.
//
// So this reads the generated PDF back and asserts on what actually printed.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { generateQuotePdf } from "../lib/pcd-cabinet-pdf.js";
import { BOARD_FIELDS } from "../lib/pcd-quote-line-display.js";

// Every string the file draws, in the order it draws them. The page streams are
// plain text, so this is the words on the page rather than a proxy for them.
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

function quotePdf(lines, quote = {}) {
  return printedText(
    generateQuotePdf({
      quote: {
        quote_number: "PCD-Q-2026-0001",
        customer_name: "Test Customer",
        created_at: "2026-02-24",
        valid_until: "2026-03-14",
        ...quote,
      },
      lines,
      businessDefaults: {},
      includeCabinetDrawings: false,
    })
  );
}

const board = (extra) => ({
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
  unit_price_ex_gst: 100,
  line_total_ex_gst: 100,
  ...extra,
});

test("a front profile prints on whatever product carries one", () => {
  // The editor puts a front profile on a panel with nothing stopping it, so a
  // panel that has one has to print it.
  const printed = quotePdf([board({ product_type: "Panel", product_name: "Panel", profile: "Cove 25", profile_type: "Fluted" })]);
  assert.ok(printed.includes("Cove 25"), `the profile is missing from: ${printed.join(" | ")}`);
});

test("the thickness on the line reaches the customer", () => {
  const printed = quotePdf([board({ thickness: "21mm" })]);
  assert.ok(printed.includes("21mm"), `the thickness is missing from: ${printed.join(" | ")}`);
});

test("two boards that differ only in thickness are two groups", () => {
  // Grouping them together would put one heading over both, and that heading
  // can only name one of the two thicknesses.
  const printed = quotePdf([board({ thickness: "18mm" }), board({ thickness: "21mm" })]);
  assert.ok(printed.includes("18mm"), "the 18mm board is not described");
  assert.ok(printed.includes("21mm"), "the 21mm board is not described");
  assert.equal(
    printed.filter((text) => text === "THICKNESS").length,
    2,
    "each thickness needs its own group heading"
  );
});

test("the grouping key and the heading are built from the same list", () => {
  // The bug this guards is a heading that names more than the key groups on, so
  // a group's heading describes only its first line. One list, read twice.
  const viewer = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../lib/pcd-cabinet-pdf.js", import.meta.url), "utf8");
  [["the quote viewer", viewer], ["the quote PDF", pdf]].forEach(([what, source]) => {
    assert.match(source, /boardGroupKey\(line\)/, `${what} has to group on the shared key`);
    assert.match(source, /boardGroupSpec\(first\)/, `${what} has to head the group from the shared list`);
  });
  assert.deepEqual(
    BOARD_FIELDS.map((field) => field.key),
    ["material", "finish", "colour", "thickness"],
    "the board is these four things"
  );
});

test("the drilling, the sizes and the line note all print", () => {
  const printed = quotePdf([
    board({
      hinge_holes: true,
      hinge_qty: 2,
      hinge_side: "Left",
      edge_mould: "EM0 Square",
      client_note: "Handle side to match the pantry.",
    }),
  ]).join(" | ");

  assert.match(printed, /720 \(H\) x 397 \(W\) mm/, "the size, height first, with its units");
  assert.match(printed, /Drilled, 2 hinges/, "how many hinges");
  assert.match(printed, /Hinged left/, "which side it is hinged");
  assert.match(printed, /EM0 Square/, "the edge profile");
  // The note wraps inside the item column, so it arrives as more than one drawn
  // string. What matters is that it is labelled and it is there.
  assert.match(printed, /Note: Handle side to match the/, "the note the customer wrote");
  assert.match(printed, /pantry\./, "the rest of the note");
});

test("the internal note is never printed", () => {
  // `notes` is the office's own column. `client_note` is the one the customer
  // is meant to see, and the two are one keystroke apart in the editor.
  const printed = quotePdf([board({ notes: "Chase the deposit before cutting", client_note: "" })]).join(" | ");
  assert.ok(!printed.includes("Chase the deposit"), "an internal note reached the customer");
});

test("a hardware line says which item it is", () => {
  const printed = quotePdf([
    {
      id: "h1",
      product_type: "Hardware",
      hardware_type: "hinge",
      product_name: "Blum 110 degree clip top",
      qty: 24,
      unit_price_ex_gst: 4.2,
      line_total_ex_gst: 100.8,
    },
  ]);
  assert.ok(printed.includes("Blum 110 degree clip top"), `the item is missing from: ${printed.join(" | ")}`);
});

test("the line numbers are the numbers on the quote, not the order they group in", () => {
  // Grouping reorders the rows on the page. A customer ringing about "line 3"
  // and the office looking at line 3 have to be looking at the same line.
  // Quantities are set well clear of 1, 2 and 3 so a bare "1" on the page can
  // only be a line number and not a quantity that happens to match.
  const printed = quotePdf([
    board({ colour: "Agave", qty: 40 }),
    board({ colour: "Aston White", qty: 50 }),
    board({ colour: "Agave", qty: 60 }),
  ]);

  // Agave holds lines 1 and 3, Aston White holds line 2. Grouping puts line 3
  // above line 2 on the page, and it is still called line 3.
  ["1", "2", "3"].forEach((number) => {
    assert.equal(printed.filter((text) => text === number).length, 1, `line ${number} is printed once`);
  });
  const agaveThird = printed.indexOf("3");
  const astonSecond = printed.indexOf("2");
  assert.ok(agaveThird < astonSecond, "line 3 groups with line 1, above line 2");
});
