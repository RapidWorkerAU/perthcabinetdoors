// PUBLIC (no-login) design planner — create a new anonymous session.
// POST with no body (or an optional room size) → a fresh pcd_design_projects row
// flagged is_public with an unguessable access_code, plus one starter room.
// Returns the code + project + room so the browser can persist the code and
// load the planner. No auth: the session IS the code.

import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { generateSessionCode, clampRoom } from "../../../../lib/pcd-public-design";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const supabase = createSupabaseAdminClient();

    const code = generateSessionCode();
    const { data: project, error: projectError } = await supabase
      .from("pcd_design_projects")
      .insert({ name: "My kitchen design", status: "draft", is_public: true, access_code: code })
      .select("*")
      .single();
    if (projectError) throw projectError;

    const room = clampRoom(body?.room || {});
    const { data: roomRow, error: roomError } = await supabase
      .from("pcd_design_rooms")
      .insert({ design_project_id: project.id, name: "Kitchen", sort_order: 0, ...room })
      .select("*")
      .single();
    if (roomError) throw roomError;

    return Response.json({ ok: true, code, project, room: roomRow, items: [] }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not start a design." }, { status: 500 });
  }
}
