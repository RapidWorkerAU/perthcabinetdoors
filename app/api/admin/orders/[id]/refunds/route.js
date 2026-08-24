import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { refundProblem, refundRowFromInput } from "../../../../../../lib/pcd-refunds";

// Raising a refund line.
//
// TWO STEPS, THE SAME AS A PAYMENT. This adds the line and nothing else: no
// money moves and the customer is told nothing. Processing it is a second,
// deliberate act, which is what makes it possible to check the amount against
// the job before anybody's card is touched. See the process route beside this.
//
// The rules it enforces are the same ones the form shows, out of the same
// function, so a refund the form allowed can never be one this refuses.

async function orderIdFromParams(params) {
  const resolved = await params;
  return resolved?.id;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    const payload = await request.json();

    const { data: payments, error: readError } = await context.supabase
      .from("pcd_order_payments")
      .select("*")
      .eq("order_id", orderId);
    if (readError) throw readError;

    const against = payload.refund_of_payment_id
      ? (payments || []).find((row) => row.id === payload.refund_of_payment_id) || null
      : null;
    if (payload.refund_of_payment_id && !against) {
      return Response.json({ ok: false, error: "That payment is not on this order." }, { status: 400 });
    }

    const problem = refundProblem(payload, { payment: against, allPayments: payments || [] });
    if (problem) return Response.json({ ok: false, error: problem }, { status: 400 });

    const { count } = await context.supabase
      .from("pcd_order_payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);

    const { data, error } = await context.supabase
      .from("pcd_order_payments")
      .insert({ ...refundRowFromInput(payload, orderId), sort_order: count || 0 })
      .select("*")
      .single();
    if (error) throw error;


    await logOrderActivity(context.supabase, {
      order_id: orderId,
      actor_type: "admin",
      action_type: "refund_raised",
      title: "Refund raised",
      description: `${money(data.amount)}${data.refund_reason ? ` - ${data.refund_reason}` : ""}`,
      metadata: { payment_id: data.id, refund_of_payment_id: data.refund_of_payment_id, refund_method: data.refund_method },
    });

    return Response.json({ ok: true, payment: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not raise the refund." }, { status: 500 });
  }
}

function money(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(Number(value || 0)));
}
