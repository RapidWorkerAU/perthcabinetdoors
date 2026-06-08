import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";

const PAYMENT_TYPES = new Set(["deposit", "progress", "final", "other"]);

async function orderIdFromParams(params) {
  const resolved = await params;
  return resolved?.id;
}

async function syncDepositFields(supabase, orderId) {
  const { data: deposits, error } = await supabase
    .from("pcd_order_payments")
    .select("amount,is_paid,paid_at")
    .eq("order_id", orderId)
    .eq("payment_type", "deposit");

  if (error) throw error;

  const depositRows = deposits || [];
  const depositRequired = depositRows.length > 0;
  const depositAmount = depositRows.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const depositPaid = depositRows.length > 0 && depositRows.every((payment) => payment.is_paid);
  const paidAt = depositPaid ? depositRows.find((payment) => payment.paid_at)?.paid_at || new Date().toISOString() : null;

  const { error: updateError } = await supabase
    .from("pcd_orders")
    .update({
      deposit_required: depositRequired,
      deposit_amount: depositAmount,
      deposit_paid: depositPaid,
      deposit_paid_at: paidAt,
    })
    .eq("id", orderId);

  if (updateError) throw updateError;
}

async function assertPaymentWithinOrderTotal(supabase, orderId, amount) {
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("pcd_orders").select("total_inc_gst").eq("id", orderId).maybeSingle(),
    supabase.from("pcd_order_payments").select("amount").eq("order_id", orderId),
  ]);
  const total = Number(order?.total_inc_gst || 0);
  const currentTotal = (payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  if (currentTotal + Number(amount || 0) > total + 0.001) {
    throw new Error(`Payment lines cannot exceed the order total. Remaining available amount is $${Math.max(total - currentTotal, 0).toFixed(2)}.`);
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    const payload = await request.json();
    const paymentType = PAYMENT_TYPES.has(payload.payment_type) ? payload.payment_type : "progress";
    const amount = Number(payload.amount || 0);

    if (amount < 0) {
      return Response.json({ ok: false, error: "Payment amount cannot be negative." }, { status: 400 });
    }
    await assertPaymentWithinOrderTotal(context.supabase, orderId, amount);

    const { count } = await context.supabase
      .from("pcd_order_payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);

    const { data, error } = await context.supabase
      .from("pcd_order_payments")
      .insert({
        order_id: orderId,
        payment_type: paymentType,
        amount,
        is_paid: !!payload.is_paid,
        paid_at: payload.is_paid ? payload.paid_at || new Date().toISOString().slice(0, 10) : null,
        notes: payload.notes || null,
        sort_order: count || 0,
      })
      .select("*")
      .single();

    if (error) throw error;
    await syncDepositFields(context.supabase, orderId);

    const { data: order } = await context.supabase
      .from("pcd_orders")
      .select("quote_id")
      .eq("id", orderId)
      .maybeSingle();

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: order?.quote_id || null,
      actor_type: "admin",
      action_type: "payment_added",
      title: "Payment line added",
      description: `${paymentType} - $${amount.toFixed(2)}${data.is_paid ? " - paid" : " - pending"}`,
      metadata: {
        payment_id: data.id,
        payment_type: paymentType,
        amount,
        is_paid: data.is_paid,
      },
    });

    return Response.json({ ok: true, payment: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not add payment." }, { status: 500 });
  }
}
