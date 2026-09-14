// WHAT A PIECE OF HARDWARE COSTS, READ WHEN THE QUOTE IS STAGED.
//
// The same rule the boards follow (lib/pcd-design-board-rates.js): the price
// comes out of the library at import, not off a copy taken when somebody drew
// the design. A rail that went up last week is quoted at this week's price, and
// nobody has to re-pick it on every design that carries one.
//
// It only touches lines that NAME the catalogue row they came from, which today
// is the accessories fitted inside a cabinet. Handles and hinges are chosen on a
// design by name and carry their own frozen cost, so they are left exactly as
// they are: there is no id on them to look anything up by.
//
// Pure, so the preview, the commit and the tests all price the same way.

const text = (value) => String(value ?? "").trim();

/**
 * Fill in the price of every hardware line that names a library row.
 *
 * @returns {{ lines: Array, priced: Array, missing: Array }}
 *   lines   the same lines, with product_unit_cost_ex_gst filled in
 *   priced  one entry per line priced, for reporting what it was priced at
 *   missing the ones whose row has gone from the library, so a caller can warn
 *           rather than quietly quote them at nothing
 */
export function withLibraryHardwareRates(lines = [], hardwareRows = []) {
  const byId = new Map((hardwareRows || []).map((row) => [row.id, row]));
  const priced = [];
  const missing = [];

  const next = (Array.isArray(lines) ? lines : []).map((line) => {
    const sourceId = text(line?.unit_cost_source_id);
    if (line?.product_type !== "Hardware" || !sourceId) return line;

    const row = byId.get(sourceId);
    if (!row) {
      missing.push({ name: text(line.product_name), id: sourceId });
      return line;
    }

    const cost = Number(row.unit_cost_ex_gst) || 0;
    priced.push({ name: text(line.product_name) || text(row.name), cost, qty: Number(line.qty) || 0 });
    return {
      ...line,
      // The library's own name, so a row renamed since it was picked reads as
      // what we actually sell. The design keeps its own copy for its own screen.
      product_name: [text(row.brand), text(row.name)].filter(Boolean).join(" ") || text(line.product_name),
      unit_cost_source_label: [text(row.brand), text(row.name)].filter(Boolean).join(" ") || text(line.unit_cost_source_label),
      product_unit_cost_ex_gst: cost,
      unit_cost_mode: "manual",
    };
  });

  return { lines: next, priced, missing };
}

/**
 * The same, for the { line, itemId, part } shape the design importer works in.
 */
export function withLibraryHardwareRatesForGenerated(generated = [], hardwareRows = []) {
  const { lines, priced, missing } = withLibraryHardwareRates(
    (Array.isArray(generated) ? generated : []).map((entry) => entry.line),
    hardwareRows
  );
  return {
    generated: (Array.isArray(generated) ? generated : []).map((entry, index) => ({ ...entry, line: lines[index] })),
    priced,
    missing,
  };
}
