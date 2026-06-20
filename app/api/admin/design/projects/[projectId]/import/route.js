import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { saveQuoteLine } from "../../../../quotes/[id]/_quote-line-save";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet"];

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
    // Quote line cost comes from the carcass cost
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
      back_panel_thickness_mm: item.back_panel_thickness_mm ?? 16,
      shelf_qty: item.shelf_qty ?? 0,
      shelf_material: item.shelf_material,
      shelf_finish: item.shelf_finish,
      shelf_colour: item.shelf_colour,
      shelf_thickness_mm: item.shelf_thickness_mm ?? 16,
      shelf_heights_mm: item.shelf_heights_mm || [],
      mount_height_mm: item.mount_height_mm ?? null,
      cost_per_sqm_carcass: item.cost_per_sqm_carcass,
      cost_per_sqm_shelf: item.cost_per_sqm_shelf,
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

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { quote_id: quoteId } = await request.json();

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

    // Load all items for this project, ordered for consistent sort order
    const { data: items, error: itemsError } = await context.supabase
      .from("pcd_design_items")
      .select("*")
      .eq("design_project_id", projectId)
      .order("room_id", { ascending: true })
      .order("sort_order", { ascending: true });

    if (itemsError) throw itemsError;
    if (!items?.length) {
      return Response.json({ ok: false, error: "No items to import." }, { status: 422 });
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
      try {
        const line = designItemToLine(item);
        await saveQuoteLine(context.supabase, quoteId, line, { sortOrder });
        sortOrder += 1;
        results.created += 1;
      } catch (err) {
        results.failed += 1;
        results.errors.push(`Item "${item.label || item.id}": ${err?.message}`);
      }
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Import failed." }, { status: 500 });
  }
}
