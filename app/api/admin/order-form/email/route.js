import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { agentForUser, recordOutboundEmail } from "../../../../../lib/pcd-desk-outbound";
import { generateOrderForm } from "../../../../../lib/pcd-order-form";
import { sendEmail } from "../../../../../lib/pcd-send-email";
import {
  ORDER_FORM_SUBJECT,
  orderFormEmailHtml,
  orderFormEmailText,
} from "../../../../../lib/pcd-order-form-email";

// Emailing somebody the order form, with the form attached.
//
// The workbook is built here rather than taken from anywhere, for the same
// reason the download button builds it: a file that was made last month is a
// file offering colours we may have stopped stocking. The customer gets today's
// library or nothing.
//
// THE SEND IS THE POINT, so it is what the answer is about. Filing the message
// on the customer's desk afterwards matters, but a desk write that fails must
// not report the email as unsent when the customer has it: they would be sent
// it twice, which reads as either a mistake or a nag.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const body = await request.json().catch(() => ({}));
    const to = String(body.to || "").trim();
    const customerId = body.customerId || null;
    const subject = String(body.subject || "").trim() || ORDER_FORM_SUBJECT;
    const message = String(body.message || "").trim();

    if (!EMAIL_SHAPE.test(to)) {
      return Response.json({ ok: false, error: "That does not look like an email address." }, { status: 400 });
    }
    if (!message) {
      return Response.json({ ok: false, error: "The email has no message in it." }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return Response.json(
        { ok: false, error: "Email is not configured, so nothing was sent." },
        { status: 500 }
      );
    }

    const { buffer, fileName } = await generateOrderForm(context.supabase);
    const html = orderFormEmailHtml({ message, fileName });
    const text = orderFormEmailText({ message, fileName });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const sent = await sendEmail(resend, {
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      // So a reply lands with the person who sent it rather than in the
      // general inbox for somebody to notice and pass on.
      replyTo: context.user?.email || undefined,
      subject,
      html,
      text,
      attachments: [{ filename: fileName, content: buffer.toString("base64") }],
    });

    if (!sent.ok) {
      return Response.json({ ok: false, error: sent.error }, { status: 502 });
    }

    // Filed on their conversation, so the board stops thinking we owe them a
    // reply. Deliberately not fatal: the customer has the form either way, and
    // failing here would have somebody send it a second time.
    let filedError = "";
    if (customerId) {
      try {
        await recordOutboundEmail(context.supabase, {
          customerId,
          toEmail: to,
          subject,
          bodyHtml: html,
          bodyText: text,
          providerMessageId: sent.id,
          agentId: (await agentForUser(context.supabase, context.user?.email))?.id || null,
          newTicketSubject: subject,
        });
      } catch (deskError) {
        console.error("[order-form/email] sent but not filed:", deskError?.message || deskError);
        filedError = "The form was sent, but it could not be filed on the customer's desk.";
      }
    }

    return Response.json({ ok: true, fileName, sentTo: to, warning: filedError });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "The order form could not be sent." },
      { status: 500 }
    );
  }
}
