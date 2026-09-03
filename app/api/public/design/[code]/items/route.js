// PUBLIC design session — add an item. Guardrails: session scoped by code, the
// item_type must be in the consumer allowlist, a per-session item cap, and all
// cost/hardware fields are stripped (the public tool shows no prices). Reuses
// the shared buildItemRow so a public cabinet row is identical to an admin one.

import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import {resolvePublicProject,
  PUBLIC_ITEM_TYPES,
  MAX_ITEMS_PER_SESSION,
  stripForbiddenItemFields,
  canEditPublicProject,
  VIEW_ONLY_REFUSAL,
} from "../../../../../../lib/pcd-public-design";
import { applyMaterialDefaults, buildItemRow } from "../../../../../../lib/pcd-design-item-io";
import { resolveIkeaPreset } from "../../../../../../lib/pcd-ikea-presets";

export const dynamic = "force-dynamic";

async function getCode(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.code;
}

export async function POST(request, { params }) {
  try {
    const code = await getCode(params);
    const payload = await request.json();
    const supabase = createSupabaseAdminClient();

    const project = await resolvePublicProject(supabase, code);
    if (!project) return Response.json({ ok: false, error: "Design not found." }, { status: 404 });
    // A design we drafted and sent to be looked at is not theirs to change.
    // Checked HERE and not only in the client, because this route is reachable
    // with curl. See canEditPublicProject in lib/pcd-public-design.js.
    if (!canEditPublicProject(project)) {
      return Response.json({ ok: false, error: VIEW_ONLY_REFUSAL }, { status: 403 });
    }

    if (!PUBLIC_ITEM_TYPES.includes(payload?.item_type)) {
      return Response.json({ ok: false, error: "That item can't be added here." }, { status: 422 });
    }

    const { count } = await supabase
      .from("pcd_design_items")
      .select("id", { count: "exact", head: true })
      .eq("design_project_id", project.id);
    if ((count ?? 0) >= MAX_ITEMS_PER_SESSION) {
      return Response.json({ ok: false, error: `This design has reached the ${MAX_ITEMS_PER_SESSION}-item limit.` }, { status: 422 });
    }

    // Force the item onto the session's own room, ignore any client-sent
    // project/room ids, and drop cost/hardware fields.
    const { data: room } = await supabase
      .from("pcd_design_rooms").select("id").eq("design_project_id", project.id)
      .order("sort_order", { ascending: true }).limit(1).maybeSingle();

    const clean = stripForbiddenItemFields(payload);
    clean.room_id = room?.id || null;

    // A standard-size prop resolves its own box here rather than trusting the
    // sizes the browser sent, so "locked" means locked and not merely greyed
    // out on screen. An unknown ref is refused outright: it would otherwise
    // create an item that quietly drops out of the quote.
    if (clean.preset_ref) {
      const preset = resolveIkeaPreset(clean.preset_ref);
      if (!preset) {
        return Response.json({ ok: false, error: "That isn't a size we recognise." }, { status: 422 });
      }
      clean.item_type = preset.item_type;
      clean.width_mm = preset.width_mm;
      clean.height_mm = preset.height_mm;
      clean.depth_mm = preset.depth_mm;
      clean.label = preset.label;
    }

    const defaulted = applyMaterialDefaults(clean, project.material_defaults);

    const { data, error } = await supabase
      .from("pcd_design_items")
      .insert(buildItemRow(defaulted, project.id))
      .select("*")
      .single();
    if (error) throw error;

    return Response.json({ ok: true, item: data }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not add the item." }, { status: 500 });
  }
}
