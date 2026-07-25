// PUBLIC design session — update (move / recolour / resize) or delete an item.
// Scoped by the session code AND the project id, so a session can only touch its
// own items. Cost/hardware fields are stripped before patching.

import { createSupabaseAdminClient } from "../../../../../../../lib/supabase/admin";
import { resolvePublicProject, stripForbiddenItemFields } from "../../../../../../../lib/pcd-public-design";
import { buildItemPatch } from "../../../../../../../lib/pcd-design-item-io";

export const dynamic = "force-dynamic";

async function getIds(params) {
  const resolved = await Promise.resolve(params);
  return { code: resolved?.code, itemId: resolved?.itemId };
}

export async function PATCH(request, { params }) {
  try {
    const { code, itemId } = await getIds(params);
    const payload = await request.json();
    const supabase = createSupabaseAdminClient();

    const project = await resolvePublicProject(supabase, code);
    if (!project) return Response.json({ ok: false, error: "Design not found." }, { status: 404 });

    const patch = buildItemPatch(stripForbiddenItemFields(payload));
    if (!Object.keys(patch).length) {
      return Response.json({ ok: false, error: "No fields to update." }, { status: 422 });
    }

    const { data, error } = await supabase
      .from("pcd_design_items")
      .update(patch)
      .eq("id", itemId)
      .eq("design_project_id", project.id)
      .select("*")
      .single();
    if (error) throw error;

    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update the item." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { code, itemId } = await getIds(params);
    const supabase = createSupabaseAdminClient();

    const project = await resolvePublicProject(supabase, code);
    if (!project) return Response.json({ ok: false, error: "Design not found." }, { status: 404 });

    const { error } = await supabase
      .from("pcd_design_items")
      .delete()
      .eq("id", itemId)
      .eq("design_project_id", project.id);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete the item." }, { status: 500 });
  }
}
