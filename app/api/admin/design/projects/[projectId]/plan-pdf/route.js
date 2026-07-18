import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { generateDesignPlanPdf } from "../../../../../../../lib/pcd-design-plan-pdf";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

function cleanFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

// The client rasterises the on-screen plan / elevation / 3D views (so the
// chosen colour mode comes through exactly) and POSTs them here as data URLs
// alongside the palette rows; the server loads the project + room + items and
// assembles the branded PDF. Loading server-side keeps the schedule honest —
// it reflects the saved cabinets, not whatever the client claims.
export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const body = await request.json().catch(() => ({}));
    const { rooms: roomInputs, roomId, captures = {}, palette = [], options = {} } = body || {};

    // Normalise to a list of { roomId, captures, palette } — accepting the new
    // multi-room payload as well as the original single-room one.
    const inputs = Array.isArray(roomInputs) && roomInputs.length
      ? roomInputs
      : (roomId ? [{ roomId, captures, palette }] : []);
    if (!inputs.length) {
      return Response.json({ ok: false, error: "At least one room is required." }, { status: 422 });
    }

    const { data: project, error: projectError } = await context.supabase
      .from("pcd_design_projects").select("*").eq("id", projectId).single();
    if (projectError) throw projectError;

    // Items are loaded server-side per room (not trusted from the client) so
    // the schedule always reflects the saved cabinets.
    const roomsForPdf = [];
    for (const input of inputs) {
      if (!input?.roomId) continue;
      const [{ data: room, error: roomError }, { data: items, error: itemsError }] = await Promise.all([
        context.supabase.from("pcd_design_rooms").select("*").eq("id", input.roomId).single(),
        context.supabase
          .from("pcd_design_items")
          .select("*")
          .eq("design_project_id", projectId)
          .eq("room_id", input.roomId)
          .order("sort_order", { ascending: true }),
      ]);
      if (roomError) throw roomError;
      if (itemsError) throw itemsError;
      roomsForPdf.push({
        room: room || {},
        items: items || [],
        captures: input.captures || {},
        palette: input.palette || [],
      });
    }
    if (!roomsForPdf.length) {
      return Response.json({ ok: false, error: "No rooms found to export." }, { status: 404 });
    }

    const pdfBuffer = generateDesignPlanPdf({ project: project || {}, rooms: roomsForPdf, options });

    const fileName = `design-plan-${cleanFilePart(project?.name || roomsForPdf[0]?.room?.name, "design")}.pdf`;
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not generate design plan PDF." },
      { status: 500 }
    );
  }
}
