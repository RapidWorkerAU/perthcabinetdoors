import { requireAdminApiContext } from "../../../../../lib/admin-api";

const allowedStatuses = new Set(["new", "reviewing", "waiting_on_customer", "converted_to_quote", "closed"]);

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id } = await Promise.resolve(params);
    const payload = await request.json();
    const update = {};
    if (allowedStatuses.has(payload.status)) update.status = payload.status;
    if (typeof payload.internal_notes === "string") update.internal_notes = payload.internal_notes;

    const { data, error } = await context.supabase
      .from("pcd_quote_requests")
      .update(update)
      .eq("id", id)
      .select("*, pcd_quote_request_line_items(*)")
      .single();
    if (error) throw error;
    return Response.json({ ok: true, quoteRequest: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update quote request." }, { status: 500 });
  }
}

