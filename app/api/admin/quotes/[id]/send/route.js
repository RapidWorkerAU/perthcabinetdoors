import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";

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

function quoteEmailHtml({ quote, viewUrl, message, includePrice }) {
  const paragraphs = String(message || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f0e8;padding:28px 14px;font-family:Arial,sans-serif;color:#18221b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;background:#fffaf3;border:1px solid #d8cbb8;">
            <tr>
              <td style="background:#eef7ed;border-bottom:1px solid #d5e4d1;padding:28px 30px;">
                <div style="color:#2f6b3b;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div>
                <h1 style="margin:8px 0 0;color:#001f36;font-family:Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:400;">Your quote is ready</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 12px;">
                ${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("")}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;background:#f7f2ea;border:1px solid #e3d7c6;">
                  <tr>
                    <td style="padding:14px 16px;color:#7c725f;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Quote number</td>
                    <td style="padding:14px 16px;color:#001f36;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(quote.quote_number)}</td>
                  </tr>
                  ${
                    includePrice
                      ? `<tr>
                    <td style="padding:14px 16px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Total inc GST</td>
                    <td style="padding:14px 16px;border-top:1px solid #e3d7c6;color:#001f36;font-size:16px;font-weight:800;text-align:right;">$${Number(quote.total_inc_gst || 0).toFixed(2)}</td>
                  </tr>`
                      : ""
                  }
                </table>
                ${
                  !includePrice
                    ? `<p style="margin:0 0 14px;color:#7c725f;font-size:13px;line-height:1.5;">Pricing has not been included in this email. Open the secure link below to view the full itemised quote and pricing.</p>`
                    : ""
                }
                <p style="margin:0 0 18px;">
                  <a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#17321f;color:#ffffff;text-decoration:none;padding:14px 20px;font-size:14px;font-weight:700;">View and approve quote</a>
                </p>
                <p style="margin:0 0 6px;color:#7c725f;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 18px;color:#001f36;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(viewUrl)}</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e3d7c6;padding:18px 30px;color:#7c725f;font-size:12px;line-height:1.5;">
                Perth Cabinet Doors<br>
                This email was sent because a quote was prepared for ${escapeHtml(quote.customer_name || "you")}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
        deposit_required: depositRequired,
        deposit_percent: depositRequired ? depositPercent : 0,
      })
      .eq("id", id);
    if (updateError) throw updateError;

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
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && quote.customer_email) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: [quote.customer_email],
        subject: emailSubject,
        html: quoteEmailHtml({ quote, viewUrl, message: emailMessage, includePrice }),
        text: emailMessage,
      });
      emailSent = true;
    }

    return Response.json({ ok: true, emailSent, viewUrl });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send quote." }, { status: 500 });
  }
}

