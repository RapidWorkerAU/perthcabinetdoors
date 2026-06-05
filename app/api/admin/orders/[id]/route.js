import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { describeChanges, logOrderActivity } from "../../../../../lib/pcd-activity-log";
import { ORDER_STATUSES } from "../../../../../lib/pcd-quote-utils";

async function orderIdFromParams(params) {
  const resolved = await params;
  return resolved?.id;
}

async function loadOrder(supabase, id) {
  const { data, error } = await supabase
    .from("pcd_orders")
    .select("*, pcd_order_line_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    throw error || new Error("Order not found.");
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("pcd_order_payments")
    .select("*")
    .eq("order_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (paymentsError) {
    data.pcd_order_payments = [];
  } else {
    data.pcd_order_payments = payments || [];
  }

  const { data: quoteRequests } = data.quote_id
    ? await supabase
        .from("pcd_quote_requests")
        .select("id")
        .eq("converted_quote_id", data.quote_id)
    : { data: [] };

  const quoteRequestIds = (quoteRequests || []).map((request) => request.id);
  const activityQueries = [
    supabase.from("pcd_order_activity").select("*").eq("order_id", id),
  ];

  if (data.quote_id) {
    activityQueries.push(supabase.from("pcd_order_activity").select("*").eq("quote_id", data.quote_id));
  }

  if (quoteRequestIds.length) {
    activityQueries.push(supabase.from("pcd_order_activity").select("*").in("quote_request_id", quoteRequestIds));
  }

  const activityResults = await Promise.all(activityQueries);
  const activityMap = new Map();
  activityResults.forEach((result) => {
    (result.data || []).forEach((activity) => activityMap.set(activity.id, activity));
  });
  data.pcd_order_activity = Array.from(activityMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return data;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    await context.supabase
      .from("pcd_orders")
      .update({ admin_viewed_at: new Date().toISOString() })
      .eq("id", id)
      .is("admin_viewed_at", null);

    const order = await loadOrder(context.supabase, id);
    return Response.json({ ok: true, order });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load order." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    const payload = await request.json();
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!ORDER_STATUSES.includes(payload.status)) {
        return Response.json({ ok: false, error: "Invalid order status." }, { status: 400 });
      }
      updates.status = payload.status;
    }

    [
      "name",
      "customer_name",
      "customer_email",
      "customer_phone",
      "site_address",
      "deposit_required",
      "deposit_amount",
      "deposit_paid",
      "deposit_paid_at",
      "target_completion_date",
      "customer_comms",
      "internal_notes",
    ].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates[field] = payload[field] === "" ? null : payload[field];
      }
    });

    if (!Object.keys(updates).length) {
      return Response.json({ ok: false, error: "No order updates supplied." }, { status: 400 });
    }

    const { data: beforeOrder } = await context.supabase
      .from("pcd_orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const { data, error } = await context.supabase
      .from("pcd_orders")
      .update(updates)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) throw error || new Error("Order not found.");

    const changes = describeChanges(beforeOrder || {}, updates, {
      customer_name: "Customer",
      customer_email: "Email",
      customer_phone: "Phone",
      site_address: "Site address",
      deposit_required: "Deposit required",
      deposit_amount: "Deposit amount",
      deposit_paid: "Deposit paid",
      deposit_paid_at: "Deposit paid at",
      target_completion_date: "Target completion",
      internal_notes: "Internal notes",
    });
    if (changes.length) {
      await logOrderActivity(context.supabase, {
        order_id: id,
        quote_id: beforeOrder?.quote_id || null,
        actor_type: "admin",
        action_type: "order_updated",
        title: "Order updated",
        description: changes.join("; "),
        metadata: { changes },
      });
    }

    const order = await loadOrder(context.supabase, id);
    return Response.json({ ok: true, order });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update order." }, { status: 500 });
  }
}
