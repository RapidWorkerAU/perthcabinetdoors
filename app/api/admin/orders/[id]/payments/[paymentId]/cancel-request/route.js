// CANCEL A PAYMENT LINK THE CUSTOMER NEVER PAID.
//
// A progress link goes out and is not paid, then the final link has to carry
// that amount as well. While the first link was out its line was locked and
// still counted against the order total, so the final link could not be sent.
//
// This kills the Stripe link, puts the line back to unsent so it can be edited
// or deleted, and optionally emails the customer the wording staff approved in
// the email window.
//
// The link is killed FIRST, the opposite order to settling. Settling records
// money that already arrived, so it must not wait on Stripe. Here nothing has
// arrived, and unlocking the line while the link still works would leave a link
// that can take money with no request behind it.

import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { agentForUser, recordOutboundEmail } from "../../../../../../../../lib/pcd-desk-outbound";
import {
  canCancelPaymentRequest,
  cancelPaymentRequestPatch,
  defaultCancelLinkMessage,
  defaultCancelLinkSubject,
  sessionAlreadyPaid,
} from "../../../../../../../../lib/pcd-payment-requests";
import { expireCheckoutSession, retrieveCheckoutSession } from "../../../../../../../../lib/pcd-stripe";
import { paymentTypeLabel } from "../../../../../../../../lib/pcd-payment-notifications";
import { quoteFacts, quoteParagraphs, quoteShell } from "../../../../../../../../lib/pcd-email-templates";

async function idsFromParams(params) {
  const resolved = await params;
  return { orderId: resolved?.id, paymentId: resolved?.paymentId };
}

function formatMoney(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(value || 0));
}

function cancelledLinkHtml({ order, payment, message }) {
  return quoteShell({
    title: "Payment link cancelled",
    footerNote: `This email was sent about order ${order.order_number || "with us"}.`,
    children: [
      quoteParagraphs(message),
      quoteFacts([
        ["Payment type", paymentTypeLabel(payment.payment_type)],
        ["Amount", formatMoney(payment.amount, order.currency || "AUD")],
        ["Link", "Cancelled"],
      ]),
    ].join(""),
  });
}

const PAID_ALREADY =
  "The customer has already paid this link, or started a payment that is still clearing. It has not been cancelled. Reload the order to see it.";

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, paymentId } = await idsFromParams(params);
    const body = await request.json().catch(() => ({}));
    const notify = Boolean(body?.notify);

    const { data: payment, error: paymentError } = await context.supabase
      .from("pcd_order_payments")
      .select("*, pcd_orders(*)")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return Response.json({ ok: false, error: "Payment not found." }, { status: 404 });
    if (payment.is_paid) return Response.json({ ok: false, error: "This payment is already paid." }, { status: 409 });
    if (!canCancelPaymentRequest(payment)) {
      return Response.json({ ok: false, error: "This payment has no link to cancel." }, { status: 409 });
    }

    const order = payment.pcd_orders || {};
    if (notify && !order.customer_email) {
      return Response.json({ ok: false, error: "The order has no customer email, so the customer cannot be told." }, { status: 400 });
    }

    // KILL THE LINK. Stripe refuses to expire a session that is no longer open,
    // which is either one that ran out (fine) or one the customer paid (stop).
    const sessionId = payment.stripe_checkout_session_id;
    if (sessionId) {
      const closure = await expireCheckoutSession(sessionId);
      if (!closure.expired && !closure.alreadyClosed) {
        return Response.json(
          { ok: false, error: `Stripe would not cancel the link, so nothing has changed. ${closure.error || ""}`.trim() },
          { status: 502 }
        );
      }
      if (closure.alreadyClosed) {
        let session = null;
        try {
          session = await retrieveCheckoutSession(sessionId);
        } catch (error) {
          return Response.json(
            { ok: false, error: `Could not check with Stripe whether this link was paid, so nothing has changed. ${error?.message || ""}`.trim() },
            { status: 502 }
          );
        }
        if (sessionAlreadyPaid(session)) return Response.json({ ok: false, error: PAID_ALREADY }, { status: 409 });
      }
    }

    // Conditional on still being unpaid and on the same link, so a payment that
    // landed, or a fresh link somebody sent, while this was open is not undone.
    let update = context.supabase
      .from("pcd_order_payments")
      .update(cancelPaymentRequestPatch())
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .eq("is_paid", false);
    update = sessionId ? update.eq("stripe_checkout_session_id", sessionId) : update.is("stripe_checkout_session_id", null);
    const { data: updated, error: updateError } = await update.select("*").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return Response.json(
        { ok: false, error: "This payment changed while you had it open. Reload to see where it is up to." },
        { status: 409 }
      );
    }

    // THE EMAIL. Never throws: the link is already dead, and saying so on screen
    // is better than an error that reads as if the cancel failed.
    let emailSent = false;
    let emailError = "";
    if (notify) {
      if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
        emailError = "Email is not set up on this server.";
      } else {
        try {
          const message = String(body?.message || "").trim() || defaultCancelLinkMessage(order, payment);
          const subject = String(body?.subject || "").trim() || defaultCancelLinkSubject(order);
          const html = cancelledLinkHtml({ order, payment, message });
          const resend = new Resend(process.env.RESEND_API_KEY);
          const sent = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to: [order.customer_email],
            subject,
            html,
            text: message,
          });
          if (sent?.error) throw new Error(sent.error.message || "The email service refused it.");
          emailSent = true;

          // Filed on the customer's conversation. See lib/pcd-desk-outbound.js.
          await recordOutboundEmail(context.supabase, {
            customerId: order.customer_id || null,
            toEmail: order.customer_email,
            subject,
            bodyHtml: html,
            bodyText: message,
            providerMessageId: sent?.data?.id || null,
            agentId: (await agentForUser(context.supabase, context.user?.email))?.id || null,
            newTicketSubject: subject,
          });
        } catch (error) {
          emailError = error?.message || "Could not send the email.";
        }
      }
    }

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: order.quote_id || null,
      actor_type: "admin",
      action_type: "payment_request_cancelled",
      title: "Payment link cancelled",
      description:
        `${paymentTypeLabel(payment.payment_type)} - ${formatMoney(payment.amount, order.currency || "AUD")}. ` +
        (emailSent ? "Customer emailed." : notify ? `Customer NOT emailed: ${emailError}` : "Customer not emailed."),
      metadata: {
        payment_id: paymentId,
        amount: Number(payment.amount || 0),
        stripe_checkout_session_id: sessionId || null,
        notify,
        emailSent,
        emailError: emailError || null,
        staff_email: context.user?.email || null,
      },
    });

    return Response.json({
      ok: true,
      payment: updated,
      emailSent,
      message:
        "Payment link cancelled. The line can now be edited or deleted." +
        (emailSent ? " The customer has been emailed." : notify ? ` The customer was NOT emailed: ${emailError}` : ""),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not cancel the payment link." }, { status: 500 });
  }
}
