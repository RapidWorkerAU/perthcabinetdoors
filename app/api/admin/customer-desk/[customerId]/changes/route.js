import { requireAdminApiContext } from "@/lib/admin-api";

// Resolving a detail that arrived and disagreed with the customer record.
//
// Nothing was overwritten when it arrived, and nothing is overwritten here
// either unless somebody says so. "Keep" applies the new value; "dismiss"
// leaves the record alone. Both close the question so it stops being asked.

export const dynamic = "force-dynamic";

async function customerIdFrom(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.customerId;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const customerId = await customerIdFrom(params);
  const body = await request.json().catch(() => ({}));
  const apply = body.action === "apply";
  const ids = Array.isArray(body.ids) ? body.ids : [body.id].filter(Boolean);
  if (!ids.length) return Response.json({ ok: false, error: "Which change?" }, { status: 422 });

  try {
    const { data: changes } = await context.supabase
      .from("pcd_pending_customer_changes")
      .select("*")
      .eq("customer_id", customerId)
      .eq("status", "pending")
      .in("id", ids);

    if (!changes?.length) return Response.json({ ok: false, error: "That change has already been dealt with." }, { status: 404 });

    if (apply) {
      const patch = { updated_at: new Date().toISOString() };
      for (const change of changes) patch[change.field] = change.proposed_value;
      const { error } = await context.supabase.from("pcd_customers").update(patch).eq("id", customerId);
      if (error) throw error;
    }

    const { data: agent } = await context.supabase
      .from("pcd_agents")
      .select("id")
      .ilike("login_email", context.user?.email || "")
      .maybeSingle();

    await context.supabase
      .from("pcd_pending_customer_changes")
      .update({
        status: apply ? "applied" : "dismissed",
        resolved_at: new Date().toISOString(),
        resolved_by: agent?.id || null,
      })
      .in("id", changes.map((change) => change.id));

    const { data: customer } = await context.supabase.from("pcd_customers").select("*").eq("id", customerId).maybeSingle();
    const { data: remaining } = await context.supabase
      .from("pcd_pending_customer_changes")
      .select("*")
      .eq("customer_id", customerId)
      .eq("status", "pending");

    return Response.json({ ok: true, applied: apply, customer, pendingChanges: remaining || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not resolve that change." }, { status: 500 });
  }
}
