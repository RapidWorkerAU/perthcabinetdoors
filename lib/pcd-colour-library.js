export const COLOUR_MATERIALS = [
  { key: "decorative_board", label: "Decorative Board", value: "decorative board" },
  { key: "thermolaminate", label: "Thermolaminate", value: "thermolaminate" },
  { key: "compact_laminate", label: "Compact Laminate", value: "compact laminate" },
];

export const COLOUR_THICKNESS_BY_MATERIAL = {
  "decorative board": ["16mm", "18mm"],
  thermolaminate: ["18mm", "21mm"],
  "compact laminate": ["13mm", "5mm", "18mm"],
};

export const COLOUR_ORDER_TYPES = [
  { value: "supply board", label: "Supply board" },
  { value: "made to order MTO", label: "Made to order MTO" },
];

export function normaliseOrderTypes(rowOrTypes) {
  if (Array.isArray(rowOrTypes)) {
    return rowOrTypes.filter(Boolean);
  }
  if (Array.isArray(rowOrTypes?.order_types)) {
    return rowOrTypes.order_types.filter(Boolean);
  }
  return rowOrTypes?.order_type ? [rowOrTypes.order_type] : ["supply board"];
}

export function orderTypesLabel(rowOrTypes) {
  const values = normaliseOrderTypes(rowOrTypes);
  return values
    .map((value) => COLOUR_ORDER_TYPES.find((type) => type.value === value)?.label || value)
    .join(", ");
}

export function normaliseColourMaterialKey(material) {
  const value = String(material || "").toLowerCase();
  if (value.includes("decorative") || value.includes("16") || value.includes("18")) return "decorative_board";
  if (value.includes("thermolaminate")) return "thermolaminate";
  if (value.includes("compact")) return "compact_laminate";
  return value || "";
}

export function materialTypeForKey(material) {
  const key = normaliseColourMaterialKey(material);
  return COLOUR_MATERIALS.find((item) => item.key === key)?.value || String(material || "");
}

export function materialLabelForType(materialType) {
  const key = normaliseColourMaterialKey(materialType);
  return COLOUR_MATERIALS.find((item) => item.key === key)?.label || String(materialType || "");
}

export function colourFamilyLabel(material) {
  const key = normaliseColourMaterialKey(material);
  if (key === "thermolaminate") return "Thermolaminate";
  if (key === "compact_laminate") return "Compact Laminate";
  return materialTypeForKey(key) || "Decorative board";
}

export function colourFamilyNote(material) {
  const key = normaliseColourMaterialKey(material);
  if (key === "thermolaminate") {
    return "Thermolaminate colours suitable for wrapped door and drawer front profiles.";
  }
  if (key === "compact_laminate") {
    return "Compact laminate colours for hard-wearing tops, wardrobe doors and wet-area surfaces.";
  }
  return "Decorative board colours for 16mm and 18mm board products.";
}

export function thicknessOptionsForMaterial(material) {
  const materialType = materialTypeForKey(material);
  return COLOUR_THICKNESS_BY_MATERIAL[materialType] || [];
}

export function inferThicknessFromMaterial(material) {
  const value = String(material || "").toLowerCase();
  if (value.includes("21")) return "21mm";
  if (value.includes("18")) return "18mm";
  if (value.includes("16")) return "16mm";
  if (value.includes("13")) return "13mm";
  if (value.includes("5")) return "5mm";
  return "";
}

export function optionsFromColourFamily(colourFamily) {
  return (colourFamily?.groups || []).flatMap((group) =>
    (group.colours || []).map((colour) => ({
      id: colour.id,
      finish: group.label,
      name: colour.name,
      src: colour.src,
      supplier: colour.supplier || "",
      orderType: colour.orderType || "",
      orderTypes: colour.orderTypes || normaliseOrderTypes(colour.orderType ? [colour.orderType] : []),
      costPerBoardExGst: colour.costPerBoardExGst ?? 0,
      costPerSqmExGst: colour.costPerSqmExGst ?? 0,
      preferredBoardWidthMm: colour.preferredBoardWidthMm ?? 0,
      preferredBoardHeightMm: colour.preferredBoardHeightMm ?? 0,
      label: `${group.label} - ${colour.name}`,
    }))
  );
}

export function buildColourFamilyFromLibraryRows({ rows = [], material, thickness = "" }) {
  const materialType = materialTypeForKey(material);
  if (!materialType) return null;
  const materialKey = normaliseColourMaterialKey(materialType);
  const thicknessValue = String(thickness || inferThicknessFromMaterial(material)).trim().toLowerCase();

  const activeRows = rows
    .filter((row) => row.is_active !== false)
    .filter((row) => normaliseColourMaterialKey(row.material_type) === materialKey)
    .filter((row) => {
      if (!thicknessValue) return true;
      return String(row.thickness || "").trim().toLowerCase() === thicknessValue;
    })
    .sort((a, b) => {
      const finishSort = String(a.finish_type || "").localeCompare(String(b.finish_type || ""));
      if (finishSort) return finishSort;
      const orderSort = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (orderSort) return orderSort;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  const finishMap = new Map();
  activeRows.forEach((row) => {
    const finish = String(row.finish_type || "Unspecified").trim() || "Unspecified";
    if (!finishMap.has(finish)) {
      finishMap.set(finish, []);
    }
    const colours = finishMap.get(finish);
    const colourName = String(row.name || "").trim();
    const existingIndex = colours.findIndex(
      (colour) => String(colour.name || "").trim().toLowerCase() === colourName.toLowerCase()
    );
    const nextColour = {
      id: row.id,
      name: colourName,
      src: row.image_url || "",
      imagePath: row.image_path || "",
      supplier: row.supplier_name || "Polytec",
      orderType: row.order_type || "supply board",
      orderTypes: normaliseOrderTypes(row),
      costPerBoardExGst: Number(row.cost_per_board_ex_gst || 0),
      costPerSqmExGst: Number(row.cost_per_sqm_ex_gst || 0),
      preferredBoardWidthMm: Number(row.preferred_board_width_mm || 0),
      preferredBoardHeightMm: Number(row.preferred_board_height_mm || 0),
    };

    if (existingIndex === -1) {
      colours.push(nextColour);
      return;
    }

    if (!colours[existingIndex].src && nextColour.src) {
      colours[existingIndex] = nextColour;
    }
  });

  const groups = Array.from(finishMap.entries()).map(([label, colours]) => ({
    label,
    colours,
  }));

  return {
    label: colourFamilyLabel(material),
    note: colourFamilyNote(material),
    groups,
  };
}

export function buildColourAvailabilityFromLibraryRows(rows = []) {
  const availability = {};

  rows
    .filter((row) => row.is_active !== false)
    .forEach((row) => {
      const materialKey = normaliseColourMaterialKey(row.material_type);
      const thickness = String(row.thickness || "").trim();
      if (!materialKey || !thickness) return;
      if (!availability[materialKey]) availability[materialKey] = [];
      if (!availability[materialKey].includes(thickness)) {
        availability[materialKey].push(thickness);
      }
    });

  Object.keys(availability).forEach((materialKey) => {
    const preferredOrder = COLOUR_THICKNESS_BY_MATERIAL[materialTypeForKey(materialKey)] || [];
    availability[materialKey].sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a);
      const bIndex = preferredOrder.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.localeCompare(b, undefined, { numeric: true });
    });
  });

  return availability;
}

export async function getDatabaseColourRows(supabase, { activeOnly = false, throwOnError = false } = {}) {
  let query = supabase
    .from("pcd_colour_library")
    .select("*")
    .order("material_type", { ascending: true })
    .order("thickness", { ascending: true })
    .order("finish_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    if (throwOnError) throw error;
    return [];
  }
  return data || [];
}

export async function getDatabaseColourFamily(supabase, material) {
  return getDatabaseColourFamilyForSelection(supabase, { material });
}

export async function getDatabaseColourFamilyForSelection(supabase, { material, thickness = "" }) {
  const materialType = materialTypeForKey(material);
  if (!materialType) return null;

  const { data, error } = await supabase
    .from("pcd_colour_library")
    .select("*")
    .eq("is_active", true)
    .order("finish_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return null;

  return buildColourFamilyFromLibraryRows({
    rows: data || [],
    material,
    thickness,
  });
}

export async function getDatabaseColourSuppliers(supabase) {
  const { data, error } = await supabase
    .from("pcd_colour_library")
    .select("id,name,finish_type,supplier_name,is_active")
    .eq("is_active", true)
    .order("finish_type", { ascending: true })
    .order("name", { ascending: true });

  if (error) return [];

  return (data || []).map((row) => ({
    id: row.id,
    finish: row.finish_type || "",
    name: row.name,
    supplier: row.supplier_name || "Polytec",
    label: [row.finish_type, row.name].filter(Boolean).join(" - "),
  }));
}
