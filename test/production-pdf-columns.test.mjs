// COLUMN SHARES HAVE TO ADD UP TO A HUNDRED.
//
// shareColumns divides each share by 100 and lays the columns out left to
// right, so a table adding up to more than a hundred does not squeeze to fit:
// it is drawn wider than the page and the last column runs off the edge.
//
// The made to order table added up to 108, and the notes, which are last and
// are the column people actually write in, spilled outside the table.

import test from "node:test";
import assert from "node:assert/strict";

import { PDF_COLUMN_SHARES, columnShareTotal } from "../lib/pcd-cabinet-pdf.js";

test("every table on the production list fits the page exactly", () => {
  Object.entries(PDF_COLUMN_SHARES).forEach(([name, shares]) => {
    assert.equal(columnShareTotal(shares), 100, `${name} adds up to ${columnShareTotal(shares)}, not 100`);
  });
});

test("the made to order table has no supplier paperwork columns", () => {
  // The reference and the ETA are the supplier's paperwork, they are on screen
  // in the order, and between them they took a seventh of the page away from
  // the notes.
  const keys = PDF_COLUMN_SHARES.madeToOrder.map((column) => column.key);
  assert.ok(!keys.includes("ref"), "the reference is off the sheet");
  assert.ok(!keys.includes("eta"), "and so is the ETA");
});

test("notes get the width", () => {
  const notes = PDF_COLUMN_SHARES.madeToOrder.filter((column) => column.key === "notes")[0];
  assert.ok(notes, "there is a notes column");
  assert.ok(notes.share >= 20, `notes are only ${notes.share}% of the page`);
});
