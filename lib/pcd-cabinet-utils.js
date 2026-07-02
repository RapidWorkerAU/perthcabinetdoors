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
  const secondaryWidthMm = toPositiveNumber(config.secondary_width_mm ?? config.secondaryWidthMm);

  return {
    is_corner: Boolean(config.is_corner ?? config.isCorner) && secondaryWidthMm > 0,
    height_mm: heightMm,
    width_mm: toPositiveNumber(config.width_mm ?? config.widthMm),
    secondary_width_mm: secondaryWidthMm,
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
    has_rangehood: Boolean(config.has_rangehood ?? config.hasRangehood),
    rangehood_housing_height_mm: toPositiveNumber(config.rangehood_housing_height_mm ?? config.rangehoodHousingHeightMm),
    rangehood_channel_width_mm: toPositiveNumber(config.rangehood_channel_width_mm ?? config.rangehoodChannelWidthMm),
    cost_per_sqm_carcass: toPositiveNumber(config.cost_per_sqm_carcass ?? config.costPerSqmCarcass),
    cost_per_sqm_shelf: toPositiveNumber(config.cost_per_sqm_shelf ?? config.costPerSqmShelf),
    labour_hours: toPositiveNumber(config.labour_hours ?? config.labourHours ?? config.labour_cost ?? config.labourCost),
    labour_cost: toPositiveNumber(config.labour_hours ?? config.labourHours ?? config.labour_cost ?? config.labourCost),
  };
}

// L-shaped corner cabinet panel calc. Approximation, not exact manufacturing
// spec: the two legs are tiled as non-overlapping rectangles — leg A (the
// primary wall) keeps the full depth×depth corner square, leg B (secondary
// wall) is measured excluding it, so combined area exactly matches the true
// L-shaped footprint with nothing double-counted. Only the outer (far from
// corner) end of each leg gets a side panel; the corner itself is where the
// two legs join, no separate panel assumed there. Refine once real
// construction specs are available.
function calculateCornerCabinetCutList(normalized) {
  const T = normalized.carcass_thickness_mm;
  const depth = normalized.depth_mm;
  const backThickness = normalized.back_panel_included ? normalized.back_panel_thickness_mm : 0;
  const legAPanelDepth = Math.max(0, depth - backThickness);
  const legBWidth = Math.max(0, normalized.secondary_width_mm - depth);

  const carcassMaterial = materialDisplay({
    material: normalized.carcass_material,
    finish: normalized.carcass_finish,
    colour: normalized.carcass_colour,
  }) || normalized.carcass_material;

  const pieces = [
    cutPiece({
      label: "Side panel — wall 1 outer end",
      qty: 1,
      widthMm: legAPanelDepth,
      heightMm: normalized.height_mm,
      material: carcassMaterial,
      thicknessMm: T,
    }),
    cutPiece({
      label: "Side panel — wall 2 outer end",
      qty: 1,
      widthMm: legAPanelDepth,
      heightMm: normalized.height_mm,
      material: carcassMaterial,
      thicknessMm: T,
    }),
    cutPiece({
      label: "Top panel — wall 1 leg",
      qty: 1,
      widthMm: Math.max(0, normalized.width_mm - T),
      heightMm: legAPanelDepth,
      material: carcassMaterial,
      thicknessMm: T,
    }),
    cutPiece({
      label: "Bottom panel — wall 1 leg",
      qty: 1,
      widthMm: Math.max(0, normalized.width_mm - T),
      heightMm: legAPanelDepth,
      material: carcassMaterial,
      thicknessMm: T,
    }),
  ];

  if (legBWidth > 0) {
    pieces.push(
      cutPiece({
        label: "Top panel — wall 2 leg",
        qty: 1,
        widthMm: Math.max(0, legBWidth - T),
        heightMm: legAPanelDepth,
        material: carcassMaterial,
        thicknessMm: T,
      }),
      cutPiece({
        label: "Bottom panel — wall 2 leg",
        qty: 1,
        widthMm: Math.max(0, legBWidth - T),
        heightMm: legAPanelDepth,
        material: carcassMaterial,
        thicknessMm: T,
      })
    );
  }

  if (normalized.back_panel_included) {
    const backMaterial = materialDisplay({
      material: normalized.back_panel_material,
      finish: normalized.carcass_finish,
      colour: normalized.carcass_colour,
    }) || normalized.back_panel_material;

    pieces.push(
      cutPiece({
        label: "Back panel — wall 1 leg",
        qty: 1,
        widthMm: normalized.width_mm,
        heightMm: normalized.height_mm,
        material: backMaterial,
        thicknessMm: normalized.back_panel_thickness_mm,
      })
    );
    if (legBWidth > 0) {
      pieces.push(
        cutPiece({
          label: "Back panel — wall 2 leg",
          qty: 1,
          widthMm: legBWidth,
          heightMm: normalized.height_mm,
          material: backMaterial,
          thicknessMm: normalized.back_panel_thickness_mm,
        })
      );
    }
  }

  if (normalized.shelf_qty > 0) {
    const shelfMaterial = materialDisplay({
      material: normalized.shelf_material,
      finish: normalized.shelf_finish,
      colour: normalized.shelf_colour,
    }) || normalized.shelf_material;

    pieces.push(
      cutPiece({
        label: "Shelf — wall 1 leg",
        qty: normalized.shelf_qty,
        widthMm: Math.max(0, normalized.width_mm - T),
        heightMm: legAPanelDepth,
        material: shelfMaterial,
        thicknessMm: normalized.shelf_thickness_mm,
      })
    );
    if (legBWidth > 0) {
      pieces.push(
        cutPiece({
          label: "Shelf — wall 2 leg",
          qty: normalized.shelf_qty,
          widthMm: Math.max(0, legBWidth - T),
          heightMm: legAPanelDepth,
          material: shelfMaterial,
          thicknessMm: normalized.shelf_thickness_mm,
        })
      );
    }
  }

  return pieces;
}

export function calculateCabinetCutList(config = {}) {
  const normalized = normalizeCabinetConfig(config);
  if (normalized.is_corner) return calculateCornerCabinetCutList(normalized);
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

  // Rangehood cabinet — a boxed recess at the bottom for the rangehood
  // unit, and a boxed vertical channel above it (full carcass depth) for
  // the flue. Splits any shelves into a matching left/right pair around
  // the channel instead of one full-width board.
  const carcassMaterialLabel = materialDisplay({
    material: normalized.carcass_material,
    finish: normalized.carcass_finish,
    colour: normalized.carcass_colour,
  }) || normalized.carcass_material;
  const hasRangehoodChannel = normalized.has_rangehood && normalized.rangehood_channel_width_mm > 0;
  const channelWidth = hasRangehoodChannel
    ? Math.min(normalized.rangehood_channel_width_mm, internalWidth)
    : 0;

  if (hasRangehoodChannel) {
    const housingHeight = Math.min(normalized.rangehood_housing_height_mm, normalized.height_mm);
    const channelHeight = Math.max(0, normalized.height_mm - housingHeight);

    pieces.push(
      cutPiece({
        label: "Rangehood housing divider",
        qty: 1,
        widthMm: internalWidth,
        heightMm: carcassPanelDepth,
        material: carcassMaterialLabel,
        thicknessMm: normalized.carcass_thickness_mm,
      }),
      cutPiece({
        label: "Rangehood channel — left wall",
        qty: 1,
        widthMm: carcassPanelDepth,
        heightMm: channelHeight,
        material: carcassMaterialLabel,
        thicknessMm: normalized.carcass_thickness_mm,
      }),
      cutPiece({
        label: "Rangehood channel — right wall",
        qty: 1,
        widthMm: carcassPanelDepth,
        heightMm: channelHeight,
        material: carcassMaterialLabel,
        thicknessMm: normalized.carcass_thickness_mm,
      })
    );
  }

  if (normalized.shelf_qty > 0) {
    const shelfMaterialLabel = materialDisplay({
      material: normalized.shelf_material,
      finish: normalized.shelf_finish,
      colour: normalized.shelf_colour,
    }) || normalized.shelf_material;

    if (hasRangehoodChannel) {
      const sideTotal = Math.max(0, internalWidth - channelWidth);
      const leftWidth = Math.floor(sideTotal / 2);
      const rightWidth = sideTotal - leftWidth;
      pieces.push(
        cutPiece({
          label: "Shelf — left of channel",
          qty: normalized.shelf_qty,
          widthMm: leftWidth,
          heightMm: shelfDepth,
          material: shelfMaterialLabel,
          thicknessMm: normalized.shelf_thickness_mm,
        }),
        cutPiece({
          label: "Shelf — right of channel",
          qty: normalized.shelf_qty,
          widthMm: rightWidth,
          heightMm: shelfDepth,
          material: shelfMaterialLabel,
          thicknessMm: normalized.shelf_thickness_mm,
        })
      );
    } else {
      pieces.push(
        cutPiece({
          label: "Shelf",
          qty: normalized.shelf_qty,
          widthMm: internalWidth,
          heightMm: shelfDepth,
          material: shelfMaterialLabel,
          thicknessMm: normalized.shelf_thickness_mm,
        })
      );
    }
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
