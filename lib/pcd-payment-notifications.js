import { Resend } from "resend";
import {
  SALES_EMAIL,
  quoteButton,
  quoteFacts,
  quoteHeading,
  quoteParagraphs,
  quoteShell,
} from "./pcd-email-templates";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(value || 0));
}

export function paymentTypeLabel(paymentType, flow) {
  if (flow === "quote_deposit") return "Quote Deposit Payment";
  const labels = {
    deposit: "Deposit Payment",
    progress: "Progress Payment",
    final: "Final Payment",
    other: "Payment",
  };
  return labels[paymentType] || "Payment";
}

function nextStepsForPayment({ payment, flow }) {
  if (flow === "quote_deposit" || payment?.payment_type === "deposit") {
    return "Open the order in PCD Admin, review the accepted quote, and start planning the order.";
  }
  if (payment?.payment_type === "progress") {
    return "Open the order in PCD Admin and continue any order items that are not complete.";
  }
  if (payment?.payment_type === "final") {
    return "Open the order in PCD Admin, confirm all work and payment reconciliation is complete, then close the order.";
  }
  return "Open the order in PCD Admin, review the payment, and confirm the next operational step.";
}

// ON THE SHARED QUOTE SHELL, like everything else in this family.
//
// It used to build its own copy of the cream layout inline, and had already
// drifted: a 680px card where the others use 640, a Georgia heading where the
// others use Arial, and no footer at all.
export function paymentNotificationHtml({ payment, order, quote, flow, adminOrderUrl }) {
  const label = paymentTypeLabel(payment?.payment_type, flow);
  const nextSteps = nextStepsForPayment({ payment, flow });

  return quoteShell({
    title: "Payment received",
    footerNote: "Sent to the sales inbox by the PCD admin system.",
    children: [
      quoteParagraphs(`A ${label.toLowerCase()} has been received.`),
      quoteFacts([
        ["Order", order?.order_number || "-"],
        ["Quote", quote?.quote_number || order?.quote_number || "-"],
        ["Customer", order?.customer_name || quote?.customer_name || "-"],
        ["Payment type", label],
        ["Amount", formatMoney(payment?.amount, quote?.currency || "AUD")],
      ], { emphasiseLast: true }),
      quoteHeading("Next steps"),
      quoteParagraphs(nextSteps),
      adminOrderUrl ? quoteButton(adminOrderUrl, "Open order in PCD Admin") : "",
    ].join(""),
  });
}

export async function sendPaymentReceivedSalesEmail({ payment, order, quote, flow, adminOrderUrl }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const label = paymentTypeLabel(payment?.payment_type, flow);
  const subjectRef = order?.order_number || quote?.quote_number || "PCD order";
  const nextSteps = nextStepsForPayment({ payment, flow });

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: [SALES_EMAIL],
    subject: `${label} received - ${subjectRef}`,
    html: paymentNotificationHtml({ payment, order, quote, flow, adminOrderUrl }),
    text: [
      `${label} received`,
      "",
      `Order: ${order?.order_number || "-"}`,
      `Quote: ${quote?.quote_number || order?.quote_number || "-"}`,
      `Customer: ${order?.customer_name || quote?.customer_name || "-"}`,
      `Amount: ${formatMoney(payment?.amount, quote?.currency || "AUD")}`,
      "",
      `Next steps: ${nextSteps}`,
      adminOrderUrl ? `Open order: ${adminOrderUrl}` : "",
    ].filter(Boolean).join("\n"),
  });

  return true;
}
