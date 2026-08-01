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
  bookcase: "Bookcase",
  shelf_rail: "Shelf & rail",
  panel: "Panel",
};

// Placed to show what's already in the room — a fridge space, a window, a
// doorway. Nothing is manufactured, so they're deliberately NOT quote lines.
// They ride in the summary instead, where they're what stops us quoting a run
// straight through a window.
const ROOM_REFERENCE_LABEL = {
  appliance: "appliance",
  window: "window",
  door_opening: "doorway",
};

function roomReferenceSummary(items) {
  const notes = [];
  for (const item of items || []) {
    if (!ROOM_REFERENCE_LABEL[item.item_type]) continue;
    const w = Number(item.width_mm) || 0;
    const h = Number(item.height_mm) || 0;
    const size = w && h ? ` ${w}×${h}mm` : "";
    if (item.item_type === "appliance") {
      const kind = String(item.appliance_kind || "appliance").replace(/_/g, " ");
      notes.push(`${kind} space${size}`);
    } else if (item.item_type === "window") {
      const sill = Number(item.mount_height_mm) || 0;
      notes.push(`window${size}${sill ? `, sill ${sill}mm` : ""}`);
    } else {
      notes.push(`doorway${size}`);
    }
  }
  return notes.length ? `Room: ${notes.join("; ")}.` : "";
}

function frontSummary(item) {
  if (item.item_type === "floating_shelf") return "Open shelf";
  if (item.item_type === "panel") {
    const mount = Number(item.mount_height_mm) || 0;
    const t = Number(item.panel_thickness_mm) || Number(item.width_mm) || 0;
    return ["Standalone panel", t ? `${t}mm` : "", mount ? `${mount}mm off the floor` : ""].filter(Boolean).join(" · ");
  }
  // The line's width/height are the SHELF board, so the span, depth and the
  // height it hangs at would otherwise be lost — and those are the three things
  // that decide whether this shelf needs a mid support when we cost it.
  if (item.item_type === "shelf_rail") {
    const cfg = item.shelf_rail_config || {};
    const rail = cfg.front_rail?.on === false ? "no front rail" : "front rail";
    const top = Number(item.mount_height_mm || 0) + Number(item.height_mm || 0);
    return [
      `Shelf & rail — ${Number(item.width_mm) || 0}mm span`,
      `${Number(item.depth_mm) || 0}mm deep`,
      top ? `top of shelf ${top}mm off the floor` : "",
      rail,
    ].filter(Boolean).join(" · ");
  }
  const ft = item.front_type;
  // The line carries ONE colour (the carcass / front), so a bookcase's second
  // finish would otherwise never reach the quote request — the shelf colour is
  // the whole reason a customer picks a bookcase, so it goes in the note.
  if (item.item_type === "bookcase") {
    const shelfColour = [item.shelf_colour, item.shelf_finish].filter(Boolean).join(" ");
    const depth = Number(item.depth_mm) || 0;
    return [
      `Bookcase, ${Number(item.shelf_qty) || 0} shelves`,
      depth ? `${depth}mm deep` : "",
      "solid back",
      shelfColour ? `shelves in ${shelfColour}` : "",
      item.has_kickboard ? "kickboard" : "",
    ].filter(Boolean).join(" · ");
  }
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
  // A standalone panel keeps its finished face width in depth_mm (width_mm is
  // its on-edge thickness), so it's the one type whose width comes from there.
  const isPanel = item.item_type === "panel";
  return {
    productType: TYPE_LABEL[item.item_type] || "Cabinet",
    productName: item.label || TYPE_LABEL[item.item_type] || "Cabinet",
    material: c.material || item.material || "",
    finish: c.finish || item.finish || "",
    colour: c.colour || item.colour || "",
    width: Number(isPanel ? item.depth_mm : item.width_mm) || undefined,
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
    // Fridge spaces, windows and doorways aren't quote lines, but they're the
    // reason a run stops where it does — so they go in the notes.
    const roomRefs = roomReferenceSummary(items);
    const notes = [summary, roomRefs, String(body?.notes || "").trim()].filter(Boolean).join("\n\n");

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
