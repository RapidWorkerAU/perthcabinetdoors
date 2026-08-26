import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { agentForUser, recordOutboundEmail } from "../../../../../../../../lib/pcd-desk-outbound";
import { createRefund } from "../../../../../../../../lib/pcd-stripe";
import { quoteFacts, quoteParagraphs, quoteShell } from "../../../../../../../../lib/pcd-email-templates";
import {
  canProcessRefund,
  defaultRefundMessage,
  defaultRefundSubject,
  isRefund,
  refundAmount,
  refundMethodLabel,
  refundSendsMoney,
} from "../../../../../../../../lib/pcd-refunds";

// Processing a refund: sending the money, then telling the customer.
//
// THE ORDER OF THE THREE THINGS MATTERS, and it is not the obvious one.
//
//   1. SEND THE MONEY. If Stripe refuses, nothing else has happened: no line
//      marked done, no email sent saying money is on its way that is not.
//
//   2. MARK IT DONE. The money has moved by now, so this must be recorded even
//      if everything after it fails. A refund sent and not recorded is one that
//      gets sent again.
//
//   3. TELL THE CUSTOMER. Last, and its failure is reported without undoing
//      anything: the money really has gone back, and the email can be resent.
//
// SENDING IT TWICE IS THE THING TO PREVENT. The refund line's own id is used as
// Stripe's idempotency key, so a retry after a timeout that actually succeeded
// returns the first refund rather than making a second one, and stripe_refund_id
// is unique in the database as the second line of defence.

export const maxDuration = 30;

async function idsFromParams(params) {
  const resolved = await params;
  return { orderId: resolved?.id, paymentId: resolved?.paymentId };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Math.abs(Number(value || 0)));
}

// The same shape as the payment request email, so the two read as coming from
// the same business. Green heading rather than a payment button: there is
// nothing for them to do here.
// The same shape as the payment request email, so the two read as coming
// from the same business. No button: there is nothing for them to do here.
// Both now share one shell rather than each carrying a copy of it.
function refundHtml({ order, refund, message }) {
  return quoteShell({
    title: "Refund processed",
    footerNote: `This email was sent about order ${order.order_number || "with us"}.`,
    children: [
      quoteParagraphs(message),
      quoteFacts([
        ["Order", order.order_number || "-"],
        ["Refund amount", formatMoney(refund.amount)],
        ["Sent by", refundMethodLabel(refund.refund_method)],
      ]),
    ].join(""),
  });
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  let message = "";
  let subject = "";
  try {
    const body = await request.json();
    message = String(body?.message || "").trim();
    subject = String(body?.subject || "").trim();
  } catch { /* the email can fall back to its default */ }

  try {
    const { orderId, paymentId } = await idsFromParams(params);

    const { data: refund, error: readError } = await context.supabase
      .from("pcd_order_payments")
      .select("*, pcd_orders(*)")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (readError || !refund) throw readError || new Error("That refund is not on this order.");
    if (!isRefund(refund)) throw new Error("That is a payment, not a refund.");
    if (!canProcessRefund(refund)) throw new Error("This refund has already been processed.");

    const order = refund.pcd_orders;
    const amount = refundAmount(refund);

    // ── 1. The money ──────────────────────────────────────────────────────
    let stripeRefundId = null;
    if (refundSendsMoney(refund.refund_method)) {
      const against = refund.refund_of_payment_id
        ? (
            await context.supabase
              .from("pcd_order_payments")
              .select("stripe_payment_intent_id")
              .eq("id", refund.refund_of_payment_id)
              .maybeSingle()
          ).data
        : null;

      const sent = await createRefund({
        paymentIntentId: against?.stripe_payment_intent_id || null,
        amount,
        reason: refund.refund_reason || "",
        // The refund line's own id, so a retry cannot send it twice.
        idempotencyKey: refund.id,
        metadata: {
          order_id: orderId,
          order_number: order?.order_number || "",
          refund_line_id: refund.id,
        },
      });
      stripeRefundId = sent?.id || null;
    }

    // ── 2. The record ─────────────────────────────────────────────────────
    // The money has moved by now. This has to be written even if the email
    // below fails, or a refund that was sent looks like one that was not.
    const { data: processed, error: updateError } = await context.supabase
      .from("pcd_order_payments")
      .update({
        is_paid: true,
        paid_at: new Date().toISOString().slice(0, 10),
        stripe_refund_id: stripeRefundId,
        stripe_payment_status: stripeRefundId ? "refunded" : refund.stripe_payment_status,
      })
      .eq("id", paymentId)
      .select("*")
      .single();
    if (updateError) throw updateError;


    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: order?.quote_id || null,
      actor_type: "admin",
      action_type: "refund_processed",
      title: "Refund processed",
      description: `${formatMoney(processed.amount)} by ${refundMethodLabel(processed.refund_method).toLowerCase()}${processed.refund_reason ? ` - ${processed.refund_reason}` : ""}`,
      metadata: { payment_id: paymentId, stripe_refund_id: stripeRefundId },
    });

    // ── 3. The customer ───────────────────────────────────────────────────
    let emailSent = false;
    let emailError = "";
    const fullMessage = message || defaultRefundMessage({ order, amount, reason: refund.refund_reason });
    const emailSubject = subject || defaultRefundSubject(order);

    if (!order?.customer_email) {
      emailError = "The order has no customer email, so nobody was told.";
    } else if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const html = refundHtml({ order, refund: processed, message: fullMessage });
        const sent = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: [order.customer_email],
          subject: emailSubject,
          html,
          text: fullMessage,
        });
        emailSent = true;

        // Filed on their conversation, or the desk goes on saying they are
        // waiting on us. See lib/pcd-desk-outbound.js.
        await recordOutboundEmail(context.supabase, {
          customerId: order.customer_id || null,
          toEmail: order.customer_email,
          subject: emailSubject,
          bodyHtml: html,
          bodyText: fullMessage,
          providerMessageId: sent?.data?.id || null,
          agentId: (await agentForUser(context.supabase, context.user?.email))?.id || null,
          newTicketSubject: emailSubject,
        });
      } catch (sendError) {
        // NOT rethrown. The money has gone back; failing the whole request now
        // would leave the screen saying the refund did not happen when it did.
        emailError = sendError?.message || "The refund went through but the email did not send.";
      }
    } else {
      emailError = "Email is not configured, so nobody was told.";
    }

    return Response.json({ ok: true, payment: processed, stripeRefundId, emailSent, emailError });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not process the refund." }, { status: 500 });
  }
}
