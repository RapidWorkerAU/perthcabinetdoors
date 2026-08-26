// LOCKING THE ORDER FORM.
//
// Not security. The workbook is machinery: a hidden sheet of named ranges, a
// helper column per filtered dropdown, a check formula on every row. A customer
// who clears one of those breaks the dropdown beside it and gets nothing to say
// why, and the first anybody here knows is a form coming back with half its
// answers missing.
//
// So everything is locked EXCEPT the cells a person is meant to fill in, and
// the whole point of these tests is the second half of that sentence.

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";

import { buildOrderFormWorkbook, SHEET_PASSWORD } from "../lib/pcd-order-form-workbook.js";
import {
  excelPasswordHash,
  insertWorkbookProtection,
  lockWorkbookStructure,
  workbookProtectionXml,
} from "../lib/pcd-xlsx-lock.js";

const COLOURS = [
  { name: "Classic White", supplier_name: "Polytec", material_type: "decorative board", thickness: "18mm", finish_type: "Matt", is_active: true },
  { name: "Coastal Oak", supplier_name: "Laminex", material_type: "thermolaminate", thickness: "18mm", finish_type: "Woodmatt", is_active: true },
];
const HARDWARE = [{ type: "hinge", brand: "Blum", name: "110 Deg Inserta", is_active: true }];

/** Where a heading sits, so a test does not pin a letter that shifts. */
function headingColumn(sheet, head) {
  for (let column = 1; column <= 40; column += 1) {
    const letter = sheet.getColumn(column).letter;
    const value = String(sheet.getCell(`${letter}7`).value || "").replace(/ \*$/, "");
    if (value === head) return letter;
  }
  throw new Error(`no column headed "${head}"`);
}

async function built() {
  const workbook = await buildOrderFormWorkbook({
    colours: COLOURS,
    hardware: HARDWARE,
    generatedOn: "1 January 2026",
  });
  const written = Buffer.from(await workbook.xlsx.writeBuffer());
  const locked = await lockWorkbookStructure(written, SHEET_PASSWORD);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(locked);
  return { locked, workbook: reopened };
}

// ── The password ────────────────────────────────────────────────────────────

test("the hash is Excel's, so Excel will accept the password", () => {
  // Salted SHA-512 respun a hundred thousand times with the iteration number
  // mixed in each round. The counter is what stops this being an ordinary
  // PBKDF2, and getting it wrong makes a password nothing can open.
  const salt = "n0eOSUwOklmV+rxBOZgRVA==";
  const hash = excelPasswordHash("pcdorderform2026", salt);
  assert.equal(hash, excelPasswordHash("pcdorderform2026", salt), "the same password has to hash the same");
  assert.notEqual(hash, excelPasswordHash("pcdorderform2027", salt));
  assert.notEqual(hash, excelPasswordHash("pcdorderform2026", "AAAAAAAAAAAAAAAAAAAAAA=="), "the salt has to matter");
  assert.equal(Buffer.from(hash, "base64").length, 64, "SHA-512 is 64 bytes");
});

test("a fresh salt every time, so two files never share a hash", () => {
  const first = workbookProtectionXml("pcdorderform2026");
  const second = workbookProtectionXml("pcdorderform2026");
  assert.notEqual(first, second);
  assert.match(first, /lockStructure="1"/);
  assert.match(first, /workbookAlgorithmName="SHA-512"/);
  assert.match(first, /workbookSpinCount="100000"/);
});

test("every sheet is protected, and with the password rather than without", async () => {
  // Protection with no password is a Review menu away from being off, which is
  // the same as not being there.
  const { workbook } = await built();
  let sheets = 0;
  workbook.eachSheet((sheet) => {
    sheets += 1;
    const protection = sheet.sheetProtection || {};
    assert.equal(protection.sheet, true, `${sheet.name} is not protected`);
    assert.ok(protection.hashValue, `${sheet.name} is protected with no password`);
    assert.equal(protection.algorithmName, "SHA-512");
    assert.equal(
      excelPasswordHash(SHEET_PASSWORD, protection.saltValue, protection.spinCount),
      protection.hashValue,
      `${sheet.name} does not open with the password we tell people`
    );
  });
  assert.equal(sheets, 5);
});

// ── And yet they can still fill it in ───────────────────────────────────────

test("every column a person answers is still theirs to type in", async () => {
  // The one that matters. A lockdown that catches a real input column is worse
  // than no lockdown: they cannot finish the form and they do not know why.
  const { workbook } = await built();
  const sheet = workbook.getWorksheet("Order Form");

  const locked = [];
  for (let column = 1; column <= 27; column += 1) {
    const letter = sheet.getColumn(column).letter;
    const head = String(sheet.getCell(`${letter}7`).value || "").replace(/ \*$/, "");
    if (!head) continue;
    if (sheet.getCell(`${letter}8`).protection?.locked !== false) locked.push(head);
  }
  // Only these two, and both for a reason: the line number is ours and the
  // check column is a formula that a paste over would take with it.
  assert.deepEqual(locked, ["#", "Is this line complete?"]);
});

test("the height and width can still be typed over", async () => {
  // They carry a formula that fills them in from a standard size. If locking
  // the workbook locked those, a line that is not a kit cabinet could never be
  // given a size at all.
  const { workbook } = await built();
  const sheet = workbook.getWorksheet("Order Form");
  ["Height mm", "Width mm"].forEach((head) => {
    const letter = headingColumn(sheet, head);
    assert.ok(sheet.getCell(`${letter}8`).formula, `${head} should carry the standard size formula`);
    assert.equal(sheet.getCell(`${letter}8`).protection?.locked, false, `${head} cannot be typed over`);
  });
});

test("every question on the details sheet has a box that can be typed in", async () => {
  const { workbook } = await built();
  const sheet = workbook.getWorksheet("Your Details");
  let questions = 0;
  for (let row = 5; row <= 40; row += 1) {
    const label = sheet.getCell(`B${row}`).value;
    if (!label || typeof label !== "string") continue;
    const text = label.trim();
    // A question is a short label. The section headings are all capitals and
    // the closing paragraph is a sentence, and neither has a box beside it.
    if (/^[A-Z ]+$/.test(text) || text.length > 60) continue;
    questions += 1;
    assert.equal(sheet.getCell(`C${row}`).protection?.locked, false, `"${text}" has no box to answer in`);
  }
  assert.ok(questions >= 14, `only found ${questions} questions`);
});

test("the last row is wired the same as the first, so a long order still works", async () => {
  const { workbook } = await built();
  const sheet = workbook.getWorksheet("Order Form");
  ["Brand", "Colour", "Height mm", "Notes for this line"].forEach((head) => {
    const letter = headingColumn(sheet, head);
    assert.equal(sheet.getCell(`${letter}107`).protection?.locked, false, `${head} is locked on the last row`);
  });
});

// ── What the lock actually stops ────────────────────────────────────────────

test("the columns holding the machinery cannot be unhidden", async () => {
  // Allowing column formatting is what would let somebody widen a hidden helper
  // back into view and edit it. Row height stays theirs, so a long note still
  // grows its row.
  const { workbook } = await built();
  ["Your Details", "Order Form", "How to fill this in"].forEach((name) => {
    const protection = workbook.getWorksheet(name).sheetProtection || {};
    assert.notEqual(protection.formatColumns, true, `${name} allows columns to be reformatted`);
  });
});

test("the sheet can still be filtered and sorted", async () => {
  // Locked down is not the same as unusable. A hundred rows with no filter is
  // worse to work in than a sheet somebody might have broken.
  const { workbook } = await built();
  const protection = workbook.getWorksheet("Order Form").sheetProtection || {};
  assert.equal(protection.autoFilter, true);
  assert.equal(protection.sort, true);

  // Selection is allowed by leaving it unsaid, which is what Excel's own
  // default is, so the test is that it has not been explicitly taken away.
  assert.notEqual(protection.selectUnlockedCells, false, "they cannot click into a cell to type");
  assert.notEqual(protection.selectLockedCells, false, "they cannot even click a cell to read it");

  // And the machinery sheet is the one place selection IS taken away, which is
  // what makes the two settings meaningfully different rather than both unset.
  const lists = workbook.getWorksheet("Lists").sheetProtection || {};
  assert.equal(lists.selectUnlockedCells, false);
  assert.equal(lists.selectLockedCells, false);
});

test("the two machinery sheets are out of the tab strip and cannot be unhidden", async () => {
  // veryHidden rather than hidden: hidden sheets are listed in Excel's Unhide
  // dialog, so hiding the lists that way would be a right click from being
  // edited by somebody who then believes they have changed what we stock.
  const { workbook } = await built();
  assert.equal(workbook.getWorksheet("Lists").state, "veryHidden");
  assert.equal(workbook.getWorksheet("Colour list").state, "veryHidden");
  ["Your Details", "Order Form", "How to fill this in"].forEach((name) => {
    const state = workbook.getWorksheet(name).state;
    assert.ok(state === "visible" || state === undefined, `${name} should be on the tab strip`);
  });
});

test("the structure is locked, so a sheet cannot be deleted or renamed", async () => {
  // ExcelJS has no way to write this, so it goes in afterwards. Without it a
  // sheet the dropdowns depend on can be removed without a cell being touched.
  const { locked } = await built();
  const zip = await JSZip.loadAsync(locked);
  const xml = await zip.file("xl/workbook.xml").async("string");
  assert.match(xml, /<workbookProtection[^>]*lockStructure="1"/);

  const salt = xml.match(/workbookSaltValue="([^"]+)"/)[1];
  const hash = xml.match(/workbookHashValue="([^"]+)"/)[1];
  assert.equal(excelPasswordHash(SHEET_PASSWORD, salt), hash, "the workbook does not open with our password");
});

test("the protection element goes where the schema says, or Excel will not open the file", () => {
  // fileVersion, fileSharing, workbookPr, workbookProtection, bookViews, sheets.
  // Out of order is a file that will not open at all rather than one that opens
  // unprotected, so this is worth pinning.
  const withViews = insertWorkbookProtection(
    `<workbook><workbookPr/><bookViews><workbookView/></bookViews><sheets/></workbook>`,
    "<workbookProtection/>"
  );
  assert.match(withViews, /<workbookPr\/><workbookProtection\/><bookViews>/);

  // And where there are no bookViews, immediately before the sheets.
  const withoutViews = insertWorkbookProtection(
    `<workbook><workbookPr/><sheets/></workbook>`,
    "<workbookProtection/>"
  );
  assert.match(withoutViews, /<workbookPr\/><workbookProtection\/><sheets\/>/);
});

test("locking a workbook twice does not stack two elements", async () => {
  const already = `<workbook><workbookProtection lockStructure="1"/><sheets/></workbook>`;
  assert.equal(insertWorkbookProtection(already, "<workbookProtection/>"), already);
});

test("locking keeps the workbook readable and does not bloat it", async () => {
  // The parts were compressed when ExcelJS wrote them, and a rewrite that
  // stores them instead makes the file several times bigger for no reason.
  const workbook = await buildOrderFormWorkbook({ colours: COLOURS, hardware: HARDWARE });
  const written = Buffer.from(await workbook.xlsx.writeBuffer());
  const locked = await lockWorkbookStructure(written, SHEET_PASSWORD);

  assert.ok(locked.length < written.length * 1.5, `${written.length} became ${locked.length}`);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(locked);
  assert.ok(reopened.getWorksheet("Order Form"), "the locked file no longer opens");
});

test("a file that is not a workbook is refused rather than half written", async () => {
  const zip = new JSZip();
  zip.file("something.txt", "not a workbook");
  const notAWorkbook = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => lockWorkbookStructure(notAWorkbook, "x"), /does not look like a workbook/);
});

// ── And the customer is told ────────────────────────────────────────────────

test("the help sheet says why some of it will not let them type", async () => {
  // A locked cell with no explanation reads as a broken file. It says what is
  // locked, how to clear a row given the line number is not, and that the
  // password is available for the asking.
  const { workbook } = await built();
  const sheet = workbook.getWorksheet("How to fill this in");
  const words = [];
  for (let row = 1; row <= 90; row += 1) {
    ["B", "C"].forEach((letter) => {
      const value = sheet.getCell(`${letter}${row}`).value;
      if (value) words.push(String(value));
    });
  }
  const all = words.join(" ");
  assert.match(all, /will not let you type/i);
  assert.match(all, /To clear a row/i);
  assert.match(all, /hundred rows/i);
  assert.match(all, /we will tell you the password/i);
});
