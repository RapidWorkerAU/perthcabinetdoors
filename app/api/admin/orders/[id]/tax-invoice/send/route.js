import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { agentForUser, recordOutboundEmail } from "../../../../../../../lib/pcd-desk-outbound";
import { loadTaxInvoice } from "../../../../../../../lib/pcd-tax-invoice-load";
import { generateTaxInvoicePdf } from "../../../../../../../lib/pcd-tax-invoice-pdf";
import { taxInvoiceFileName } from "../../../../../../../lib/pcd-tax-invoice";
import {
  taxInvoiceHtml,
  taxInvoiceSubject,
  taxInvoiceText,
} from "../../../../../../../lib/pcd-tax-invoice-email";
import { sendEmail } from "../../../../../../../lib/pcd-send-email";
import { logOrderActivity } from "../../../../../../../lib/pcd-activity-log";

// Emailing the customer their tax invoice.
//
// GET returns what the modal should open with: the invoice, and the default
// wording with their name in it. POST sends whatever came back edited.
//
// THE ORDER RECORDS THAT IT WENT. invoice_issued_at is stamped the first time
// and never moved, so the issue date on a re-sent invoice is the date it was
// first issued rather than today. A tax document that changes its own date
// every time it is re-sent is not one.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id: orderId } = await Promise.resolve(params);
    const loaded = await loadTaxInvoice(context.supabase, orderId);
    if (!loaded.ok) {
      return Response.json({ ok: false, error: loaded.error }, { status: loaded.status || 400 });
    }
    return Response.json({
      ok: true,
      invoice: loaded.invoice,
      subject: taxInvoiceSubject(loaded.invoice),
      fileName: taxInvoiceFileName(loaded.order),
      alreadyIssuedAt: loaded.order.invoice_issued_at || null,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "The tax invoice could not be prepared." },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id: orderId } = await Promise.resolve(params);
    const body = await request.json().catch(() => ({}));

    const loaded = await loadTaxInvoice(context.supabase, orderId);
    if (!loaded.ok) {
      return Response.json({ ok: false, error: loaded.error }, { status: loaded.status || 400 });
    }
    const { order, invoice } = loaded;

    const to = String(body.to || order.customer_email || "").trim();
    if (!to) return Response.json({ ok: false, error: "This order has no customer email to send to." }, { status: 400 });

    const message = String(body.message || "").trim();
    if (!message) return Response.json({ ok: false, error: "The email has no message in it." }, { status: 400 });

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return Response.json({ ok: false, error: "Email is not configured, so nothing was sent." }, { status: 500 });
    }

    const subject = String(body.subject || "").trim() || taxInvoiceSubject(invoice);
    const fileName = taxInvoiceFileName(order);
    const pdf = generateTaxInvoicePdf({ invoice });
    const html = taxInvoiceHtml({ invoice, message, fileName });
    const text = taxInvoiceText({ invoice, message, fileName });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const sent = await sendEmail(resend, {
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      replyTo: context.user?.email || undefined,
      subject,
      html,
      text,
      attachments: [{ filename: fileName, content: pdf.toString("base64") }],
    });
    if (!sent.ok) return Response.json({ ok: false, error: sent.error }, { status: 502 });

    // Stamped once and never moved, so a re-send carries the date it was first
    // issued. Not fatal: the customer has the invoice either way, and failing
    // here would have somebody send it twice.
    if (!order.invoice_issued_at) {
      const { error } = await context.supabase
        .from("pcd_orders")
        .update({ invoice_issued_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) console.error("[tax-invoice] sent but not stamped:", error.message);
    }

    let filedError = "";
    try {
      await recordOutboundEmail(context.supabase, {
        customerId: order.customer_id || null,
        toEmail: to,
        subject,
        bodyHtml: html,
        bodyText: text,
        providerMessageId: sent.id,
        agentId: (await agentForUser(context.supabase, context.user?.email))?.id || null,
        newTicketSubject: subject,
      });
    } catch (deskError) {
      console.error("[tax-invoice] sent but not filed:", deskError?.message || deskError);
      filedError = "The invoice was sent, but it could not be filed on the customer's desk.";
    }

    await logOrderActivity(context.supabase, {
      orderId,
      action: "tax_invoice_sent",
      detail: `Tax invoice ${invoice.number} emailed to ${to}.`,
      actorEmail: context.user?.email || null,
    }).catch(() => {});

    return Response.json({ ok: true, sentTo: to, fileName, warning: filedError });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "The tax invoice could not be sent." },
      { status: 500 }
    );
  }
}
