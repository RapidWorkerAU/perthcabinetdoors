"use client";

// Mobile "price on the run" costing. Reuses the desktop cut list (the exact
// pieces shown in the left panel) so the mobile price matches what the designer
// sees, and costs each piece by its material tag.
//
// Rate policy (confirmed with the business):
//   - shelf                       -> shelf rate  (cost_per_sqm_shelf)
//   - door / drawer / finished panel -> front rate (unit_cost_per_sqm_ex_gst)
//   - carcass / back / kickboard / filler -> carcass rate (cost_per_sqm_carcass)
// Finished end/side/back/underside panels use the door/front rate because
// they're made to match the door material.
import { computeCutList } from "../DesignLeftPanel";

function rateFor(material, rates) {
  switch (material) {
    case "shelf":
      return rates.shelf;
    case "door":
    case "drawer":
    case "panel":
      return rates.front;
    default: // undefined (carcass sides/top/bottom), "back", "kickboard", "filler"
      return rates.carcass;
  }
}

export function cabinetCutList(item, roomItems = [], room = null) {
  if (!item) return [];
  return computeCutList(item, roomItems, room);
}

export function cabinetMaterialCost(item, roomItems = [], room = null, parts = null) {
  if (!item) return 0;
  const pieces = parts || computeCutList(item, roomItems, room);
  const carcass = Number(item.cost_per_sqm_carcass) || 0;
  const rates = {
    carcass,
    shelf: Number(item.cost_per_sqm_shelf) || carcass,
    front: Number(item.unit_cost_per_sqm_ex_gst) || 0,
  };
  return pieces.reduce((sum, p) => {
    const areaSqm = ((Number(p.dim1) || 0) * (Number(p.dim2) || 0)) / 1_000_000;
    const qty = Number(p.qty) || 1;
    return sum + areaSqm * qty * rateFor(p.material, rates);
  }, 0);
}
