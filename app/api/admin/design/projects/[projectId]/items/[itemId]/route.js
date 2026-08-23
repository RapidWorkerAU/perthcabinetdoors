import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import {
  buildItemPatch,
  isMissingDesignColourSourceError,
  withoutDesignColourSource,
} from "../../../../../../../../lib/pcd-design-item-io";

async function getIds(params) {
  const resolved = await Promise.resolve(params);
  return { projectId: resolved?.projectId, itemId: resolved?.itemId };
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, itemId } = await getIds(params);
    const payload = await request.json();
    const patch = buildItemPatch(payload);

    if (!Object.keys(patch).length) {
      return Response.json({ ok: false, error: "No fields to update." }, { status: 422 });
    }

    const save = (row) =>
      context.supabase
        .from("pcd_design_items")
        .update(row)
        .eq("id", itemId)
        .eq("design_project_id", projectId)
        .select("*")
        .single();

    let { data, error } = await save(patch);
    // The columns recording WHICH library row a carcass colour came from are
    // added by a migration. Until it has been run they are not there, and a
    // design tool that refuses to save a colour change because of that is worse
    // than one that saves the colour and matches it back by name.
    if (error && isMissingDesignColourSourceError(error)) {
      ({ data, error } = await save(withoutDesignColourSource(patch)));
    }

    if (error) throw error;
    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update item." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, itemId } = await getIds(params);
    const { error } = await context.supabase
      .from("pcd_design_items")
      .delete()
      .eq("id", itemId)
      .eq("design_project_id", projectId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete item." }, { status: 500 });
  }
}
