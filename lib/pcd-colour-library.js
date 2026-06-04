export const COLOUR_MATERIALS = [
  { key: "thermolaminate", label: "Thermolaminate" },
  { key: "16mm", label: "16mm decorative board" },
  { key: "18mm", label: "18mm decorative board" },
  { key: "compact", label: "Compact laminate" },
];

export function normaliseColourMaterialKey(material) {
  const value = String(material || "").toLowerCase();
  if (value.includes("thermolaminate")) return "thermolaminate";
  if (value.includes("compact")) return "compact";
  if (value.includes("16")) return "16mm";
  if (value.includes("18")) return "18mm";
  return value || "";
}

export function colourFamilyLabel(materialKey) {
  if (materialKey === "thermolaminate") return "Thermolaminate";
  if (materialKey === "compact") return "Compact laminate";
  return "Decorative board";
}

export function colourFamilyNote(materialKey) {
  if (materialKey === "thermolaminate") {
    return "Thermolaminate colours suitable for wrapped door and drawer front profiles.";
  }
  if (materialKey === "compact") {
    return "Compact laminate colours for hard-wearing tops, wardrobe doors and wet-area surfaces.";
  }
  return "Decorative board colours for 16mm and 18mm board products.";
}

export function optionsFromColourFamily(colourFamily) {
  return (colourFamily?.groups || []).flatMap((group) =>
    (group.colours || []).map((colour) => ({
      finish: group.label,
      name: colour.name,
      src: colour.src,
      label: `${group.label} - ${colour.name}`,
    }))
  );
}

export function buildColourFamilyFromRows({ finishes = [], tiles = [], materialRows = [], material }) {
  const materialKey = normaliseColourMaterialKey(material);
  if (!materialKey) return null;

  const allowedTileIds = new Set(
    materialRows
      .filter((row) => row.material_key === materialKey)
      .map((row) => row.colour_tile_id)
  );

  const groups = finishes
    .map((finish) => {
      const colours = tiles
        .filter((tile) => tile.finish_id === finish.id && allowedTileIds.has(tile.id))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name)))
        .map((tile) => ({
          id: tile.id,
          name: tile.name,
          src: tile.image_url,
          costPerSqmExGst:
            materialRows.find((row) => row.colour_tile_id === tile.id && row.material_key === materialKey)
              ?.cost_per_sqm_ex_gst ?? 0,
        }));

      return {
        id: finish.id,
        label: finish.name,
        colours,
      };
    })
    .filter((group) => group.colours.length);

  if (!groups.length) return null;

  return {
    label: colourFamilyLabel(materialKey),
    note: colourFamilyNote(materialKey),
    groups,
  };
}

export async function getDatabaseColourFamily(supabase, material) {
  const materialKey = normaliseColourMaterialKey(material);
  if (!materialKey) return null;

  const [finishesResult, tilesResult, materialResult] = await Promise.all([
    supabase
      .from("pcd_colour_finishes")
      .select("id,name,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("pcd_colour_tiles")
      .select("id,finish_id,name,image_url,image_path,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("pcd_colour_tile_materials")
      .select("colour_tile_id,material_key,cost_per_sqm_ex_gst")
      .eq("material_key", materialKey),
  ]);

  if (finishesResult.error || tilesResult.error || materialResult.error) return null;

  return buildColourFamilyFromRows({
    finishes: finishesResult.data || [],
    tiles: tilesResult.data || [],
    materialRows: materialResult.data || [],
    material: materialKey,
  });
}
