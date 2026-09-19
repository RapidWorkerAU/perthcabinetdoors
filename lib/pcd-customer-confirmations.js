// TELLING THE CUSTOMER SOMETHING LANDED.
//
// ── THE SILENCE THIS FILLS ───────────────────────────────────────────────────
//
// Send an enquiry or a quote request and you get a thank you within seconds.
// Then:
//
//   pay a deposit             sales@ got an email. The customer got nothing.
//   pay by bank transfer      nobody got anything, not even us.
//   approve a quote with no
//   deposit to pay            silence. Nothing at all is sent.
//   approve a variation       silence.
//
// So the noisiest moment in the relationship is the beginning, and the moments
// where somebody has just committed money are the quietest. That is the wrong
// way round.
//
// ── WHAT THESE ARE, AND ARE NOT ──────────────────────────────────────────────
//
// Short acknowledgements. Not receipts with a breakdown, and not statements of
// what is still owing: a figure in an email is a figure we then have to keep
// true, and a variation approved next week makes yesterday's balance wrong. The
// order number is in there so they can quote it back at us, and that is all.
//
// Approving a quote that DOES need a deposit sends nothing from here on
// purpose. That customer is sent straight to the payment page, and the payment
// confirmation follows the moment they pay. Two emails a minute apart, one of
// which says "now go and pay" after they already have, is worse than one.
//
// ── NONE OF THESE MAY EVER FAIL THE THING THEY ARE ABOUT ─────────────────────
//
// The money has arrived, or the approval is recorded, before any of this runs.
// Every function here returns rather than throws, and logs what went wrong, so
// a refused email is a missing email and never a lost payment.

import { Resend } from "resend";
import { acceptedScheduleSentence } from "./pcd-quote-schedule";
import {
  customerPaymentReceivedHtml,
  customerQuoteApprovedHtml,
  customerVariationApprovedHtml,
  customerWebOrderHtml,
  quoteLineItemsText,
} from "./pcd-email-templates";
import { sendEmail } from "./pcd-send-email";

function resendClient() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

async function send({ to, subject, html, text, what }) {
  const address = String(to || "").trim();
  if (!address) {
    console.error(`[confirmation] ${what}: nothing sent, there is no customer email address on it.`);
    return { ok: false, error: "No customer email address." };
  }
  const resend = resendClient();
  if (!resend) {
    console.error(`[confirmation] ${what}: nothing sent, email is not configured.`);
    return { ok: false, error: "Email is not configured." };
  }
  const sent = await sendEmail(resend, {
    from: process.env.RESEND_FROM_EMAIL,
    to: [address],
    subject,
    html,
    text,
  });
  if (!sent.ok) console.error(`[confirmation] ${what}: ${sent.error}`);
  return sent;
}

/**
 * A payment has been received. Fires whichever way it arrived: the Stripe link,
 * or somebody marking it paid because the money is in the bank.
 */
export async function sendPaymentReceivedToCustomer({ payment, order, quote }) {
  const customerName = order?.customer_name || quote?.customer_name || "";
  const orderNumber = order?.order_number || "";
  const amount = Number(payment?.amount || 0);
  const currency = order?.currency || quote?.currency || "AUD";
  const money = new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);

  return send({
    to: order?.customer_email || quote?.customer_email,
    subject: orderNumber ? `Payment received - ${orderNumber}` : "Payment received",
    html: customerPaymentReceivedHtml({ customerName, money, orderNumber }),
    text: [
      `Hi ${customerName || "there"},`,
      "",
      `Thanks, we have received your payment of ${money}${orderNumber ? ` for order ${orderNumber}` : ""}.`,
      "",
      "We will be in touch as your job moves along. If you have any questions, just reply to this email.",
      "",
      "Perth Cabinet Doors",
    ].join("\n"),
    what: `payment on ${orderNumber || "an order"}`,
  });
}

/**
 * A web order has been paid for. Sent INSTEAD of the payment received email:
 * the payment and the order are one event on the website, and two emails a
 * second apart saying the same thing is one too many.
 *
 * `lines` are the order's own lines, so the email lists what the workshop will
 * actually make rather than what the cart said.
 */
export async function sendWebOrderToCustomer({ payment, order, quote, lines = [] }) {
  const customerName = order?.customer_name || quote?.customer_name || "";
  const orderNumber = order?.order_number || "";
  const currency = order?.currency || quote?.currency || "AUD";
  const money = new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(payment?.amount || 0));
  const deliverTo = order?.site_address || quote?.site_address || "";

  return send({
    to: order?.customer_email || quote?.customer_email,
    subject: orderNumber ? `Your order ${orderNumber}` : "Your order",
    html: customerWebOrderHtml({ customerName, orderNumber, money, deliverTo, lines }),
    text: [
      `Hi ${customerName || "there"},`,
      "",
      "Thanks, your payment has gone through and your order is with us. It goes on the bench in about ten working days, and we deliver it two to three days after it is made.",
      "",
      orderNumber ? `Order: ${orderNumber}` : "",
      deliverTo ? `Delivering to: ${deliverTo}` : "",
      `Paid: ${money}`,
      "",
      ...quoteLineItemsText(lines),
      "",
      "Something not right? Reply to this email and quote your order number. We can change anything up until it goes on the bench.",
      "",
      "Perth Cabinet Doors",
    ]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n"),
    what: `web order ${orderNumber || ""}`.trim(),
  });
}

/**
 * A quote has been approved and there is nothing to pay yet.
 *
 * Deliberately not sent when a deposit is owed: that customer goes straight to
 * the payment page and gets the payment confirmation instead.
 */
export async function sendQuoteApprovedToCustomer({ quote, orderNumber = "", schedule = null }) {
  const customerName = quote?.customer_name || "";
  // WHAT THEY JUST AGREED TO, DATE-WISE. The quote showed a suggested start and
  // completion and said how long they held for; this is the same window read
  // once more now that the answer is in. Passed in rather than worked out here,
  // because how long they hold is a Business Default and this module has no
  // database. Blank on a quote that suggested nothing, and the line is dropped.
  const scheduleSentence = acceptedScheduleSentence(schedule);
  return send({
    to: quote?.customer_email,
    subject: `Thanks for approving ${quote?.quote_number || "your quote"}`,
    html: customerQuoteApprovedHtml({
      customerName,
      quoteNumber: quote?.quote_number || "",
      orderNumber,
      scheduleSentence,
    }),
    text: [
      `Hi ${customerName || "there"},`,
      "",
      `Thanks for approving ${quote?.quote_number ? `quote ${quote.quote_number}` : "your quote"}.`,
      orderNumber ? `Your order number is ${orderNumber}.` : "",
      "",
      scheduleSentence,
      "",
      "We will be in touch as your job moves along. If you have any questions, just reply to this email.",
      "",
      "Perth Cabinet Doors",
    ]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n"),
    what: `approval of ${quote?.quote_number || "a quote"}`,
  });
}

/** A variation has been approved and is now part of the order. */
export async function sendVariationApprovedToCustomer({ variation, order }) {
  const customerName = order?.customer_name || variation?.customer_name || "";
  const orderNumber = order?.order_number || "";
  return send({
    to: variation?.customer_email || order?.customer_email,
    subject: `Thanks for approving ${variation?.variation_number || "the change"}`,
    html: customerVariationApprovedHtml({
      customerName,
      variationNumber: variation?.variation_number || "",
      orderNumber,
    }),
    text: [
      `Hi ${customerName || "there"},`,
      "",
      `Thanks for approving ${variation?.variation_number ? `variation ${variation.variation_number}` : "the change"}.`,
      orderNumber ? `It is now part of order ${orderNumber}.` : "",
      "",
      "We will be in touch as your job moves along. If you have any questions, just reply to this email.",
      "",
      "Perth Cabinet Doors",
    ]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n"),
    what: `approval of ${variation?.variation_number || "a variation"}`,
  });
}
