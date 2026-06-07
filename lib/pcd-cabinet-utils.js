function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveNumber(value, fallback = 0) {
  return Math.max(0, toNumber(value, fallback));
}

function toPositiveInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toNumber(value, fallback)));
}

function normalizeShelfHeights(value, count, heightMm) {
  const source = Array.isArray(value) ? value : [];
  const cabinetHeight = toPositiveNumber(heightMm);
  return Array.from({ length: count }, (_, index) => {
    const saved = toPositiveNumber(source[index]);
    if (saved > 0) return Math.min(saved, cabinetHeight);
    return count && cabinetHeight ? Math.round(((index + 1) * cabinetHeight) / (count + 1)) : 0;
  });
}

function roundDecimal(value, places = 4) {
  const multiplier = 10 ** places;
  return Math.round((toNumber(value) + Number.EPSILON) * multiplier) / multiplier;
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function areaSqm(widthMm, heightMm) {
  return roundDecimal((toPositiveNumber(widthMm) / 1000) * (toPositiveNumber(heightMm) / 1000), 4);
}

function materialDisplay({ material, finish, colour }) {
  return [material, finish, colour].filter(Boolean).join(" - ");
}

function cutPiece({ label, qty = 1, widthMm, heightMm, material, thicknessMm }) {
  const width = toPositiveNumber(widthMm);
  const height = toPositiveNumber(heightMm);

  return {
    label,
    qty: toPositiveInteger(qty, 1),
    width_mm: width,
    height_mm: height,
    material: material || "",
    thickness_mm: toPositiveNumber(thicknessMm),
    area_sqm: areaSqm(width, height),
  };
}

export function normalizeCabinetConfig(config = {}) {
  const carcassMaterial = config.carcass_material ?? config.carcassMaterial ?? "";
  const shelfMaterial = config.shelf_material ?? config.shelfMaterial ?? carcassMaterial;
  const shelfFinish = config.shelf_finish ?? config.shelfFinish ?? "";
  const shelfColour = config.shelf_colour ?? config.shelfColour ?? "";
  const carcassFinish = config.carcass_finish ?? config.carcassFinish ?? "";
  const carcassColour = config.carcass_colour ?? config.carcassColour ?? "";

  const shelfQty = toPositiveInteger(config.shelf_qty ?? config.shelfQty);
  const heightMm = toPositiveNumber(config.height_mm ?? config.heightMm);

  return {
    height_mm: heightMm,
    width_mm: toPositiveNumber(config.width_mm ?? config.widthMm),
    depth_mm: toPositiveNumber(config.depth_mm ?? config.depthMm),
    carcass_material: carcassMaterial,
    carcass_finish: carcassFinish,
    carcass_colour: carcassColour,
    carcass_thickness_mm: toPositiveNumber(config.carcass_thickness_mm ?? config.carcassThicknessMm, 16),
    back_panel_included: Boolean(config.back_panel_included ?? config.backPanelIncluded ?? true),
    back_panel_material: config.back_panel_material ?? config.backPanelMaterial ?? carcassMaterial,
    back_panel_thickness_mm: toPositiveNumber(config.back_panel_thickness_mm ?? config.backPanelThicknessMm, 16),
    shelf_qty: shelfQty,
    shelf_material: shelfMaterial,
    shelf_finish: shelfFinish,
    shelf_colour: shelfColour,
    shelf_thickness_mm: toPositiveNumber(config.shelf_thickness_mm ?? config.shelfThicknessMm, 16),
    shelf_heights_mm: normalizeShelfHeights(config.shelf_heights_mm ?? config.shelfHeightsMm, shelfQty, heightMm),
    cost_per_sqm_carcass: toPositiveNumber(config.cost_per_sqm_carcass ?? config.costPerSqmCarcass),
    cost_per_sqm_shelf: toPositiveNumber(config.cost_per_sqm_shelf ?? config.costPerSqmShelf),
    labour_hours: toPositiveNumber(config.labour_hours ?? config.labourHours ?? config.labour_cost ?? config.labourCost),
    labour_cost: toPositiveNumber(config.labour_hours ?? config.labourHours ?? config.labour_cost ?? config.labourCost),
  };
}

export function calculateCabinetCutList(config = {}) {
  const normalized = normalizeCabinetConfig(config);
  const internalWidth = Math.max(0, normalized.width_mm - (2 * normalized.carcass_thickness_mm));
  const backThickness = normalized.back_panel_included ? normalized.back_panel_thickness_mm : 0;
  const carcassPanelDepth = Math.max(0, normalized.depth_mm - backThickness);
  const shelfDepth = carcassPanelDepth;

  const pieces = [
    cutPiece({
      label: "Left side panel",
      qty: 1,
      widthMm: carcassPanelDepth,
      heightMm: normalized.height_mm,
      material: materialDisplay({
        material: normalized.carcass_material,
        finish: normalized.carcass_finish,
        colour: normalized.carcass_colour,
      }) || normalized.carcass_material,
      thicknessMm: normalized.carcass_thickness_mm,
    }),
    cutPiece({
      label: "Right side panel",
      qty: 1,
      widthMm: carcassPanelDepth,
      heightMm: normalized.height_mm,
      material: materialDisplay({
        material: normalized.carcass_material,
        finish: normalized.carcass_finish,
        colour: normalized.carcass_colour,
      }) || normalized.carcass_material,
      thicknessMm: normalized.carcass_thickness_mm,
    }),
    cutPiece({
      label: "Top panel",
      qty: 1,
      widthMm: internalWidth,
      heightMm: carcassPanelDepth,
      material: materialDisplay({
        material: normalized.carcass_material,
        finish: normalized.carcass_finish,
        colour: normalized.carcass_colour,
      }) || normalized.carcass_material,
      thicknessMm: normalized.carcass_thickness_mm,
    }),
    cutPiece({
      label: "Bottom panel",
      qty: 1,
      widthMm: internalWidth,
      heightMm: carcassPanelDepth,
      material: materialDisplay({
        material: normalized.carcass_material,
        finish: normalized.carcass_finish,
        colour: normalized.carcass_colour,
      }) || normalized.carcass_material,
      thicknessMm: normalized.carcass_thickness_mm,
    }),
  ];

  if (normalized.back_panel_included) {
    pieces.push(
      cutPiece({
        label: "Back panel",
        qty: 1,
        widthMm: normalized.width_mm,
        heightMm: normalized.height_mm,
        material: materialDisplay({
          material: normalized.back_panel_material,
          finish: normalized.carcass_finish,
          colour: normalized.carcass_colour,
        }) || normalized.back_panel_material,
        thicknessMm: normalized.back_panel_thickness_mm,
      })
    );
  }

  if (normalized.shelf_qty > 0) {
    pieces.push(
      cutPiece({
        label: "Shelf",
        qty: normalized.shelf_qty,
        widthMm: internalWidth,
        heightMm: shelfDepth,
        material: materialDisplay({
          material: normalized.shelf_material,
          finish: normalized.shelf_finish,
          colour: normalized.shelf_colour,
        }) || normalized.shelf_material,
        thicknessMm: normalized.shelf_thickness_mm,
      })
    );
  }

  return pieces;
}

export function calculateCabinetMaterialCost(cutList = [], costPerSqmCarcass = 0, costPerSqmShelf = 0) {
  return roundMoney(
    cutList.reduce((total, piece) => {
      const rate = String(piece?.label || "").toLowerCase().includes("shelf")
        ? toPositiveNumber(costPerSqmShelf)
        : toPositiveNumber(costPerSqmCarcass);

      return total + (toPositiveNumber(piece?.area_sqm) * toPositiveInteger(piece?.qty, 1) * rate);
    }, 0)
  );
}

export function calculateCabinetTotals(config = {}) {
  const normalized = normalizeCabinetConfig(config);
  const cutList = calculateCabinetCutList(normalized);
  const materialCost = calculateCabinetMaterialCost(
    cutList,
    normalized.cost_per_sqm_carcass,
    normalized.cost_per_sqm_shelf || normalized.cost_per_sqm_carcass
  );
  const labourHours = roundDecimal(normalized.labour_hours, 2);

  return {
    cut_list: cutList,
    calculated_material_cost_ex_gst: materialCost,
    labour_hours: labourHours,
    labour_cost: labourHours,
    total_cabinet_cost_ex_gst: materialCost,
  };
}
