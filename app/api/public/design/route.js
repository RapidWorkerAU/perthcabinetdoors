// PUBLIC (no-login) design planner — create a new anonymous session.
// POST with the visitor's name for the design (and optionally a room size) → a
// fresh pcd_design_projects row flagged is_public with an unguessable
// access_code, plus one starter room. Returns the code + project + room so the
// browser can persist the code and load the planner. No auth: the session IS
// the code.
//
// THE NAME IS ASKED FOR BEFORE ANY OF THIS RUNS. The planner shows one field
// and creates nothing until it is answered, so a design is named from the
// moment it exists rather than being called "My design" until somebody thinks
// to change it, which nobody ever did. Somebody who opens the planner and
// leaves without naming anything now leaves no row behind at all.
//
// The fallback is still here because this route can be called directly, and a
// row with no name at all would be worse than one called "Untitled design".

import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { generateSessionCode, clampRoom } from "../../../../lib/pcd-public-design";
import { designNameOrFallback } from "../../../../lib/pcd-design-name";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const supabase = createSupabaseAdminClient();

    const code = generateSessionCode();
    const { data: project, error: projectError } = await supabase
      .from("pcd_design_projects")
      .insert({ name: designNameOrFallback(body?.name), status: "draft", is_public: true, access_code: code })
      .select("*")
      .single();
    if (projectError) throw projectError;

    const room = clampRoom(body?.room || {});
    const { data: roomRow, error: roomError } = await supabase
      .from("pcd_design_rooms")
      .insert({ design_project_id: project.id, name: "Room", sort_order: 0, ...room })
      .select("*")
      .single();
    if (roomError) throw roomError;

    return Response.json({ ok: true, code, project, room: roomRow, items: [] }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not start a design." }, { status: 500 });
  }
}
