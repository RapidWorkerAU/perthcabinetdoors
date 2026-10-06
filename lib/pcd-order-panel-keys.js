// THE NAME OF EACH PANEL ON AN ORDER LINE.
//
// A line's planning is stored per panel, under a key. The order page builds
// the keys while it draws the planning tabs; Alfred needs exactly the same keys
// to change the same panels. One definition, used by both, so a change Alfred
// makes lands on the panel the order page shows rather than beside it.
//
//   a plain line              line:<item id>
//   each piece of a cabinet   cabinet:<copy>:<piece label>:<piece number>

export function panelKeyFor(...parts) {
  return parts.map((part) => String(part ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item").join(":");
}

/** The cut list a cabinet line is planned from, if it is a cabinet. */
export function cabinetPiecesOf(item) {
  const config = item?.cabinet_config || item?.cabinet_config_snapshot || null;
  return Array.isArray(config?.calculated_cut_list) ? config.calculated_cut_list : [];
}

/**
 * Every panel on one order line, keyed the way the order page keys them, with
 * a label a person recognises. Mirrors buildOrderPlanningRows in
 * app/admin/orders/[id]/OrderDetail.js.
 */
export function panelsOfItem(item) {
  const pieces = cabinetPiecesOf(item);
  const isCabinet = item?.product_type === "base_cabinet" || Boolean(item?.cabinet_config || item?.cabinet_config_snapshot);
  if (isCabinet && pieces.length) {
    const lineQty = Math.max(1, Math.floor(Number(item.qty || 1)));
    const panels = [];
    for (let copyIndex = 0; copyIndex < lineQty; copyIndex += 1) {
      pieces.forEach((piece) => {
        const pieceQty = Math.max(1, Math.floor(Number(piece.qty || 1)));
        for (let pieceIndex = 0; pieceIndex < pieceQty; pieceIndex += 1) {
          panels.push({
            panelKey: panelKeyFor("cabinet", copyIndex, piece.label, pieceIndex),
            label: `${piece.label}${pieceQty > 1 ? ` ${pieceIndex + 1}` : ""}${lineQty > 1 ? `, cabinet ${copyIndex + 1}` : ""}`,
          });
        }
      });
    }
    return panels;
  }
  return [{ panelKey: panelKeyFor("line", item?.id), label: "" }];
}
