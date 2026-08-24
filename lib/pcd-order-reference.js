// The colours and profiles used on one order, ready to be shown as pictures.
//
// WHY THIS EXISTS. Checking a delivery off means reading a row on the
// production sheet and then looking at the thing in your hands. "Prime Oak
// Ravine" and "Prime Oak Riven" are two lines of text a foot apart on a page
// and two boards that look nothing alike. A person holding the board can tell
// them apart instantly and cannot always tell from the name.
//
// So the sheet gets a page of the actual tiles and the actual routed profiles
// used on THIS order, and nothing else. A catalogue of everything Polytec makes
// would be worse than no page at all.
//
// Pure and framework free: what the order uses is worked out here and tested
// here, and the fetching of pictures happens in the route where the network is.

import { normaliseSupplierName } from "./pcd-colour-library";
import {
  edgeImageFallbackSrc,
  edgeImageSrc,
  profileImageFallbackSrc,
  profileImageSrc,
  PROFILE_IMAGE_FAMILIES,
} from "./pcd-profile-images";

const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value).toLowerCase();

// A piece with no face has no profile, and a carcass side is not a colour
// somebody checks off a delivery. Only what arrives as a visible thing.
function itemsWorthShowing(items = []) {
  return (items || []).filter((item) => item && item.variation_status !== "removed");
}

/**
 * Every distinct colour, door profile and edge profile this order uses.
 *
 * DISTINCT IS THE POINT. An order with forty doors in one colour needs one
 * tile, not forty. Keyed on what actually identifies the thing, so two lines
 * that differ only in width collapse to one entry and two that differ in finish
 * do not.
 */
export function referenceRequestsFromItems(items = []) {
  const colours = new Map();
  const doors = new Map();
  const edges = new Map();

  for (const item of itemsWorthShowing(items)) {
    const colour = clean(item.colour);
    if (colour) {
      const key = [norm(item.material), norm(item.finish), norm(colour)].join("|");
      if (!colours.has(key)) {
        colours.set(key, {
          key,
          kind: "colour",
          name: colour,
          material: clean(item.material),
          finish: clean(item.finish),
          thickness: clean(item.thickness),
          supplier: normaliseSupplierName(item.supplier_name),
        });
      }
    }

    const door = clean(item.profile);
    if (door) {
      const key = [norm(item.profile_type), norm(door)].join("|");
      if (!doors.has(key)) {
        doors.set(key, {
          key,
          kind: "door",
          name: door,
          category: clean(item.profile_type),
          supplier: normaliseSupplierName(item.supplier_name),
        });
      }
    }

    const edge = clean(item.edge_mould);
    if (edge) {
      const key = norm(edge);
      if (!edges.has(key)) {
        edges.set(key, { key, kind: "edge", name: edge, supplier: normaliseSupplierName(item.supplier_name) });
      }
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  return {
    colours: [...colours.values()].sort(byName),
    doors: [...doors.values()].sort(byName),
    edges: [...edges.values()].sort(byName),
  };
}

// ── Matching a request to the library row that has the picture ──────────────
//
// Tightest first, loosening one field at a time. A colour NAME is very nearly
// unique on its own, so falling all the way back to it finds the tile far more
// often than it finds the wrong one, and the entry carries the details it
// matched on so a person can see for themselves.

function colourIndex(rows = []) {
  const byFull = new Map();
  const byMaterial = new Map();
  const byName = new Map();
  for (const row of rows) {
    if (!row?.name) continue;
    const full = [norm(row.material_type), norm(row.finish_type), norm(row.name)].join("|");
    const material = [norm(row.material_type), norm(row.name)].join("|");
    if (!byFull.has(full)) byFull.set(full, row);
    if (!byMaterial.has(material)) byMaterial.set(material, row);
    if (!byName.has(norm(row.name))) byName.set(norm(row.name), row);
  }
  return { byFull, byMaterial, byName };
}

export function matchColour(request, index) {
  if (!request?.name || !index) return null;
  return (
    index.byFull.get([norm(request.material), norm(request.finish), norm(request.name)].join("|")) ||
    index.byMaterial.get([norm(request.material), norm(request.name)].join("|")) ||
    index.byName.get(norm(request.name)) ||
    null
  );
}

// A profile name written down is not always the profile's name.
//
// The library calls it "Brussels". A line can carry "Minimal - Brussels",
// because that is how frontProfileDisplay writes it out and how it comes back
// from an import, and it can carry "Brussels " or "brussels". Matching on the
// exact string printed the page's worst possible answer: "No picture on file"
// against a profile whose photo is on every other screen in the admin.
function profileAliases(name, category = "") {
  const raw = clean(name);
  if (!raw) return [];

  const aliases = new Set([raw]);

  // "Minimal - Brussels" and "Minimal Brussels" both mean Brussels.
  const withoutCategory = clean(category)
    ? raw.replace(new RegExp(`^${clean(category).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-|]?\\s*`, "i"), "")
    : "";
  if (withoutCategory) aliases.add(withoutCategory);

  // Anything after the last separator, which covers a prefix we do not know.
  const tail = raw.split(/\s+[-|]\s+/).pop();
  if (tail) aliases.add(tail);

  return [...aliases].map(clean).filter(Boolean);
}

// Punctuation and spacing removed, so "EM1 6mm Pencil Round" still finds
// "EM1-6mm Pencil Round". The last resort, and still far more likely to be
// right than to be wrong: these are short names from a fixed catalogue.
const squash = (value) => norm(value).replace(/[^a-z0-9]/g, "");

function profileIndex(rows = [], kind) {
  const bySupplier = new Map();
  const byName = new Map();
  const bySquashed = new Map();
  for (const row of rows) {
    if (!row?.name || (kind && row.kind !== kind)) continue;
    const supplier = [norm(normaliseSupplierName(row.supplier_name)), norm(row.name)].join("|");
    if (!bySupplier.has(supplier)) bySupplier.set(supplier, row);
    // "Country Square" exists in BOTH the Polytec and the Laminex ranges, so
    // the first one wins only when the supplier is not known. The entry says
    // which supplier's picture it ended up showing.
    if (!byName.has(norm(row.name))) byName.set(norm(row.name), row);
    if (!bySquashed.has(squash(row.name))) bySquashed.set(squash(row.name), row);
  }
  return { bySupplier, byName, bySquashed };
}

export function matchProfile(request, index) {
  if (!request?.name || !index) return null;
  for (const alias of profileAliases(request.name, request.category)) {
    const found =
      index.bySupplier.get([norm(request.supplier), norm(alias)].join("|")) ||
      index.byName.get(norm(alias)) ||
      index.bySquashed.get(squash(alias));
    if (found) return found;
  }
  return null;
}

// ── Turning matches into what the page draws ────────────────────────────────

/** The lines of small print under a tile. Only what helps tell two apart. */
function colourDetails(request, row) {
  return [
    [row?.material_type || request.material, row?.finish_type || request.finish].filter(Boolean).join(", "),
    [request.thickness, normaliseSupplierName(row?.supplier_name) || request.supplier].filter(Boolean).join("  |  "),
  ].filter(Boolean);
}

function profileDetails(request, row) {
  return [
    [row?.category || request.category, normaliseSupplierName(row?.supplier_name) || request.supplier]
      .filter(Boolean)
      .join("  |  "),
  ].filter(Boolean);
}

/**
 * What the reference page shows, in the order it shows it.
 *
 * An entry with no picture is STILL AN ENTRY. A colour the library has never
 * heard of is exactly the one somebody will be unsure about on the loading
 * dock, and dropping it would leave the page quietly incomplete with nothing
 * to say so. It prints as a named box that admits it has no tile.
 */
export function buildReferenceEntries(requests, libraries = {}) {
  const colours = colourIndex(libraries.colours);
  const doors = profileIndex(libraries.profiles, "door");
  const edges = profileIndex(libraries.profiles, "edge");

  // WHERE A PICTURE COMES FROM, in the order the rest of the admin looks, and
  // ALL of them rather than only the first.
  //
  // Every screen that shows a profile already falls back: the bucket copy, then
  // the copy in /public, because a bucket URL that 404s is a thing that happens
  // and the file is sitting right there. This page tried exactly one source and
  // gave up, which is how "EM0 Square" printed "No picture on file" with
  // /images/edges/em0-square.png on disk the whole time.
  //
  // Tried in order until one decodes: the library row's own URL, then the
  // bucket, then the copy shipped with the app.
  const picturesFor = (request, row) => {
    const name = row?.name || request.name;
    const sources = [clean(row?.image_url)];

    if (request.kind === "door") {
      const family = PROFILE_IMAGE_FAMILIES.find(
        (candidate) => norm(candidate) === norm(row?.category || request.category)
      );
      if (family) {
        sources.push(profileImageSrc(family, name), profileImageFallbackSrc(family, name));
      }
    }
    if (request.kind === "edge") {
      sources.push(edgeImageSrc(name), edgeImageFallbackSrc(name));
    }

    return [...new Set(sources.map(clean).filter(Boolean))];
  };

  const entry = (request, row, details) => {
    const sources = picturesFor(request, row);
    return {
      key: `${request.kind}:${request.key}`,
      kind: request.kind,
      name: request.name,
      details,
      imageSources: sources,
      // The first choice, kept so anything reading one URL still reads the one
      // that would be tried first.
      imageUrl: sources[0] || "",
    };
  };

  return [
    {
      key: "colours",
      title: "Board colours",
      note: "The tile as it is in the colour library. Check the board against the tile, not the name.",
      entries: (requests?.colours || []).map((request) => {
        const row = matchColour(request, colours);
        return entry(request, row, colourDetails(request, row));
      }),
    },
    {
      key: "doors",
      title: "Door and drawer profiles",
      note: "The routed profile as it is on a real door.",
      entries: (requests?.doors || []).map((request) => {
        const row = matchProfile(request, doors);
        return entry(request, row, profileDetails(request, row));
      }),
    },
    {
      key: "edges",
      title: "Edge profiles",
      note: "The edge as it is finished.",
      entries: (requests?.edges || []).map((request) => {
        const row = matchProfile(request, edges);
        return entry(request, row, profileDetails(request, row));
      }),
    },
  ].filter((section) => section.entries.length > 0);
}

/** Everything the page needs, from the order's items and the two libraries. */
export function orderReference(items, libraries) {
  return buildReferenceEntries(referenceRequestsFromItems(items), libraries);
}

/**
 * Every picture the page might want, so the caller knows what to go and fetch.
 *
 * Every candidate, not only the first choice. The caller tries them in order
 * per entry and stops at the first that decodes, so a fallback is only ever
 * fetched when the one before it failed.
 */
export function referenceImageUrls(sections = []) {
  const urls = new Set();
  for (const section of sections) {
    for (const item of section.entries || []) {
      for (const source of item.imageSources || []) urls.add(source);
    }
  }
  return [...urls];
}
