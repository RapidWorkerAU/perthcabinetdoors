// MARK A PAYMENT AS RECEIVED WHEN IT DID NOT COME THROUGH THE LINK.
//
// A link goes out, it does not work for the customer, they transfer the money
// instead. Before this, the payment could never be closed: sending a request
// locked is_paid, so the money sat in the bank while the system insisted it was
// still owing, on the order, in the financials and on every chase list.
//
// Its own route rather than a field on the payment PATCH, because settling has
// consequences the PATCH does not: it closes the outstanding request so the same
// money cannot be taken twice, and it records HOW the money arrived. A payment
// marked paid with nothing behind it is what the locking was protecting against.
//
// The AMOUNT stays locked. Editing what was asked for after a link went out for
// a different figure is a real fault and this does not open that door.

import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { syncDepositFields } from "../../../../../../../../lib/pcd-order-deposit";
import { settlementMethodLabel, settlementPatch, undoSettlementPatch } from "../../../../../../../../lib/pcd-payment-settlement";
import { expireCheckoutSession } from "../../../../../../../../lib/pcd-stripe";

async function idsFromParams(params) {
  const resolved = await Promise.resolve(params);
  return { orderId: resolved?.id, paymentId: resolved?.paymentId };
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, paymentId } = await idsFromParams(params);
    const payload = await request.json().catch(() => ({}));

    const { data: payment, error } = await context.supabase
      .from("pcd_order_payments")
      .select("*")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!payment) return Response.json({ ok: false, error: "Payment not found." }, { status: 404 });

    const { updates, trail, error: refusal } = settlementPatch(payment, {
      method: payload.method,
      reference: payload.reference,
      paidAt: payload.paid_at,
      note: payload.note,
    });
    if (refusal) return Response.json({ ok: false, error: refusal }, { status: 400 });

    // Conditional on it still being unpaid, so two people closing the same
    // payment at once cannot both succeed and record two settlements.
    let { data: settled, error: updateError } = await context.supabase
      .from("pcd_order_payments")
      .update(updates)
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .eq("is_paid", false)
      .select("*")
      .maybeSingle();

    // The two settlement columns arrive with 202608221800. Without them the
    // payment still has to be closable: money in the bank showing as owing is a
    // worse state than a settlement whose method was not filed.
    if (updateError && String(updateError.message || "").includes("settlement_")) {
      const { settlement_method: _method, settlement_reference: _reference, ...rest } = updates;
      ({ data: settled, error: updateError } = await context.supabase
        .from("pcd_order_payments")
        .update(rest)
        .eq("id", paymentId)
        .eq("order_id", orderId)
        .eq("is_paid", false)
        .select("*")
        .maybeSingle());
      console.error(
        "[payment-settle] pcd_order_payments.settlement_method is missing, so this payment was closed without " +
          "recording how it arrived. The method is in the notes. Run " +
          "supabase/202608221800_pcd_payment_settled_outside.sql."
      );
    }
    if (updateError) throw updateError;
    if (!settled) {
      return Response.json(
        { ok: false, error: "This payment was marked as paid while you had it open. Reload to see where it is up to." },
        { status: 409 }
      );
    }

    // KILL THE LINK, not just the flag.
    //
    // Marking the payment received in our database does nothing to the session
    // Stripe is hosting. The customer still has the email, the link still opens,
    // and it still takes money. Our books would show one payment, because the
    // webhook ignores an already-paid row, and the customer would be out twice
    // over with nothing here saying so.
    //
    // Done AFTER the payment is closed, deliberately. If expiring fails we have
    // still recorded the money that arrived; doing it first would risk killing a
    // live link and then failing to record why.
    const linkClosure = await expireCheckoutSession(payment.stripe_checkout_session_id);
    if (payment.stripe_checkout_session_id && !linkClosure.expired && !linkClosure.alreadyClosed) {
      console.error(
        "[payment-settle] the Stripe checkout session for payment " + paymentId + " could not be expired, so the " +
          "link the customer holds may still take money: " + (linkClosure.error || "no reason given")
      );
    }

    // A deposit being settled changes whether the order is confirmed work, so
    // the order's own deposit fields follow. Exactly as the payment PATCH does
    // it, through the same helper, which reads and writes for itself.
    await syncDepositFields(context.supabase, orderId);

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      actor_type: "admin",
      action_type: "payment_settled_outside_link",
      title: "Payment received outside the payment link",
      description: trail,
      metadata: {
        payment_id: paymentId,
        amount: Number(payment.amount || 0),
        method: payload.method,
        method_label: settlementMethodLabel(payload.method),
        reference: String(payload.reference || "").trim() || null,
        staff_email: context.user?.email || null,
        // Worth keeping: it says the link was live when the money came another
        // way, which is the case somebody may want to look back at.
        had_open_request: Boolean(payment.request_url || payment.stripe_checkout_session_id),
        // Whether the customer's link is genuinely dead now, so a question later
        // about a double payment has an answer rather than an assumption.
        link_expired: linkClosure.expired || linkClosure.alreadyClosed,
        link_expiry_error: linkClosure.error || null,
      },
    });

    // Says what actually happened rather than what was intended. "The link is
    // closed" and "we could not close the link" are different things to tell
    // somebody who is about to stop thinking about this payment.
    const linkNote = !payment.stripe_checkout_session_id
      ? ""
      : linkClosure.expired || linkClosure.alreadyClosed
        ? " The payment link has been cancelled."
        : " WARNING: the payment link could NOT be cancelled, so the customer could still pay it. Cancel it in Stripe.";

    return Response.json({
      ok: true,
      payment: settled,
      linkClosed: linkClosure.expired || linkClosure.alreadyClosed,
      message: `Marked as paid by ${settlementMethodLabel(payload.method).toLowerCase()}.${linkNote}`,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not mark this payment as received." },
      { status: error?.status || 500 }
    );
  }
}

/**
 * Undo a settlement recorded by hand.
 *
 * Only one WE recorded. A payment Stripe completed is money that really arrived,
 * and un-marking it would make the books disagree with the bank.
 *
 * Without this there was no way back at all: once anything was marked paid, the
 * payment route refused every financial field, so a mis-settled payment could
 * only be corrected in the database.
 */
export async function DELETE(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, paymentId } = await idsFromParams(params);
    const payload = await request.json().catch(() => ({}));

    const { data: payment, error } = await context.supabase
      .from("pcd_order_payments")
      .select("*")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!payment) return Response.json({ ok: false, error: "Payment not found." }, { status: 404 });

    const { updates, trail, error: refusal } = undoSettlementPatch(payment, { reason: payload.reason });
    if (refusal) return Response.json({ ok: false, error: refusal }, { status: 400 });

    const { data: reopened, error: updateError } = await context.supabase
      .from("pcd_order_payments")
      .update(updates)
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .eq("is_paid", true)
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!reopened) {
      return Response.json(
        { ok: false, error: "This payment changed while you had it open. Reload to see where it is up to." },
        { status: 409 }
      );
    }

    // A deposit going back to owing changes whether the order is confirmed work,
    // the same way settling it did.
    await syncDepositFields(context.supabase, orderId);

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      actor_type: "admin",
      action_type: "payment_settlement_undone",
      title: "Payment settlement undone",
      description: trail,
      metadata: {
        payment_id: paymentId,
        amount: Number(payment.amount || 0),
        was_method: payment.settlement_method || null,
        was_paid_at: payment.paid_at || null,
        reason: String(payload.reason || "").trim(),
        staff_email: context.user?.email || null,
      },
    });

    return Response.json({
      ok: true,
      payment: reopened,
      message: "Put back to owing. The old payment link was cancelled when it was settled, so send a new one if you need it.",
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not undo this settlement." },
      { status: error?.status || 500 }
    );
  }
}
