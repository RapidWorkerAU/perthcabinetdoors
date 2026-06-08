import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { describeChanges, logOrderActivity } from "../../../../../../../lib/pcd-activity-log";

const PAYMENT_TYPES = new Set(["deposit", "progress", "final", "other"]);

async function idsFromParams(params) {
  const resolved = await params;
  return { orderId: resolved?.id, paymentId: resolved?.paymentId };
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

async function assertPaymentWithinOrderTotal(supabase, orderId, paymentId, amount) {
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("pcd_orders").select("total_inc_gst").eq("id", orderId).maybeSingle(),
    supabase.from("pcd_order_payments").select("id,amount").eq("order_id", orderId),
  ]);
  const total = Number(order?.total_inc_gst || 0);
  const otherTotal = (payments || [])
    .filter((payment) => payment.id !== paymentId)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  if (otherTotal + Number(amount || 0) > total + 0.001) {
    throw new Error(`Payment lines cannot exceed the order total. Remaining available amount is $${Math.max(total - otherTotal, 0).toFixed(2)}.`);
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, paymentId } = await idsFromParams(params);
    const payload = await request.json();
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(payload, "payment_type")) {
      if (!PAYMENT_TYPES.has(payload.payment_type)) {
        return Response.json({ ok: false, error: "Invalid payment type." }, { status: 400 });
      }
      updates.payment_type = payload.payment_type;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "amount")) {
      const amount = Number(payload.amount || 0);
      if (amount < 0) {
        return Response.json({ ok: false, error: "Payment amount cannot be negative." }, { status: 400 });
      }
      await assertPaymentWithinOrderTotal(context.supabase, orderId, paymentId, amount);
      updates.amount = amount;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "is_paid")) {
      updates.is_paid = !!payload.is_paid;
      if (!updates.is_paid) updates.paid_at = null;
      if (updates.is_paid && !Object.prototype.hasOwnProperty.call(payload, "paid_at")) {
        updates.paid_at = new Date().toISOString().slice(0, 10);
      }
    }

    ["paid_at", "notes"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates[field] = payload[field] === "" ? null : payload[field];
      }
    });

    if (!Object.keys(updates).length) {
      return Response.json({ ok: false, error: "No payment updates supplied." }, { status: 400 });
    }

    const { data: beforePayment } = await context.supabase
      .from("pcd_order_payments")
      .select("*, pcd_orders(quote_id)")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();

    const { data, error } = await context.supabase
      .from("pcd_order_payments")
      .update(updates)
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .select("*")
      .maybeSingle();

    if (error || !data) throw error || new Error("Payment not found.");
    await syncDepositFields(context.supabase, orderId);

    const changes = describeChanges(beforePayment || {}, updates, {
      payment_type: "Payment type",
      is_paid: "Paid",
      paid_at: "Date paid",
    });
    if (changes.length) {
      await logOrderActivity(context.supabase, {
        order_id: orderId,
        quote_id: beforePayment?.pcd_orders?.quote_id || null,
        actor_type: "admin",
        action_type: "payment_updated",
        title: "Payment line updated",
        description: changes.join("; "),
        metadata: {
          payment_id: paymentId,
          changes,
        },
      });
    }

    return Response.json({ ok: true, payment: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update payment." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, paymentId } = await idsFromParams(params);
    const { data: beforePayment } = await context.supabase
      .from("pcd_order_payments")
      .select("*, pcd_orders(quote_id)")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();

    const { error } = await context.supabase
      .from("pcd_order_payments")
      .delete()
      .eq("id", paymentId)
      .eq("order_id", orderId);

    if (error) throw error;
    await syncDepositFields(context.supabase, orderId);

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: beforePayment?.pcd_orders?.quote_id || null,
      actor_type: "admin",
      action_type: "payment_deleted",
      title: "Payment line deleted",
      description: beforePayment
        ? `${beforePayment.payment_type || "payment"} - $${Number(beforePayment.amount || 0).toFixed(2)}`
        : null,
      metadata: {
        payment_id: paymentId,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete payment." }, { status: 500 });
  }
}
