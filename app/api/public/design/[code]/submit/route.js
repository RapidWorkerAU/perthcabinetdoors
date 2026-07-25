// PUBLIC design planner — "Send my design to PCD". Turns the anonymous session's
// design into a QUOTE REQUEST (source 'design_tool') with the customer's contact
// details and a per-item summary, linked back to the saved design so staff can
// open it and build the real quote. Reuses the shared quote-request insert +
// emails, so a design lead lands in the same admin queue as the website form.

import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { resolvePublicProject } from "../../../../../../lib/pcd-public-design";
import { insertQuoteRequest, sendQuoteRequestEmails } from "../../../../../../lib/pcd-quote-request";

export const dynamic = "force-dynamic";

const TYPE_LABEL = {
  base_cabinet: "Base cabinet",
  wall_cabinet: "Wall cabinet",
  tall_cabinet: "Tall cabinet",
  corner_base_cabinet: "Corner cabinet",
  floating_shelf: "Floating shelf",
};

function frontSummary(item) {
  if (item.item_type === "floating_shelf") return "Open shelf";
  const ft = item.front_type;
  if (ft === "mixed") {
    const secs = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
    return `Bays: ${secs.map((s) => (s.type === "appliance" ? "oven" : s.type || "doors")).join(", ") || "—"}`;
  }
  if (ft === "drawers") return `${(item.drawer_config?.heights_mm || []).length || 1} drawers`;
  if (ft === "none") return `Open, ${Number(item.shelf_qty) || 0} shelves`;
  return `${item.door_config?.columns || 1} door${(item.door_config?.columns || 1) > 1 ? "s" : ""}`;
}

function itemToLine(item) {
  const front = item.front_type === "drawers" ? item.drawer_style : item.door_style;
  const c = front || {};
  return {
    productType: TYPE_LABEL[item.item_type] || "Cabinet",
    productName: item.label || TYPE_LABEL[item.item_type] || "Cabinet",
    material: c.material || item.material || "",
    finish: c.finish || item.finish || "",
    colour: c.colour || item.colour || "",
    width: Number(item.width_mm) || undefined,
    height: Number(item.height_mm) || undefined,
    qty: Number(item.qty) || 1,
    notes: frontSummary(item),
  };
}

async function getCode(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.code;
}

export async function POST(request, { params }) {
  try {
    const code = await getCode(params);
    const body = await request.json();
    const supabase = createSupabaseAdminClient();

    const project = await resolvePublicProject(supabase, code);
    if (!project) return Response.json({ ok: false, error: "Design not found." }, { status: 404 });

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const phone = String(body?.phone || "").trim();
    if (!name) return Response.json({ ok: false, error: "Please enter your name." }, { status: 422 });
    if (!email && !phone) return Response.json({ ok: false, error: "Please enter an email or phone number so we can reach you." }, { status: 422 });

    const [{ data: rooms }, { data: items }] = await Promise.all([
      supabase.from("pcd_design_rooms").select("*").eq("design_project_id", project.id),
      supabase.from("pcd_design_items").select("*").eq("design_project_id", project.id).order("sort_order", { ascending: true }),
    ]);

    const cabinetItems = (items || []).filter((i) => TYPE_LABEL[i.item_type]);
    const lines = cabinetItems.map(itemToLine);
    const room = (rooms || [])[0];
    const roomText = room ? `Room ${room.width_mm || "?"}×${room.depth_mm || "?"}×${room.height_mm || "?"}mm. ` : "";
    const summary = `${roomText}${cabinetItems.length} item${cabinetItems.length === 1 ? "" : "s"} designed in the website planner.`;
    const notes = [summary, String(body?.notes || "").trim()].filter(Boolean).join("\n\n");

    const payload = {
      source: "design_tool",
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      deliverySuburb: String(body?.suburb || "").trim(),
      notes,
      lines,
      designProjectId: project.id,
      productName: "Website kitchen design",
    };

    const requestRow = await insertQuoteRequest(supabase, payload);
    // Flag the design as submitted so staff can tell it's been sent in.
    await supabase.from("pcd_design_projects").update({ status: "submitted" }).eq("id", project.id);
    try { await sendQuoteRequestEmails(payload); } catch { /* the request is saved; email is best-effort */ }

    return Response.json({ ok: true, id: requestRow.id });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send your design." }, { status: 500 });
  }
}
