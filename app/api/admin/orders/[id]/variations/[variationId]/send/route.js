import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { formatMoney } from "../../../../../../../../lib/pcd-quote-utils";

async function idsFromParams(params) {
  const resolved = await Promise.resolve(params);
  return { orderId: resolved?.id, variationId: resolved?.variationId };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultEmailBody(variation, order, viewUrl) {
  return [
    `Hi ${variation.customer_name || order.customer_name || "there"},`,
    "",
    `We have prepared a variation for ${order.order_number || "your order"} for your review.`,
    "",
    "Please use the secure link below to review the changes and approve or reject the variation online.",
    "",
    `View variation: ${viewUrl}`,
    `Access code: ${variation.access_code}`,
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].join("\n");
}

function variationEmailHtml({ variation, order, viewUrl, message, includePrice }) {
  const paragraphs = String(message || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f0e8;padding:28px 14px;font-family:Arial,sans-serif;color:#18221b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;background:#fffaf3;border:1px solid #d8cbb8;">
          <tr><td style="background:#eef7ed;border-bottom:1px solid #d5e4d1;padding:28px 30px;">
            <div style="color:#2f6b3b;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div>
            <h1 style="margin:8px 0 0;color:#001f36;font-family:Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:400;">Order variation ready</h1>
          </td></tr>
          <tr><td style="padding:28px 30px 12px;">
            ${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("")}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;background:#f7f2ea;border:1px solid #e3d7c6;">
              <tr><td style="padding:14px 16px;color:#7c725f;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Order</td><td style="padding:14px 16px;color:#001f36;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(order.order_number || "-")}</td></tr>
              <tr><td style="padding:14px 16px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Variation</td><td style="padding:14px 16px;border-top:1px solid #e3d7c6;color:#001f36;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(variation.variation_number)}</td></tr>
              ${includePrice ? `<tr><td style="padding:14px 16px;border-top:1px solid #e3d7c6;color:#7c725f;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Variation total inc GST</td><td style="padding:14px 16px;border-top:1px solid #e3d7c6;color:#001f36;font-size:16px;font-weight:800;text-align:right;">${escapeHtml(formatMoney(variation.total_inc_gst, variation.currency || "AUD"))}</td></tr>` : ""}
            </table>
            <p style="margin:0 0 18px;"><a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#17321f;color:#ffffff;text-decoration:none;padding:14px 20px;font-size:14px;font-weight:700;">View and approve variation</a></p>
            <p style="margin:0 0 6px;color:#7c725f;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
            <p style="margin:0 0 18px;color:#001f36;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(viewUrl)}</p>
          </td></tr>
          <tr><td style="border-top:1px solid #e3d7c6;padding:18px 30px;color:#7c725f;font-size:12px;line-height:1.5;">Perth Cabinet Doors<br>This email was sent because a variation was prepared for ${escapeHtml(variation.customer_name || order.customer_name || "you")}.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, variationId } = await idsFromParams(params);
    const payload = await request.json().catch(() => ({}));
    const { origin } = new URL(request.url);
    const { data: variation, error } = await context.supabase
      .from("pcd_order_variations")
      .select("*, pcd_orders(*)")
      .eq("id", variationId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (error || !variation) throw error || new Error("Variation not found.");
    if (!variation.pcd_order_variation_lines?.length) {
      const { count } = await context.supabase
        .from("pcd_order_variation_lines")
        .select("id", { count: "exact", head: true })
        .eq("variation_id", variationId);
      if (!count) return Response.json({ ok: false, error: "Add at least one variation line before sending." }, { status: 400 });
    }

    const viewUrl = `${origin}/variations/view?code=${encodeURIComponent(variation.access_code)}`;
    const emailSubject = String(payload.subject || `${variation.variation_number} - ${variation.pcd_orders?.order_number || "Order"} variation`).trim();
    const emailMessage = String(payload.message || defaultEmailBody(variation, variation.pcd_orders || {}, viewUrl)).trim();
    const includePrice = payload.include_price !== false;
    const now = new Date().toISOString();

    const { error: updateError } = await context.supabase
      .from("pcd_order_variations")
      .update({ status: "sent", sent_at: now, viewed_at: null })
      .eq("id", variationId);
    if (updateError) throw updateError;

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: variation.pcd_orders?.quote_id || null,
      variation_id: variationId,
      actor_type: "admin",
      action_type: "variation_sent",
      title: "Variation sent to customer",
      description: [variation.variation_number, variation.customer_email].filter(Boolean).join(" - "),
      metadata: { variation_number: variation.variation_number, customer_email: variation.customer_email || null },
      event_key: `variation:${variation.id}:sent`,
    });

    let emailSent = false;
    const toEmail = variation.customer_email || variation.pcd_orders?.customer_email;
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && toEmail) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: [toEmail],
        subject: emailSubject,
        html: variationEmailHtml({ variation, order: variation.pcd_orders || {}, viewUrl, message: emailMessage, includePrice }),
        text: emailMessage,
      });
      emailSent = true;
    }

    return Response.json({ ok: true, emailSent, viewUrl });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send variation." }, { status: 500 });
  }
}
