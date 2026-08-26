// Fetching the pictures for the production sheet's reference page.
//
// Kept apart from pcd-order-reference.js, which is pure and works out WHAT the
// order uses, and from pcd-cabinet-pdf.js, which is synchronous and draws it.
// This is the only part that touches the network.
//
// NOTHING HERE MAY FAIL THE SHEET. The production sheet is what the workshop
// needs today. A colour library row pointing at a file somebody moved, a
// storage bucket having a bad minute, a tile saved as a format we cannot read:
// each of those costs one picture, and the tile prints as a named box that says
// it has no picture. None of them stops the sheet printing.

import fs from "node:fs";
import path from "node:path";

import { decodeImageBuffer } from "./pcd-cabinet-pdf";
import { buildColourSupplierMap } from "./pcd-line-supplier";
import { orderReference, referenceImageUrls } from "./pcd-order-reference";

// A tile is a few tens of kilobytes. This is a guard against a library row
// pointing at something that is not a tile at all, like a full resolution photo
// or, worse, a file that is not an image.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Long enough for storage on a slow morning, short enough that a bucket that is
// down does not hold a printing workshop up.
const FETCH_TIMEOUT_MS = 6000;

// Fetched at once. The tiles come from one bucket and there are rarely more
// than a dozen; this stops an order with forty distinct colours opening forty
// connections.
const CONCURRENCY = 6;

/**
 * A picture that lives in this app rather than in storage.
 *
 * The profile photos and the edge sections are served from /public, so the
 * library falls back to paths like "/images/profiles/polytec/soft/mona-vale.jpg".
 * fetch() cannot resolve a site relative path on a server that does not know its
 * own address, and passing one to it is how every one of those tiles came out
 * saying "No picture on file" while the same photo showed on every screen.
 */
// THE PICTURE FOLDERS THIS FUNCTION CARRIES WITH IT.
//
// A serverless function ships a copy of every file it might open. Reading with
// a path built at runtime tells the build nothing about WHICH file, so it takes
// the safe option and packs the whole folder the path starts from. That folder
// used to be public/, which is 442MB of website photography, and the cut list
// came out at 444MB against a 250MB ceiling: the deploy was refused after a
// build that had otherwise passed.
//
// Naming the picture folders outright instead of their parent packs 44MB rather
// than 442MB. public/images/laminex and public/images/website are the bulk of
// what is left behind, and no server code has ever opened either: the browser
// loads them over http, and static files are served separately from functions.
//
// EACH ENTRY MUST STAY A WRITTEN OUT PATH. Building one of these out of a
// variable puts us straight back to packing the parent folder.
const DISK_IMAGE_ROOTS = new Map([
  ["images/colours", path.join(process.cwd(), "public", "images", "colours")],
  ["images/profiles", path.join(process.cwd(), "public", "images", "profiles")],
  ["images/edges", path.join(process.cwd(), "public", "images", "edges")],
  ["images/products", path.join(process.cwd(), "public", "images", "products")],
  ["images/ikea", path.join(process.cwd(), "public", "images", "ikea")],
  ["images/icons", path.join(process.cwd(), "public", "images", "icons")],
]);

/** The site's own address, for a picture that did not ship inside the function. */
function siteOrigin() {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = String(process.env.VERCEL_URL || "").trim();
  return vercel ? `https://${vercel}` : "";
}

function readFromPublic(url) {
  try {
    const relative = path
      .normalize(decodeURIComponent(url.split("?")[0]))
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    const folder = [...DISK_IMAGE_ROOTS.keys()].find((name) =>
      relative.toLowerCase().startsWith(`${name}/`)
    );
    if (!folder) return null;

    // Only ever inside that folder. A library row is data, and a path that
    // climbs out of it must not be able to read the rest of the disk.
    const root = DISK_IMAGE_ROOTS.get(folder);
    const full = path.join(root, relative.slice(folder.length + 1));
    if (!full.startsWith(root)) return null;

    return { buffer: fs.readFileSync(full), contentType: "" };
  } catch {
    return null;
  }
}

async function fetchOne(url) {
  if (url.startsWith("/")) {
    const onDisk = readFromPublic(url);
    if (onDisk) return onDisk;

    // Not in a folder the function carries, or simply not there. Every one of
    // these is a public file the site itself serves, so ask for it over http
    // the way a browser would rather than lose the tile. A picture somewhere
    // unexpected keeps working; it just costs a request instead of a read.
    const origin = siteOrigin();
    if (!origin) return null;
    url = `${origin}${url}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return null;

    return { buffer, contentType: response.headers.get("content-type") || "" };
  } catch {
    // A timeout, a DNS failure, a bucket that has moved. One tile, not the sheet.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function inBatches(values, worker, size = CONCURRENCY) {
  const results = [];
  for (let start = 0; start < values.length; start += size) {
    const batch = values.slice(start, start + size);
    results.push(...(await Promise.all(batch.map(worker))));
  }
  return results;
}

/**
 * The reference page's sections, and the decoded picture for each entry.
 *
 * The returned `images` is keyed by entry key and shaped the way PdfDocument
 * wants an image. An entry with no picture simply has no key, which is what
 * makes the tile print as a named box.
 */
export async function loadOrderReference(items, libraries) {
  // The brand behind each board, so the sheet's supplier column answers the
  // same way the order screen does. Built here because the colour library is
  // already loaded for the reference page and reading it twice would be waste.
  const colourSuppliers = buildColourSupplierMap(libraries?.colours);

  const sections = orderReference(items, libraries);
  if (!sections.length) return { sections: [], images: {}, colourSuppliers };

  // Each URL at most once, however many entries and fallback chains name it.
  // The same oak used by a door and a panel is one fetch and one copy in the
  // file, and a fallback shared by two profiles is not fetched twice.
  const cache = new Map();
  let nextName = 0;
  const resolve = async (url) => {
    if (cache.has(url)) return cache.get(url);
    const pending = (async () => {
      const result = await fetchOne(url);
      if (!result) return null;
      // The name is what the page's content stream refers to, so it has to be a
      // plain PDF name: a counter, not the colour, which can contain anything.
      return decodeImageBuffer(result.buffer, `Ref${nextName++}`, result.contentType);
    })();
    cache.set(url, pending);
    return pending;
  };

  const entries = sections.flatMap((section) => section.entries);
  const resolved = await inBatches(entries, async (entry) => {
    // In order, stopping at the first that decodes. A bucket URL that 404s
    // falls through to the copy in /public rather than ending as a box saying
    // there is no picture.
    for (const source of entry.imageSources || []) {
      const image = await resolve(source);
      if (image) return { key: entry.key, image };
    }
    return { key: entry.key, image: null };
  });

  const images = {};
  for (const { key, image } of resolved) {
    if (image) images[key] = image;
  }

  return { sections, images, colourSuppliers };
}

/**
 * The two libraries the reference page matches against.
 *
 * Read soft, exactly as the issues table is on this same sheet: a database
 * without the profile library, or a permission that has not been granted yet,
 * costs the reference page and not the production sheet.
 */
export async function loadReferenceLibraries(supabase) {
  const [colours, profiles] = await Promise.all([
    supabase
      .from("pcd_colour_library")
      .select("name, image_url, material_type, finish_type, thickness, supplier_name")
      .then((response) => response.data || [])
      .catch(() => []),
    supabase
      .from("pcd_profile_library")
      .select("name, kind, category, image_url, supplier_name")
      .then((response) => response.data || [])
      .catch(() => []),
  ]);
  return { colours, profiles };
}
