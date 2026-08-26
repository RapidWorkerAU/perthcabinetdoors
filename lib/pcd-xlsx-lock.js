// LOCKING THE STRUCTURE OF A WORKBOOK.
//
// ExcelJS can password protect a SHEET but has no way to protect the WORKBOOK,
// and the two stop different things. Sheet protection stops cells being edited.
// Workbook protection stops sheets being added, deleted, renamed, moved or
// unhidden, which on this file is what keeps the machinery out of reach: the
// dropdowns all read named ranges on a hidden sheet, and a workbook whose
// sheets can be reorganised is one where those can be broken without anybody
// touching a cell.
//
// So the attribute is written straight into the part afterwards. It is one
// element in a schema that has been stable since 2006, and the alternative is
// shipping a form that says it is locked and is not.
//
// This is NOT encryption and does not pretend to be. Anyone determined can get
// past it, the same as with any Excel password. It is here to stop an accident,
// which is the thing that actually happens.

import { createHash, randomBytes } from "node:crypto";
import JSZip from "jszip";

const SPIN_COUNT = 100000;

const escapeAttribute = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * Excel's password hash, which is a salted SHA-512 respun a hundred thousand
 * times with the iteration number mixed in each round. The counter is the part
 * that stops this being an ordinary PBKDF2, and it is why this is written out
 * rather than taken from a library.
 *
 * Node's own crypto rather than ExcelJS's copy of the same code: that one lives
 * at an internal path with no extension, which does not resolve under an ESM
 * loader and is not part of anything ExcelJS promises to keep.
 */
export function excelPasswordHash(password, saltValue, spinCount = SPIN_COUNT) {
  const sha512 = (...parts) => createHash("sha512").update(Buffer.concat(parts)).digest();
  // UTF-16LE, which is how Excel reads a password before hashing it.
  let key = sha512(Buffer.from(saltValue, "base64"), Buffer.from(password, "utf16le"));
  for (let i = 0; i < spinCount; i += 1) {
    const iteration = Buffer.alloc(4);
    iteration.writeUInt32LE(i, 0);
    key = sha512(key, iteration);
  }
  return key.toString("base64");
}

/**
 * The `workbookProtection` element, hashed the modern way rather than with
 * Excel's old sixteen bit password hash, which is trivially reversible and
 * which newer Excel warns about.
 */
export function workbookProtectionXml(password, { salt = null } = {}) {
  const saltValue = salt || randomBytes(16).toString("base64");
  const hashValue = excelPasswordHash(password, saltValue);
  return (
    `<workbookProtection workbookAlgorithmName="SHA-512"` +
    ` workbookHashValue="${escapeAttribute(hashValue)}"` +
    ` workbookSaltValue="${escapeAttribute(saltValue)}"` +
    ` workbookSpinCount="${SPIN_COUNT}"` +
    ` lockStructure="1"/>`
  );
}

/**
 * Where the element has to go.
 *
 * The schema fixes the order of a workbook's children, and Excel refuses to
 * open a file that gets it wrong: fileVersion, fileSharing, workbookPr,
 * workbookProtection, bookViews, sheets. So it goes immediately before whichever
 * of bookViews or sheets comes first, which is the earliest legal position and
 * the only one that does not depend on which optional parts are present.
 */
export function insertWorkbookProtection(workbookXml, element) {
  if (workbookXml.includes("<workbookProtection")) return workbookXml;
  const at = ["<bookViews", "<sheets"]
    .map((tag) => workbookXml.indexOf(tag))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (at === undefined) throw new Error("This workbook has no sheets element, so it cannot be locked.");
  return workbookXml.slice(0, at) + element + workbookXml.slice(at);
}

/**
 * A finished .xlsx buffer with its structure locked.
 *
 * @param {Buffer} buffer   what ExcelJS wrote
 * @param {string} password the same one the sheets are protected with
 * @returns {Promise<Buffer>}
 */
export async function lockWorkbookStructure(buffer, password) {
  const zip = await JSZip.loadAsync(buffer);
  const part = zip.file("xl/workbook.xml");
  if (!part) throw new Error("That does not look like a workbook.");

  const xml = await part.async("string");
  zip.file("xl/workbook.xml", insertWorkbookProtection(xml, workbookProtectionXml(password)));

  // DEFLATE, because the parts were compressed when ExcelJS wrote them and a
  // rewrite that stores them instead makes the file several times bigger for
  // no reason. Excel reads either.
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
