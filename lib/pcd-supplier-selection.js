// PICK THE SUPPLIER FIRST. EVERYTHING ELSE FOLLOWS FROM IT.
//
// ── THE PROBLEM ──────────────────────────────────────────────────────────────
//
// A door is one brand's colour pressed onto that brand's profile. The two ranges
// cannot be mixed: a Laminex colour cannot go on a Polytec profile, and Laminex
// makes no edge profiles at all.
//
// Until now every screen offered every colour and every profile in one list and
// trusted whoever was filling it in to know which went together. The first
// anybody finds out is when the door arrives.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Supplier is chosen BEFORE colour, profile or edge, and it narrows all three.
// A field the chosen supplier does not offer is not shown empty, it is not shown
// at all: an empty Edge dropdown reads as "we forgot to load it", where no edge
// field at all reads as "this brand does not do edges", which is the truth.
//
// ── WHY NOTHING HERE IS HARDCODED ────────────────────────────────────────────
//
// Every list is derived from the rows passed in: colour rows from the colour
// library, profile rows from the profile library. Adding Formica is adding rows
// with supplier_name = 'Formica' and nothing in this file changes.
//
// The one thing that is NOT derived is the pairing rule itself, because it is
// not data: two different brands never go together, whichever brands they are.

const text = (value) => String(value ?? "").trim();
const same = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

/**
 * Every supplier that offers this material, from the colour rows themselves.
 *
 * Derived rather than listed, so a brand appears the moment its first colour is
 * added and disappears when its last is retired. A supplier with colours but no
 * profiles is still a supplier: plenty of board is sold without a routed front.
 */
export function suppliersForMaterial(colourRows = [], material = "") {
  const found = [];
  (colourRows || []).forEach((row) => {
    if (material && !same(row.material_type || row.material, material)) return;
    const supplier = text(row.supplier_name || row.supplier);
    if (supplier && !found.some((name) => same(name, supplier))) found.push(supplier);
  });
  return found.sort((a, b) => a.localeCompare(b));
}

/** The colours one supplier offers, in the shape the pickers already expect. */
export function coloursForSupplier(colourRows = [], supplier = "") {
  if (!text(supplier)) return [];
  return (colourRows || []).filter((row) => same(row.supplier_name || row.supplier, supplier));
}

/**
 * Door profile rows for one supplier, narrowed to what the board can take.
 *
 * The thickness rules run in OPPOSITE directions between the two ranges, which
 * is why they are read off each row rather than inferred: thirteen Polytec
 * profiles are 21mm only, and every Laminex profile is 18mm only.
 */
export function profilesForSupplier(profileRows = [], { supplier = "", thickness = "" } = {}) {
  if (!text(supplier)) return [];
  const wanted = text(thickness).toLowerCase();
  return (profileRows || [])
    .filter((row) => (row.kind || "door") === "door")
    .filter((row) => row.is_active !== false)
    .filter((row) => same(row.supplier_name || row.supplier, supplier))
    .filter((row) => {
      if (!wanted) return true;
      if (wanted.startsWith("18")) return row.available_18mm !== false;
      if (wanted.startsWith("21")) return row.available_21mm !== false;
      return true;
    });
}

/** The categories those profiles fall into, in the order the rows arrive. */
export function profileCategoriesForSupplier(profileRows = [], options = {}) {
  const found = [];
  profilesForSupplier(profileRows, options).forEach((row) => {
    const category = text(row.category);
    if (category && !found.includes(category)) found.push(category);
  });
  return found;
}

/** Edge profile rows for one supplier. Empty is a real answer, not a failure. */
export function edgesForSupplier(profileRows = [], { supplier = "", material = "" } = {}) {
  if (!text(supplier)) return [];
  const wantedMaterial = text(material);
  return (profileRows || [])
    .filter((row) => row.kind === "edge")
    .filter((row) => row.is_active !== false)
    .filter((row) => same(row.supplier_name || row.supplier, supplier))
    .filter((row) => !wantedMaterial || same(row.category, wantedMaterial));
}

/**
 * Does this supplier offer edge profiles at all?
 *
 * The question the FORM asks, because the answer decides whether the field is
 * rendered. Laminex makes none, so showing an empty Edge dropdown would read as
 * "we could not load the options" rather than "this brand does not do edges".
 */
export function supplierOffersEdges(profileRows = [], supplier = "") {
  if (!text(supplier)) return false;
  return (profileRows || []).some(
    (row) => row.kind === "edge" && row.is_active !== false && same(row.supplier_name || row.supplier, supplier)
  );
}

/**
 * Does this supplier offer door profiles at all?
 *
 * Same reasoning. A brand we sell board for but do not press doors from should
 * not show a profile field.
 */
export function supplierOffersProfiles(profileRows = [], supplier = "") {
  if (!text(supplier)) return false;
  return (profileRows || []).some(
    (row) => (row.kind || "door") === "door" && row.is_active !== false && same(row.supplier_name || row.supplier, supplier)
  );
}

/**
 * WHAT IS WRONG WITH THIS LINE, as sentences somebody can act on.
 *
 * The one check all three tools share, so the public form, the quote editor and
 * the variation editor cannot each decide differently what counts as a valid
 * line. That divergence is what this whole mechanism exists to prevent.
 *
 * Silent about anything not yet filled in. A half-finished line is somebody
 * mid-thought, not a mistake, and refusing it would stop them getting to the end.
 */
export function supplierConflicts(line = {}, { colourRows = [], profileRows = [] } = {}) {
  const supplier = text(line.supplier_name || line.supplierName || line.supplier);
  if (!supplier) return [];

  const problems = [];
  const colour = text(line.colour);
  const profile = text(line.profile);
  const edge = text(line.edge_mould || line.edgeMould);

  if (colour) {
    const brands = (colourRows || [])
      .filter((row) => same(row.name, colour))
      .map((row) => text(row.supplier_name || row.supplier))
      .filter(Boolean);
    // Only a conflict when we KNOW the colour and know it is another brand's.
    // A colour we have never heard of is somebody typing something we do not
    // stock yet, which is a different conversation.
    if (brands.length && !brands.some((brand) => same(brand, supplier))) {
      problems.push(`${colour} is a ${brands[0]} colour, not ${supplier}.`);
    }
  }

  if (profile) {
    const brands = (profileRows || [])
      .filter((row) => (row.kind || "door") === "door" && same(row.name, profile))
      .map((row) => text(row.supplier_name || row.supplier))
      .filter(Boolean);
    if (brands.length && !brands.some((brand) => same(brand, supplier))) {
      problems.push(`${profile} is a ${brands[0]} profile, not ${supplier}.`);
    }
  }

  if (edge) {
    if (!supplierOffersEdges(profileRows, supplier)) {
      problems.push(`${supplier} does not make edge profiles, so ${edge} cannot be used here.`);
    } else {
      const brands = (profileRows || [])
        .filter((row) => row.kind === "edge" && same(row.name, edge))
        .map((row) => text(row.supplier_name || row.supplier))
        .filter(Boolean);
      if (brands.length && !brands.some((brand) => same(brand, supplier))) {
        problems.push(`${edge} is a ${brands[0]} edge, not ${supplier}.`);
      }
    }
  }

  return problems;
}

/**
 * What a line should keep when its supplier changes.
 *
 * Anything the new supplier cannot make is cleared, because leaving it would put
 * a Polytec profile on a Laminex line and the conflict check would then refuse a
 * line the person did not knowingly break.
 *
 * Returns the fields to clear, so a caller can say what it is about to lose
 * before it happens rather than silently emptying three boxes.
 */
export function fieldsClearedBySupplierChange(line = {}, nextSupplier, { colourRows = [], profileRows = [] } = {}) {
  const colour = text(line.colour);
  const profile = text(line.profile);
  const edge = text(line.edge_mould || line.edgeMould);
  const previous = text(line.supplier_name || line.supplierName || line.supplier);

  // ── THE COLOUR ALWAYS GOES ──────────────────────────────────────────────
  //
  // A colour is one brand's board. Two brands may both sell something called
  // Snow, but they are different boards at different prices, so a colour
  // chosen under the old brand cannot be carried to the new one whatever it
  // is called.
  //
  // It has to be unconditional rather than looked up, because not every
  // caller CAN look it up. The public quote form is handed only the
  // brand-and-material pairs, which carry no colour names, so nothing ever
  // matched and nothing was ever cleared: somebody could pick a Polytec
  // colour, switch to Laminex, keep both, and only be refused at the very end.
  //
  // Only when the line already HAD a brand. A line from before the brand was
  // recorded is having one added rather than changed, and throwing away its
  // colour over that would lose real work.
  const changingBrand = Boolean(previous) && !same(previous, nextSupplier);

  // ── THE PROFILE AND THE EDGE ARE LOOKED UP ──────────────────────────────
  //
  // Unlike colours, a shape is a shape: if both ranges list a Country Square
  // then the one on the line is as valid under the new brand as the old, and
  // clearing it would make somebody re-pick the same thing. Every caller has
  // the full profile rows, so this can be answered properly rather than
  // assumed.
  const next = { ...line, supplier_name: nextSupplier, supplierName: nextSupplier, supplier: nextSupplier };
  const problems = supplierConflicts(next, { colourRows, profileRows });

  const cleared = [];
  if (colour && (changingBrand || problems.some((problem) => problem.startsWith(colour)))) {
    cleared.push({ field: "colour", was: colour });
  }
  if (profile && problems.some((problem) => problem.startsWith(profile))) {
    cleared.push({ field: "profile", was: profile });
  }
  if (edge && problems.some((problem) => problem.includes(edge))) cleared.push({ field: "edge_mould", was: edge });
  return cleared;
}
