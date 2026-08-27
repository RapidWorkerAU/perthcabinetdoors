import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import {
  issueKindLabel,
  issueBlocksLabel,
  validateIssue,
} from "../../../../../../lib/pcd-order-issues";
import { loadListItems } from "../../../../../../lib/pcd-list-load";

async function orderIdFromParams(params) {
  const resolved = await params;
  return resolved?.id;
}

// Who is writing. One agent row exists today, matched on the signed in email,
// so a reply and an issue are attributed the same way.
async function agentIdFor(supabase, email) {
  if (!email) return null;
  const { data } = await supabase
    .from("pcd_agents")
    .select("id")
    .ilike("login_email", email)
    .maybeSingle();
  return data?.id || null;
}

export async function GET(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_order_issues")
      .select("*")
      .eq("order_id", id)
      .order("raised_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, issues: data || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load issues." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    const payload = await request.json();

    // The same rules the form uses, checked again here. A browser check is a
    // suggestion.
    //
    // Kinds can be added in Settings, Lists, so the check here has to read the
    // live list. Without it the dropdown offers a kind that this route then
    // refuses, and the Save button appears to do nothing.
    const kinds = await loadListItems(context.supabase, "issue_kinds");
    const errors = validateIssue(payload, kinds);
    if (Object.keys(errors).length) {
      return Response.json({ ok: false, error: "That issue is not complete.", fieldErrors: errors }, { status: 422 });
    }

    // An issue can be against the whole order rather than one panel: a
    // complaint after delivery has no panel to hang off. line_item_id is
    // nullable for exactly that.
    let line = null;
    if (payload.line_item_id) {
      // Read here rather than trusted from the browser, so the recorded
      // progress is what the database actually says it was.
      const { data: found } = await context.supabase
        .from("pcd_order_line_items")
        .select("id, order_id, title, description")
        .eq("id", payload.line_item_id)
        .eq("order_id", id)
        .maybeSingle();
      if (!found) {
        return Response.json({ ok: false, error: "That panel is not on this order." }, { status: 404 });
      }
      line = found;
    }

    const row = {
      order_id: id,
      line_item_id: line ? line.id : null,
      panel_key: payload.panel_key || null,
      // Recorded rather than derived. Working the name out later means
      // rebuilding the cut list, and it would be lost entirely if the line
      // were ever removed.
      panel_label: payload.panel_label || null,
      kind: payload.kind,
      detail: String(payload.detail).trim(),
      // Copied, never moved. The panel's own stage is not touched by any of this.
      stage_at_report: payload.stage_at_report || null,
      progress_kind: payload.progress_kind === "Status" ? "Status" : "Stage",
      owner: payload.owner || "us",
      blocks: payload.blocks || "panel",
      extra_cost_ex_gst: Number(payload.extra_cost_ex_gst) || 0,
      raised_by: await agentIdFor(context.supabase, context.user?.email),
    };

    const { data: issue, error } = await context.supabase
      .from("pcd_order_issues")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;

    const where = row.stage_at_report ? `, at ${row.stage_at_report}` : "";
    await logOrderActivity(context.supabase, {
      order_id: id,
      actor_type: "admin",
      action_type: "issue_raised",
      title: "Issue raised",
      description: `${issueKindLabel(row.kind, kinds)} on ${payload.panel_label || (line && line.title) || "the order"}${where}. ${issueBlocksLabel(row.blocks)}.`,
      metadata: { issue_id: issue.id, kind: row.kind, blocks: row.blocks, extra_cost_ex_gst: row.extra_cost_ex_gst },
    });

    return Response.json({ ok: true, issue });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not raise the issue." }, { status: 500 });
  }
}
