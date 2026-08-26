import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { assertSendable } from "../../../../../../lib/pcd-document-lock";
import { attachQuotePdf } from "../../../../../../lib/pcd-quote-pdf-attachment";
import { agentForUser, recordOutboundEmail } from "../../../../../../lib/pcd-desk-outbound";
import { sendEmail } from "../../../../../../lib/pcd-send-email";
import { quoteButton, quoteFacts, quoteShell } from "../../../../../../lib/pcd-email-templates";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultEmailBody(quote, viewUrl) {
  return [
    `Hi ${quote.customer_name || "there"},`,
    "",
    "Your Perth Cabinet Doors quote is ready to review.",
    "",
    "Please use the secure link below to view the quote, check the line items and approve or reject it online.",
    "",
    `View quote: ${viewUrl}`,
    `Access code: ${quote.access_code}`,
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].join("\n");
}

// THE LOOK LIVES IN lib/pcd-email-templates.js, not here.
//
// It used to be written out inline in this file, which was fine while this
// was the only email that used it. The deposit reminders have to look like
// they came from the same place, and a second copy is how the navy shell and
// this one came to disagree in the first place.
function quoteEmailHtml({ quote, viewUrl, message, includePrice }) {
  const paragraphs = String(message || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return quoteShell({
    title: "Your quote is ready",
    footerNote: `This email was sent because a quote was prepared for ${quote.customer_name || "you"}.`,
    children: `
                ${paragraphs
                  .map(
                    (paragraph) =>
                      `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
                  )
                  .join("")}
                ${quoteFacts([
                  ["Quote number", quote.quote_number],
                  includePrice ? ["Total inc GST", `$${Number(quote.total_inc_gst || 0).toFixed(2)}`] : null,
                ], { emphasiseLast: includePrice })}
                ${
                  !includePrice
                    ? `<p style="margin:0 0 14px;color:#7c725f;font-size:13px;line-height:1.5;">Pricing has not been included in this email. Open the secure link below to view the full itemised quote and pricing.</p>`
                    : ""
                }
                ${quoteButton(viewUrl, "View and approve quote")}
                <p style="margin:0 0 6px;color:#7c725f;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 18px;color:#001f36;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(viewUrl)}</p>`,
  });
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const payload = await request.json().catch(() => ({}));
    const { origin } = new URL(request.url);
    const { data: quote, error } = await context.supabase
      .from("pcd_quotes")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;

    // Re-sending a draft or a sent quote is ordinary. Sending one the customer
    // has already ANSWERED is not: this route writes status "sent"
    // unconditionally, so it used to revert an approved quote to awaiting a
    // response and strand the approval against a quote that no longer read as
    // approved. See lib/pcd-document-lock.js.
    assertSendable("quote", quote.status);

    const viewUrl = `${origin}/quotes/view?code=${encodeURIComponent(quote.access_code)}`;
    const emailSubject = String(payload.subject || `${quote.quote_number} - Perth Cabinet Doors quote`).trim();
    const emailMessage = String(payload.message || defaultEmailBody(quote, viewUrl)).trim();
    const includePrice = Boolean(payload.include_price);
    const depositRequired = Boolean(payload.deposit_required);
    const depositPercent = Math.max(0, Math.min(100, Number(payload.deposit_percent || 0)));
    const { error: updateError } = await context.supabase
      .from("pcd_quotes")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        // Reset view tracking on every send — so a pre-send preview (or a
        // previous send) that already set viewed_at doesn't stop this send's
        // first genuine client view from being recorded.
        viewed_at: null,
        deposit_required: depositRequired,
        deposit_percent: depositRequired ? depositPercent : 0,
      })
      .eq("id", id);
    if (updateError) throw updateError;

    // The customer's copy of the quote, filed against the quote so it shows in
    // the Attachments section of the viewer they are about to be linked to.
    // Built after the status update so the PDF carries the sent quote, and
    // without the cabinet drawings, which are a workshop drawing set.
    //
    // A failure here must not stop the send. The link in the email is the
    // quote; a missing PDF is the behaviour we had before, whereas a failed
    // send after the status is already "sent" leaves a quote the customer was
    // never told about. Reported back so the editor can say so.
    let pdfAttached = false;
    let pdfError = null;
    try {
      await attachQuotePdf(context.supabase, id, { includeCabinetDrawings: false });
      pdfAttached = true;
    } catch (attachmentError) {
      pdfError = attachmentError?.message || "Could not attach the quote PDF.";
    }

    await logOrderActivity(context.supabase, {
      order_id: quote.order_id || null,
      quote_id: quote.id,
      actor_type: "admin",
      action_type: "quote_sent",
      title: "Quote sent to customer",
      description: [quote.quote_number, quote.customer_email].filter(Boolean).join(" - "),
      metadata: {
        quote_number: quote.quote_number,
        customer_email: quote.customer_email || null,
      },
      event_key: `quote:${quote.id}:sent`,
    });

    let emailSent = false;
    // WHY IT DID NOT GO, when it did not go. Resend answers a refusal rather
    // than throwing one, and this used to be read as success. See
    // lib/pcd-send-email.js.
    let emailError = "";
    if (!quote.customer_email) emailError = "This quote has no customer email address on it.";
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && quote.customer_email) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const html = quoteEmailHtml({ quote, viewUrl, message: emailMessage, includePrice });
      const sent = await sendEmail(resend, {
        from: process.env.RESEND_FROM_EMAIL,
        to: [quote.customer_email],
        subject: emailSubject,
        html,
        text: emailMessage,
      });
      emailSent = sent.ok;
      emailError = sent.error;

      // The email goes out through Resend, which never touches the mailbox the
      // desk syncs, so nothing about it reached the customer's conversation and
      // the board went on saying they were waiting for an answer they had.
      // Filed after the send, and never allowed to fail it.
      await recordOutboundEmail(context.supabase, {
        customerId: quote.customer_id,
        toEmail: quote.customer_email,
        subject: emailSubject,
        bodyHtml: html,
        bodyText: emailMessage,
        providerMessageId: sent.id,
        agentId: (await agentForUser(context.supabase, context.user?.email))?.id || null,
        newTicketSubject: emailSubject,
      });
    }

    return Response.json({ ok: true, emailSent, emailError, viewUrl, pdfAttached, pdfError });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not send quote." },
      { status: error?.status || 500 }
    );
  }
}

