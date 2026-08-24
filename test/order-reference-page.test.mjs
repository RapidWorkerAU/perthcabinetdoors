// THE COLOUR AND PROFILE REFERENCE PAGE.
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
//
// Checking a delivery off means reading a row on the production sheet and then
// looking at the thing in your hands. "Prime Oak Ravine" and "Prime Oak Riven"
// are two lines of text on a page and two boards that look nothing alike. A
// person holding the board can tell them apart instantly and often cannot tell
// from the name.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   ONLY THIS ORDER. A catalogue of everything Polytec makes would be worse
//   than no page, because nobody would read it.
//
//   ONE TILE PER COLOUR. Forty doors in one colour is one tile.
//
//   A COLOUR WITH NO PICTURE IS STILL LISTED. It is exactly the one somebody
//   will be unsure about on the loading dock, and dropping it would leave the
//   page quietly incomplete with nothing to say so.
//
//   IT CANNOT COST THE SHEET. A bucket having a bad minute, a moved file, a
//   library that will not read: each costs a picture. None stops the workshop
//   getting its sheet.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import {
  buildReferenceEntries,
  matchColour,
  matchProfile,
  orderReference,
  referenceImageUrls,
  referenceRequestsFromItems,
} from "../lib/pcd-order-reference.js";
import { decodeImageBuffer, generateOrderCutListPdf, loadLogo, paginateReference } from "../lib/pcd-cabinet-pdf.js";

const ORDER = { id: "order-1", order_number: "PCD-O-2026-E7651A", customer_name: "Juliet Grist" };

function door(overrides = {}) {
  return {
    id: "item-1",
    order_id: "order-1",
    title: "Door",
    product_type: "Cabinet Door",
    material: "decorative board",
    thickness: "18mm",
    finish: "Woodmatt",
    colour: "Prime Oak Ravine",
    profile_type: "Soft",
    profile: "Mona Vale",
    edge_mould: "1mm Square",
    supplier_name: "Polytec",
    width_mm: 397,
    height_mm: 717,
    qty: 1,
    fulfilment_method: "in_house",
    ...overrides,
  };
}

const LIBRARIES = {
  colours: [
    { name: "Prime Oak Ravine", image_url: "https://example.test/ravine.png", material_type: "decorative board", finish_type: "Woodmatt", supplier_name: "Polytec" },
    { name: "Prime Oak Riven", image_url: "https://example.test/riven.png", material_type: "decorative board", finish_type: "Woodmatt", supplier_name: "Polytec" },
    { name: "Classic White", image_url: "https://example.test/white.png", material_type: "decorative board", finish_type: "Matt", supplier_name: "Polytec" },
  ],
  profiles: [
    { name: "Mona Vale", kind: "door", category: "Soft", image_url: "https://example.test/mona-vale.jpg", supplier_name: "Polytec" },
    { name: "Country Square", kind: "door", category: "Detailed", image_url: "https://example.test/cs-poly.jpg", supplier_name: "Polytec" },
    { name: "Country Square", kind: "door", category: "Classic", image_url: "https://example.test/cs-lam.jpg", supplier_name: "Laminex" },
    { name: "1mm Square", kind: "edge", category: "Decorative board", image_url: "https://example.test/square.png", supplier_name: "Polytec" },
  ],
};

// ── Only what this order uses, once each ────────────────────────────────────

test("forty doors in one colour is one tile", () => {
  const items = Array.from({ length: 40 }, (_, index) => door({ id: `d${index}`, width_mm: 300 + index }));
  const requests = referenceRequestsFromItems(items);
  assert.equal(requests.colours.length, 1);
  assert.equal(requests.doors.length, 1);
  assert.equal(requests.edges.length, 1);
});

test("two colours that differ only in finish are two tiles", () => {
  const requests = referenceRequestsFromItems([
    door({ id: "a", colour: "Classic White", finish: "Matt" }),
    door({ id: "b", colour: "Classic White", finish: "Woodmatt" }),
  ]);
  assert.equal(requests.colours.length, 2, "the finish is part of what a tile is");
});

test("a piece a variation removed is not on the reference page", () => {
  const requests = referenceRequestsFromItems([
    door({ id: "gone", colour: "Classic White", variation_status: "removed" }),
    door({ id: "live" }),
  ]);
  assert.deepEqual(requests.colours.map((colour) => colour.name), ["Prime Oak Ravine"]);
});

test("nothing to show means no page at all", () => {
  // Plain doors, no profile, no edge. An empty page of tiles would be one more
  // sheet to turn past.
  const requests = referenceRequestsFromItems([
    { id: "x", title: "Hardware", colour: "", profile: "", edge_mould: "" },
  ]);
  assert.deepEqual(requests, { colours: [], doors: [], edges: [] });
  assert.deepEqual(buildReferenceEntries(requests, LIBRARIES), []);
});

// ── Finding the picture ─────────────────────────────────────────────────────

test("a colour is matched on material, finish and name before it is matched on less", () => {
  const index = {
    byFull: new Map([["decorative board|woodmatt|prime oak ravine", { name: "exact" }]]),
    byMaterial: new Map([["decorative board|prime oak ravine", { name: "material" }]]),
    byName: new Map([["prime oak ravine", { name: "name only" }]]),
  };
  assert.equal(matchColour({ name: "Prime Oak Ravine", material: "decorative board", finish: "Woodmatt" }, index).name, "exact");
  assert.equal(matchColour({ name: "Prime Oak Ravine", material: "decorative board", finish: "" }, index).name, "material");
  assert.equal(matchColour({ name: "Prime Oak Ravine", material: "", finish: "" }, index).name, "name only");
  assert.equal(matchColour({ name: "Something else" }, index), null);
});

test("the supplier separates two profiles that share a name", () => {
  // "Country Square" exists in BOTH ranges. That is the whole reason the
  // profile library records a supplier.
  const sections = buildReferenceEntries(
    referenceRequestsFromItems([door({ profile: "Country Square", supplier_name: "Laminex" })]),
    LIBRARIES
  );
  const doorSection = sections.find((section) => section.key === "doors");
  assert.equal(doorSection.entries[0].imageUrl, "https://example.test/cs-lam.jpg");
});

test("a profile with no supplier recorded still finds a picture", () => {
  const index = {
    bySupplier: new Map(),
    byName: new Map([["mona vale", { image_url: "x", supplier_name: "Polytec" }]]),
  };
  assert.ok(matchProfile({ name: "Mona Vale", supplier: "" }, index));
});

// ── A colour with no picture is still listed ────────────────────────────────

test("a colour the library has never heard of is still on the page, and admits it", () => {
  const sections = buildReferenceEntries(
    referenceRequestsFromItems([door({ colour: "Something Discontinued" })]),
    LIBRARIES
  );
  const colours = sections.find((section) => section.key === "colours");
  assert.equal(colours.entries.length, 1, "it is listed");
  assert.equal(colours.entries[0].name, "Something Discontinued");
  assert.equal(colours.entries[0].imageUrl, "", "with no picture to show");
  // And it is not asked for, so nothing goes looking for a file that is not there.
  assert.ok(!referenceImageUrls(sections).includes(""));
});

test("each picture is asked for once, however many entries want it", () => {
  const sections = orderReference(
    [door({ id: "a" }), door({ id: "b", product_type: "Panel", profile: "", edge_mould: "" })],
    LIBRARIES
  );
  const urls = referenceImageUrls(sections);
  assert.equal(new Set(urls).size, urls.length, "no duplicates");
});

// ── Laying it out ───────────────────────────────────────────────────────────

test("a section heading is never stranded at the foot of a page", () => {
  const many = (count, prefix) =>
    Array.from({ length: count }, (_, index) => ({ key: `${prefix}${index}`, name: `${prefix} ${index}`, details: [], imageUrl: "" }));

  const pages = paginateReference([
    { key: "colours", title: "Board colours", note: "", entries: many(30, "c") },
    { key: "doors", title: "Door and drawer profiles", note: "", entries: many(3, "d") },
  ]);

  assert.ok(pages.length > 1, "thirty three tiles do not fit on one landscape page");
  for (const page of pages) {
    for (const block of page) {
      assert.ok(block.entries.length > 0, "a heading always brings tiles with it");
    }
  }
  // Every tile is drawn exactly once across the pages.
  const drawn = pages.flatMap((page) => page.flatMap((block) => block.entries.map((entry) => entry.key)));
  assert.equal(drawn.length, 33);
  assert.equal(new Set(drawn).size, 33, "nothing drawn twice, nothing dropped");
});

// ── The real document ───────────────────────────────────────────────────────

/** A tiny valid PNG, so the page can be generated with a real picture in it. */
function tinyPng(size = 4) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "ascii");
    const crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([Buffer.from(type, "ascii"), body])) {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([head, body, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.concat(
    Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 4, 0x80)]))
  );
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("the reference page lands in the document, one page before the notes", async () => {
  const { decodeImageBuffer } = await import("../lib/pcd-cabinet-pdf.js");
  const image = decodeImageBuffer(tinyPng(), "Ref0", "image/png");
  assert.ok(image, "the test's own PNG decodes, or this proves nothing");

  const items = [door()];
  const sections = orderReference(items, LIBRARIES);

  const without = generateOrderCutListPdf({ order: ORDER, items });
  const with_ = generateOrderCutListPdf({
    order: ORDER,
    items,
    reference: { sections, images: { [sections[0].entries[0].key]: image } },
  });

  const pageCount = (pdf) => (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) || []).length;
  const expected = paginateReference(sections).length;
  assert.ok(expected >= 1, "a door with a colour, a profile and an edge fills at least one page");
  assert.equal(pageCount(with_), pageCount(without) + expected, "every reference page reached the document");

  const text = with_.toString("latin1");
  assert.match(text, /Colour and profile reference/, "the page is headed");
  assert.match(text, /Reference only/, "and says it is not an instruction to cut");
  assert.ok(with_.subarray(0, 5).toString() === "%PDF-", "still a PDF");

  // BEFORE the notes page, not after it. The reference is something you turn to
  // the back to look up; the notes page is the last thing on the sheet.
  assert.ok(
    text.indexOf("Colour and profile reference") < text.lastIndexOf("(Notes)"),
    "the reference comes before the notes page"
  );

  // Every section made it, so an order's edge profiles are not quietly dropped
  // for being last.
  for (const section of sections) {
    assert.ok(text.includes(section.title), `${section.title} is on the sheet`);
  }
});

test("no reference means the sheet is exactly what it was", () => {
  const items = [door()];
  const before = generateOrderCutListPdf({ order: ORDER, items });
  const after = generateOrderCutListPdf({ order: ORDER, items, reference: { sections: [], images: {} } });
  assert.equal(after.length, before.length, "an empty reference adds nothing at all");
});

test("a picture that will not decode costs that tile and nothing else", async () => {
  const { decodeImageBuffer } = await import("../lib/pcd-cabinet-pdf.js");
  assert.equal(decodeImageBuffer(Buffer.from("not an image at all"), "Ref0", "image/png"), null);
  assert.equal(decodeImageBuffer(Buffer.alloc(0), "Ref0", "image/png"), null);
  assert.equal(decodeImageBuffer(null, "Ref0"), null);

  // And the page still generates with the picture simply missing.
  const items = [door()];
  const sections = orderReference(items, LIBRARIES);
  const pdf = generateOrderCutListPdf({ order: ORDER, items, reference: { sections, images: {} } });
  assert.match(pdf.toString("latin1"), /No picture on file/);
});

test("the route builds the reference softly, so a bad library cannot stop a print", () => {
  const route = readFileSync(
    new URL("../app/api/admin/orders/[id]/cut-list-pdf/route.js", import.meta.url),
    "utf8"
  );
  const build = route.slice(route.indexOf("let reference = null"), route.indexOf("const pdfBuffer"));
  assert.match(build, /try \{/, "wrapped");
  assert.match(build, /catch/, "and the failure is caught");
  assert.match(build, /console\.error/, "and said out loud rather than swallowed");
});

// ── The two things that made the first version of this page useless ─────────

test("a profile is found however the line happens to spell it", () => {
  // The library calls it "Brussels". A line can carry "Minimal - Brussels",
  // because that is how frontProfileDisplay writes it out and how it comes back
  // from an import. Matching the exact string printed the worst possible
  // answer: "No picture on file" against a profile whose photo is on every
  // other screen in the admin.
  const libraries = {
    colours: [],
    profiles: [{ name: "Brussels", kind: "door", category: "Minimal", image_url: "https://x/brussels.jpg", supplier_name: "Polytec" }],
  };
  for (const spelling of ["Brussels", "Minimal - Brussels", "brussels", "Minimal Brussels", " Brussels "]) {
    const sections = orderReference([{ id: "i", profile_type: "Minimal", profile: spelling }], libraries);
    const entry = sections.find((section) => section.key === "doors").entries[0];
    assert.equal(entry.imageUrl, "https://x/brussels.jpg", `"${spelling}" found no picture`);
  }
});

test("a library row with no url still finds the file every other screen uses", () => {
  const libraries = {
    colours: [],
    profiles: [
      { name: "Brussels", kind: "door", category: "Minimal", image_url: "", supplier_name: "Polytec" },
      { name: "EM1 6mm Pencil Round", kind: "edge", category: "Thermolaminate", image_url: "", supplier_name: "Polytec" },
    ],
  };
  const sections = orderReference(
    [{ id: "i", profile_type: "Minimal", profile: "Brussels", edge_mould: "EM1 6mm Pencil Round" }],
    libraries
  );
  assert.match(sections.find((s) => s.key === "doors").entries[0].imageUrl, /profiles\/polytec\/minimal\/brussels\.jpg$/);
  assert.match(sections.find((s) => s.key === "edges").entries[0].imageUrl, /edges\/em1-6mm-pencil-round\.png$/);
});

test("those fallback files are actually on disk, so the page is not promising pictures that do not exist", () => {
  for (const relative of ["images/profiles/polytec/minimal/brussels.jpg", "images/edges/em1-6mm-pencil-round.png"]) {
    const full = new URL(`../public/${relative}`, import.meta.url);
    assert.doesNotThrow(() => readFileSync(full), `${relative} is missing from public/`);
  }
});

test("a site relative picture is read from disk, because fetch cannot resolve one", () => {
  // The profile photos are served from /public. Handing "/images/..." to fetch
  // on a server that does not know its own address is exactly how every one of
  // those tiles came out saying "No picture on file".
  const loader = readFileSync(new URL("../lib/pcd-order-reference-images.js", import.meta.url), "utf8");
  assert.match(loader, /url\.startsWith\("\/"\)/, "a relative path takes the disk path");
  assert.match(loader, /full\.startsWith\(root\)/, "and cannot climb out of public/");
});

// ── The pictures the app already ships ──────────────────────────────────────

test("every profile and edge picture in the app decodes for print", () => {
  // The edge sections in /public are 4 BIT PALETTE PNGs. The decoder was
  // written for the logo, which is 8 bit RGBA, and refused everything else
  // outright, so every edge printed "No picture on file" with the file sitting
  // right there on disk. This walks the real folders, so a new asset saved in a
  // format we cannot read fails here rather than on a workshop's sheet.
  const walk = (dir) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
    );
  };

  const root = fileURLToPath(new URL("../public/images", import.meta.url));
  for (const folder of ["edges", "profiles"]) {
    const files = walk(join(root, folder)).filter((file) => /\.(png|jpe?g)$/i.test(file));
    assert.ok(files.length > 0, `${folder} has no pictures at all, so this test proves nothing`);
    const undecodable = files.filter((file) => !decodeImageBuffer(readFileSync(file), "X", ""));
    assert.deepEqual(undecodable.map((file) => file.replace(root, "")), [], `${folder} has pictures that will not print`);
  }
});

test("the logo, which is what the decoder was written for, still decodes", () => {
  assert.ok(loadLogo(), "widening the decoder must not break the one format it always read");
});

test("a picture falls back to the next source when the first fails", () => {
  // The library row can hold a bucket URL that 404s while the same picture sits
  // in /public. Every screen in the admin already falls back; this page tried
  // one source and gave up.
  const libraries = {
    colours: [],
    profiles: [{ name: "EM0 Square", kind: "edge", category: "Thermolaminate", image_url: "https://x/gone.png", supplier_name: "Polytec" }],
  };
  const entry = orderReference([{ id: "i", edge_mould: "EM0 Square" }], libraries)[0].entries[0];
  assert.ok(entry.imageSources.length > 1, "there is somewhere to fall back to");
  assert.equal(entry.imageSources[0], "https://x/gone.png", "the library's own URL is tried first");
  assert.ok(
    entry.imageSources.some((source) => source.startsWith("/images/edges/")),
    "and the copy shipped with the app is tried after it"
  );
});

test("a fitted picture is not drawn hard against the tile border", () => {
  // A door photo drawn to the edge looked like it had been trimmed by the rule.
  // A colour still fills its well: a board sample with a white border around it
  // reads as a smaller board rather than as a sample.
  const pdf = readFileSync(new URL("../lib/pcd-cabinet-pdf.js", import.meta.url), "utf8");
  assert.match(pdf, /const pad = crop \? 0 : \d+/, "cropped fills, fitted is inset");
});
