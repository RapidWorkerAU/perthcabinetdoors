// Helpers for importing design-tool items into a quote: turning a flagged
// item into a human reason, and collapsing identical flat lines into one.
// Kept pure (no DB, no request) so they're unit-testable in isolation.

// Which specific thing is wrong with a board line, as a short phrase to append
// to an import warning. The pre-flight check knows an item is unconfigured;
// this says WHY, so "8 items need attention" stops being a dead end.
export function missingReason({ material = false, dims = false, rate = false } = {}) {
  const parts = [];
  if (material) parts.push("no material selected");
  if (dims) parts.push("a size is 0");
  if (rate) parts.push("board rate is $0 (no cost per m² in the library)");
  return parts.length ? parts.join(", ") : "incomplete configuration";
}

// The identity of a flat line for merge purposes — every spec that a quote
// prices or manufactures off, INCLUDING description and notes. Two lines with
// the same key are, for the customer and the fabricator, the same product.
// Material/finish/colour are lower-cased so casing differences don't split an
// otherwise-identical pair.
function mergeKey(line) {
  return JSON.stringify([
    line.product_type || "",
    line.product_name || "",
    line.description || "",
    Number(line.width_mm) || 0,
    Number(line.height_mm) || 0,
    String(line.material || "").toLowerCase(),
    String(line.finish || "").toLowerCase(),
    String(line.colour || "").toLowerCase(),
    line.thickness || "",
    line.profile_type || "",
    line.profile || "",
    line.edge_mould || "",
    Number(line.unit_cost_per_sqm_ex_gst) || 0,
    line.unit_cost_mode || "auto",
    Boolean(line.hinge_holes),
    Boolean(line.hinge_supply),
    line.hinge_qty || "",
    String(line.notes || "").trim(),
  ]);
}

// Collapse lines that are identical in EVERY spec (see mergeKey) into a single
// line with the quantities summed — so two identical standalone panels, or the
// same door drilled the same way on two cabinets, bill as "qty 2" not two
// rows. Cabinet lines are never merged: each carries its own cabinet_config
// and must stay 1:1 with the cabinet it represents.
//
// Entries are { line, itemId } so the merged line can keep a design_item_id
// for the re-import sweep (the first contributor's — the sweep is scoped by
// design_project_id anyway, so which one doesn't matter). Order is preserved:
// a merged line sits where its first contributor first appeared.
export function mergeIdenticalLines(entries) {
  const out = [];
  const posByKey = new Map();

  for (const entry of entries) {
    const line = entry.line;
    // Cabinets (and anything carrying a cabinet_config) never merge.
    if (line.product_type === "base_cabinet" || line.cabinet_config) {
      out.push({ ...entry, line: { ...line } });
      continue;
    }
    const key = mergeKey(line);
    const at = posByKey.get(key);
    if (at === undefined) {
      posByKey.set(key, out.length);
      out.push({ ...entry, line: { ...line } });
    } else {
      const existing = out[at].line;
      existing.qty = (Number(existing.qty) || 1) + (Number(line.qty) || 1);
    }
  }

  return out;
}
