// AN .XLSX THAT IS VALID BUT THAT OUR READER CANNOT PARSE, MADE READABLE.
//
// ── THE PROBLEM ──────────────────────────────────────────────────────────────
//
// XML lets a document bind its namespace to a PREFIX instead of making it the
// default, and the two are the same document:
//
//   <workbook xmlns="…/spreadsheetml/2006/main">        what Excel writes
//   <x:workbook xmlns:x="…/spreadsheetml/2006/main">    equally valid
//
// Excel writes the first. LibreOffice Calc and several online editors write the
// second, and a customer who opens our order form in one of those and saves it
// gets a file Excel is perfectly happy with.
//
// ExcelJS is not. It matches element names literally, `case 'workbook':`, so a
// prefixed file parses to nothing and fails with "Cannot read properties of
// undefined (reading 'sheets')" — a message that sounds like a corrupt file and
// sent somebody looking for a fault in the form itself.
//
// ── WHAT THIS DOES ───────────────────────────────────────────────────────────
//
// Rewrites the prefix out of ELEMENT NAMES only, and promotes that namespace
// back to the default. Attributes are left exactly alone, because `r:id` on a
// sheet is a different namespace and is load bearing: strip that and the
// workbook stops pointing at its own worksheets.
//
// Nothing else in the file is touched, and a file that does not need it is
// handed back unchanged rather than rebuilt.

import JSZip from "jszip";

/**
 * The namespaces whose ELEMENTS our reader matches by bare name.
 *
 * The relationship namespaces are deliberately not here. `r:` is prefixed in
 * every workbook Excel has ever written, including ours, and it belongs on
 * ATTRIBUTES (`r:id`), which this never touches. Listing it made our own file
 * look like one that needed rewriting.
 */
const NAMESPACES = [
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://schemas.openxmlformats.org/package/2006/relationships",
];

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Which prefixes this document binds to a namespace we read by name.
 *
 * Read off the declarations rather than assumed, because the prefix is the
 * writer's choice: "x", "ss", "main" and bare letters are all in the wild.
 */
export function prefixesFor(xml) {
  const found = new Set();
  for (const namespace of NAMESPACES) {
    const pattern = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)\\s*=\\s*"${escapeRe(namespace)}"`, "g");
    let match = pattern.exec(xml);
    while (match) {
      found.add(match[1]);
      match = pattern.exec(xml);
    }
  }
  return [...found];
}

/**
 * One XML part with its prefixes taken off the element names.
 *
 * Returns the same string when there is nothing to do, so a caller can tell
 * whether the file needs rebuilding at all.
 */
export function unprefixXml(xml) {
  const prefixes = prefixesFor(xml);
  if (!prefixes.length) return xml;

  let out = xml;
  for (const prefix of prefixes) {
    const p = escapeRe(prefix);
    // Opening and closing tags. Attributes are deliberately not matched: this
    // only ever fires straight after a "<" or a "</".
    out = out.replace(new RegExp(`<(/?)${p}:([A-Za-z_][\\w.-]*)`, "g"), "<$1$2");
    // The declaration itself becomes the default namespace, so the document
    // still says which schema it is, and anything we did not rewrite (an
    // attribute value naming the prefix) has nothing dangling.
    out = out.replace(
      new RegExp(`xmlns:${p}\\s*=\\s*"(${NAMESPACES.map(escapeRe).join("|")})"`, "g"),
      (whole, namespace) => (/\sxmlns\s*=/.test(out) ? whole : `xmlns="${namespace}"`)
    );
  }
  return out;
}

/** Whether this workbook is one our reader would fail on. */
export async function needsUnprefixing(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const part = zip.file("xl/workbook.xml");
    if (!part) return false;
    return prefixesFor(await part.async("string")).length > 0;
  } catch {
    return false;
  }
}

/**
 * The same workbook, in the spelling our reader understands.
 *
 * Every XML part is rewritten, not just the workbook: the worksheets carry the
 * same namespace, and a workbook that parses over sheets that do not is a file
 * that opens to no rows at all, which is worse than one that refuses.
 *
 * @returns {Promise<Buffer|null>} null when the file did not need it.
 */
export async function unprefixWorkbook(buffer) {
  if (!(await needsUnprefixing(buffer))) return null;

  const zip = await JSZip.loadAsync(buffer);
  let touched = false;
  const parts = Object.keys(zip.files).filter((name) => /\.(xml|rels)$/i.test(name) && !zip.files[name].dir);

  for (const name of parts) {
    const xml = await zip.file(name).async("string");
    const next = unprefixXml(xml);
    if (next !== xml) {
      zip.file(name, next);
      touched = true;
    }
  }
  if (!touched) return null;
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
