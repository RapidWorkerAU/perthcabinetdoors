// WHAT A CATALOGUE ITEM COSTS TODAY: hardware and benchtop material.
//
// The board library has its own resolver (lib/pcd-board-cost.js) because a
// board is matched on five things at once, supplier, material, thickness,
// finish and colour. Hardware and benchtop are simpler: a line names the row it
// came from, and the row has a price. This is that, once, so the reprice does
// not grow a private copy per library.
//
// ── WHAT WE WILL AND WILL NOT GUESS ─────────────────────────────────────────
//
// The id on the line wins. Where there is no id we will match on the NAME, but
// only when exactly one price answers to it: two active rows called the same
// thing at different money is a catalogue problem, and picking one of them at
// random on somebody's quote is the worst possible way to surface it. That case
// is reported, not resolved.
//
// A row with no price is not a miss. Much of the catalogue is costed by hand at
// quote time, so "the library has nothing to say" leaves whatever is on the
// line alone rather than wiping it to zero.

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();
const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The name a catalogue row is known by: "Blum 110 Deg Inserta". */
export function catalogueLabel(row = {}, fields = ["brand", "name"]) {
  return fields.map((f) => text(row[f])).filter(Boolean).join(" ");
}

function hit(row, cost, matchedBy, fields) {
  return { ok: true, id: row.id, label: catalogueLabel(row, fields), cost, matchedBy };
}

function miss(reason, message, extra = {}) {
  return { ok: false, reason, message, ...extra };
}

/**
 * Match one line against a catalogue.
 *
 * @param {Array}  rows    the catalogue's active rows
 * @param {object} spec    { sourceId, name }
 * @param {object} options { costField, nameFields, what }
 * @returns {{ok: true, id, label, cost, matchedBy}|{ok: false, reason, message}}
 */
export function matchCatalogueCost(rows = [], spec = {}, options = {}) {
  const costField = options.costField || "unit_cost_ex_gst";
  const fields = options.nameFields || ["brand", "name"];
  const what = options.what || "item";
  const list = Array.isArray(rows) ? rows : [];

  const sourceId = text(spec.sourceId);
  if (sourceId) {
    const exact = list.find((row) => row.id === sourceId);
    if (exact) {
      const cost = money(exact[costField]);
      return cost > 0
        ? hit(exact, cost, "id", fields)
        : miss("unpriced", `${catalogueLabel(exact, fields) || what} has no price in the library yet.`, { id: exact.id });
    }
    // A row deleted or retired since. Fall through to the name rather than
    // failing outright, the same way a stale board id does.
  }

  const wanted = lower(spec.name);
  if (!wanted) return miss("not_found", `This ${what} does not name a library row, so there is nothing to price it from.`);

  const candidates = list.filter((row) => lower(catalogueLabel(row, fields)) === wanted || lower(row.name) === wanted);
  if (!candidates.length) return miss("not_found", `No ${what} in the library is called "${text(spec.name)}".`);

  const priced = candidates.filter((row) => money(row[costField]) > 0);
  if (!priced.length) return miss("unpriced", `"${text(spec.name)}" has no price in the library yet.`, { id: candidates[0].id });

  const prices = new Set(priced.map((row) => money(row[costField])));
  if (prices.size > 1) {
    return miss("ambiguous", `Two library rows called "${text(spec.name)}" have different prices, so this was left alone.`);
  }
  return hit(priced[0], money(priced[0][costField]), "name", fields);
}

// ── THE LIBRARIES THIS PRICES FROM ──────────────────────────────────────────
//
// One entry per library that HAS prices in it, and the shape of a line that
// takes its price from there. The Profile Library is deliberately absent: it
// holds no cost, so there is nothing in it to reprice.
export const CATALOGUES = [
  {
    key: "hardware",
    label: "Hardware Library",
    table: "pcd_hardware",
    costField: "unit_cost_ex_gst",
    nameFields: ["brand", "name"],
    what: "hardware item",
    productTypes: ["Hardware"],
    // Hardware is priced per piece, not per square metre.
    rateField: "product_unit_cost_ex_gst",
  },
  {
    key: "benchtop",
    label: "Benchtop Library",
    table: "pcd_benchtop_materials",
    costField: "cost_per_sqm_ex_gst",
    nameFields: ["name"],
    what: "benchtop material",
    productTypes: ["Benchtop"],
    rateField: "unit_cost_per_sqm_ex_gst",
  },
];

/** The catalogue a line is priced from, or null when it is a board. */
export function catalogueForLine(line = {}) {
  return CATALOGUES.find((c) => c.productTypes.includes(line.product_type)) || null;
}

/**
 * The name to look a line up by, when its id has gone.
 *
 * The source label is what was captured when somebody picked it, so it survives
 * the row being renamed; the product name is the fallback, and on a benchtop
 * that is the word "Benchtop" so the material is used instead.
 */
export function catalogueNameForLine(line = {}, catalogue = null) {
  if (catalogue?.key === "benchtop") return text(line.material) || text(line.unit_cost_source_label);
  return text(line.unit_cost_source_label) || text(line.product_name);
}
