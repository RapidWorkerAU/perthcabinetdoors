import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { saveQuoteLine } from "../../../../quotes/[id]/_quote-line-save";
import { roundMoney } from "../../../../../../../lib/pcd-quote-utils";
import { calculateCabinetTotals, normalizeCabinetConfig } from "../../../../../../../lib/pcd-cabinet-utils";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet"];

const TYPE_LABELS = {
  base_cabinet: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall_cabinet: "Tall Cabinet",
  door: "Door",
  drawer_front: "Drawer Front",
  panel: "Panel",
};

function itemLabel(item) {
  return item.label || TYPE_LABELS[item.item_type] || item.item_type;
}

function cabinetDescription(config) {
  const shelfText =
    Number(config.shelf_qty) > 0
      ? `, ${config.shelf_qty} ${Number(config.shelf_qty) === 1 ? "shelf" : "shelves"}`
      : "";
  return `${config.width_mm}mm wide x ${config.height_mm}mm high x ${config.depth_mm}mm deep - ${config.carcass_material || "cabinet board"} ${config.carcass_thickness_mm}mm carcass${shelfText}`;
}

function withCalculatedCabinetCost(line) {
  const config = normalizeCabinetConfig(line.cabinet_config || {});
  const totals = calculateCabinetTotals(config);
  const unitCost = totals.calculated_material_cost_ex_gst;
  const label = String(line.product_name || config.label || "").trim() || "Base cabinet";

  return {
    ...line,
    product_name: label,
    description: line.description || cabinetDescription({ ...config, label }),
    product_unit_cost_ex_gst: unitCost,
    calculated_unit_cost_ex_gst: unitCost,
    cabinet_config: {
      ...(line.cabinet_config || {}),
      ...config,
      label,
      notes: line.cabinet_config?.notes || line.notes || "",
      calculated_cut_list: totals.cut_list,
      calculated_material_cost_ex_gst: totals.calculated_material_cost_ex_gst,
      labour_hours: totals.labour_hours,
      labour_cost: totals.labour_hours,
      total_cabinet_cost_ex_gst: unitCost,
    },
  };
}

// Cabinet imports must use the full cut-list calculation. Flat doors/panels
// still use the quote editor's width x height x sqm-rate calculation below.
function withCalculatedUnitCost(line) {
  if (line.product_type === "base_cabinet" && line.cabinet_config) {
    return withCalculatedCabinetCost(line);
  }

  const width = Number(line.width_mm) || 0;
  const height = Number(line.height_mm) || 0;
  const rate = Number(line.unit_cost_per_sqm_ex_gst) || 0;
  const areaSqm = width > 0 && height > 0 ? (width * height) / 1000000 : 0;
  const calculated = rate > 0 && areaSqm > 0 ? roundMoney(areaSqm * rate) : 0;

  return {
    ...line,
    calculated_unit_cost_ex_gst: calculated,
    product_unit_cost_ex_gst:
      line.unit_cost_mode === "auto" && calculated > 0 ? calculated : line.product_unit_cost_ex_gst || 0,
  };
}

function designItemToLine(item) {
  const isCabinet = CABINET_TYPES.includes(item.item_type);
  const line = {
    product_type: isCabinet ? "base_cabinet" : item.item_type,
    product_name: item.label || item.item_type,
    width_mm: item.width_mm,
    height_mm: item.height_mm,
    qty: item.qty || 1,
    material: item.material,
    finish: item.finish,
    colour: item.colour,
    notes: item.notes,
    unit_cost_mode: item.unit_cost_mode || "auto",
  };

  if (isCabinet) {
    const shelfMaterial = item.shelf_material || item.material;
    const shelfFinish = item.shelf_finish || item.finish;
    const shelfColour = item.shelf_colour || item.colour;
    const shelfCost = Number(item.cost_per_sqm_shelf || 0) || Number(item.cost_per_sqm_carcass || 0) || 0;

    line.unit_cost_per_sqm_ex_gst = item.cost_per_sqm_carcass || 0;
    line.thickness = item.carcass_thickness_mm ? `${item.carcass_thickness_mm}mm` : "";
    line.cabinet_config = {
      label: item.label,
      width_mm: item.width_mm,
      height_mm: item.height_mm,
      depth_mm: item.depth_mm,
      carcass_material: item.material,
      carcass_finish: item.finish,
      carcass_colour: item.colour,
      carcass_thickness_mm: item.carcass_thickness_mm ?? 16,
      back_panel_included: item.back_panel_included ?? true,
      back_panel_material: item.material,
      back_panel_thickness_mm: item.back_panel_thickness_mm ?? 16,
      shelf_qty: item.shelf_qty ?? 0,
      shelf_material: shelfMaterial,
      shelf_finish: shelfFinish,
      shelf_colour: shelfColour,
      shelf_thickness_mm: item.shelf_thickness_mm ?? 16,
      shelf_heights_mm: item.shelf_heights_mm || [],
      mount_height_mm: item.mount_height_mm ?? null,
      cost_per_sqm_carcass: item.cost_per_sqm_carcass,
      cost_per_sqm_shelf: shelfCost,
      notes: item.notes,
    };
  } else {
    line.thickness = item.thickness;
    line.profile_type = item.profile_type;
    line.profile = item.profile;
    line.edge_mould = item.edge_mould;
    line.hinge_holes = item.hinge_holes;
    line.hinge_supply = item.hinge_supply;
    line.hinge_qty = item.hinge_qty;
    line.unit_cost_per_sqm_ex_gst = item.unit_cost_per_sqm_ex_gst || 0;
  }

  return line;
}

// Splits a cabinet's front into individual door panels using the same
// columns/rows/width_ratios math as the front elevation drawing, then
// groups identical-size doors (within this one cabinet) into a single count.
function computeDoorSizes(item) {
  const cfg = item.door_config || {};
  const cols = Math.max(1, cfg.columns || 1);
  const rows = Math.max(1, cfg.rows || 1);
  const rawRatios = Array.isArray(cfg.width_ratios) && cfg.width_ratios.length === cols
    ? cfg.width_ratios
    : Array(cols).fill(1 / cols);
  const totalRatio = rawRatios.reduce((sum, r) => sum + (Number(r) || 0), 0) || 1;
  const widthMm = Number(item.width_mm) || 0;
  const heightMm = Number(item.height_mm) || 0;
  const doorHeight = Math.round(heightMm / rows);

  const sizes = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ratio = (Number(rawRatios[c]) || 0) / totalRatio;
      const doorWidth = Math.round(widthMm * ratio);
      const key = `${doorWidth}x${doorHeight}`;
      const existing = sizes.get(key);
      if (existing) existing.qty += 1;
      else sizes.set(key, { width: doorWidth, height: doorHeight, qty: 1 });
    }
  }
  return Array.from(sizes.values());
}

// Doors are imported as standalone quote lines (not nested in cabinet_config),
// grouped per cabinet, one line per unique door size on that cabinet.
function doorLinesForCabinet(item, roomName) {
  if (item.front_type !== "doors") return [];

  const style = item.door_style || {};
  const traceLabel = [itemLabel(item), roomName].filter(Boolean).join(" — ");
  const sizes = computeDoorSizes(item);

  return sizes.map((size) => ({
    product_type: "door",
    product_name: "Door",
    description: traceLabel ? `Doors — ${traceLabel}` : "Doors",
    width_mm: size.width,
    height_mm: size.height,
    qty: size.qty,
    material: style.material || "",
    finish: style.finish || "",
    colour: style.colour || "",
    thickness: style.thickness_mm ? `${style.thickness_mm}mm` : "",
    profile_type: style.profile_type || "",
    profile: style.profile || "",
    edge_mould: style.edge_mould || "",
    unit_cost_per_sqm_ex_gst: style.cost_per_sqm || 0,
    unit_cost_mode: "auto",
  }));
}

function isCabinetUnconfigured(item) {
  if (!String(item.material || "").trim()) return true;
  if (item.front_type === "doors" && !String(item.door_style?.material || "").trim()) return true;
  return false;
}

function isStandaloneUnconfigured(item) {
  return !String(item.material || "").trim();
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { quote_id: quoteId, force } = await request.json();

    if (!quoteId) {
      return Response.json({ ok: false, error: "quote_id is required." }, { status: 422 });
    }

    // Verify both project and quote exist
    const [projectResult, quoteResult] = await Promise.all([
      context.supabase.from("pcd_design_projects").select("id, name").eq("id", projectId).single(),
      context.supabase.from("pcd_quotes").select("id").eq("id", quoteId).single(),
    ]);

    if (projectResult.error || !projectResult.data) {
      return Response.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    if (quoteResult.error || !quoteResult.data) {
      return Response.json({ ok: false, error: "Quote not found." }, { status: 404 });
    }

    // Load all items and rooms for this project, ordered for consistent sort order
    const [{ data: items, error: itemsError }, { data: rooms, error: roomsError }] = await Promise.all([
      context.supabase
        .from("pcd_design_items")
        .select("*")
        .eq("design_project_id", projectId)
        .order("room_id", { ascending: true })
        .order("sort_order", { ascending: true }),
      context.supabase.from("pcd_design_rooms").select("id, name").eq("design_project_id", projectId),
    ]);

    if (itemsError) throw itemsError;
    if (roomsError) throw roomsError;
    if (!items?.length) {
      return Response.json({ ok: false, error: "No items to import." }, { status: 422 });
    }

    const roomNameById = new Map((rooms || []).map((room) => [room.id, room.name]));

    if (!force) {
      const warnings = [];
      for (const item of items) {
        const isCabinet = CABINET_TYPES.includes(item.item_type);
        const unconfigured = isCabinet ? isCabinetUnconfigured(item) : isStandaloneUnconfigured(item);
        if (unconfigured) {
          const roomName = roomNameById.get(item.room_id);
          warnings.push({
            itemId: item.id,
            label: [itemLabel(item), roomName].filter(Boolean).join(" — "),
          });
        }
      }
      if (warnings.length) {
        return Response.json({ ok: true, needsConfirmation: true, warnings });
      }
    }

    // Get current max sort_order in the quote
    const { data: existingLines } = await context.supabase
      .from("pcd_quote_line_items")
      .select("sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: false })
      .limit(1);

    let sortOrder = (existingLines?.[0]?.sort_order ?? -1) + 1;

    const results = { created: 0, failed: 0, errors: [] };

    for (const item of items) {
      const isCabinet = CABINET_TYPES.includes(item.item_type);
      const lines = [designItemToLine(item)];
      if (isCabinet) {
        lines.push(...doorLinesForCabinet(item, roomNameById.get(item.room_id)));
      }

      for (const line of lines) {
        try {
          await saveQuoteLine(context.supabase, quoteId, withCalculatedUnitCost(line), { sortOrder });
          sortOrder += 1;
          results.created += 1;
        } catch (err) {
          results.failed += 1;
          results.errors.push(`Item "${item.label || item.id}": ${err?.message}`);
        }
      }
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Import failed." }, { status: 500 });
  }
}
