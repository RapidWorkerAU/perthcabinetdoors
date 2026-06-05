import { requireAdminApiContext } from "../../../../../../../lib/admin-api";

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

    const { data, error } = await context.supabase
      .from("pcd_order_payments")
      .update(updates)
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .select("*")
      .maybeSingle();

    if (error || !data) throw error || new Error("Payment not found.");
    await syncDepositFields(context.supabase, orderId);

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
    const { error } = await context.supabase
      .from("pcd_order_payments")
      .delete()
      .eq("id", paymentId)
      .eq("order_id", orderId);

    if (error) throw error;
    await syncDepositFields(context.supabase, orderId);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete payment." }, { status: 500 });
  }
}
