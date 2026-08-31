// PUBLIC design session — load everything, or update the room size / name.
// Every query is scoped by the session code via resolvePublicProject; a bad or
// admin code 404s. No auth beyond holding the code.

import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { resolvePublicProject, clampRoom } from "../../../../../lib/pcd-public-design";
import { cleanDesignName, isUsableDesignName } from "../../../../../lib/pcd-design-name";

export const dynamic = "force-dynamic";

async function getCode(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.code;
}

export async function GET(_request, { params }) {
  try {
    const code = await getCode(params);
    const supabase = createSupabaseAdminClient();
    const project = await resolvePublicProject(supabase, code);
    if (!project) return Response.json({ ok: false, error: "Design not found." }, { status: 404 });

    const [{ data: rooms }, { data: items }] = await Promise.all([
      supabase.from("pcd_design_rooms").select("*").eq("design_project_id", project.id).order("sort_order", { ascending: true }),
      supabase.from("pcd_design_items").select("*").eq("design_project_id", project.id).order("sort_order", { ascending: true }),
    ]);

    return Response.json({ ok: true, code, project, rooms: rooms || [], items: items || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load the design." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const code = await getCode(params);
    const body = await request.json();
    const supabase = createSupabaseAdminClient();
    const project = await resolvePublicProject(supabase, code);
    if (!project) return Response.json({ ok: false, error: "Design not found." }, { status: 404 });

    // Rename the design. The same cleaning as creating one, so a design cannot
    // be renamed into something the create route would have refused. A name too
    // short to be one is ignored rather than saved, which leaves the design
    // called whatever it was rather than blanking it.
    if (typeof body?.name === "string") {
      if (isUsableDesignName(body.name)) {
        await supabase.from("pcd_design_projects").update({ name: cleanDesignName(body.name) }).eq("id", project.id);
      } else if (body.name.trim()) {
        return Response.json({ ok: false, error: "Please give the design a longer name." }, { status: 422 });
      }
    }

    // Update the (single) room's size — clamped to sane limits.
    if (body?.room) {
      const size = clampRoom(body.room);
      await supabase.from("pcd_design_rooms").update(size).eq("design_project_id", project.id);
    }

    const [{ data: rooms }, { data: projectRow }] = await Promise.all([
      supabase.from("pcd_design_rooms").select("*").eq("design_project_id", project.id).order("sort_order", { ascending: true }),
      supabase.from("pcd_design_projects").select("*").eq("id", project.id).single(),
    ]);

    return Response.json({ ok: true, project: projectRow, rooms: rooms || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update the design." }, { status: 500 });
  }
}
