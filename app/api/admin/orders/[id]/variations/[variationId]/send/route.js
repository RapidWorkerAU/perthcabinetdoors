import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { formatMoney, roundMoney, toNumber } from "../../../../../../../../lib/pcd-quote-utils";
import { JOB_COST_ACTION, orderJobCostAmount } from "../../../../../../../../lib/pcd-order-costs";
import { recalcVariation, variationLineDelta } from "../../../../../../../../lib/pcd-order-variations";
import { unpricedVariationLines, unpricedWarning } from "../../../../../../../../lib/pcd-variation-pricing";
import { assertSendable } from "../../../../../../../../lib/pcd-document-lock";

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

/**
 * Re-take the "what it is now" snapshot on every item line, at send.
 *
 * The snapshot is captured when the variation LINE is written, which is right
 * at the moment somebody drafts it and wrong by the time it is sent if anything
 * has happened in between. Two variations can be open at once: apply the first
 * and the second is still showing the state from before it, so the customer is
 * told "was Amaro, becomes Greige" when the order already says Greige.
 *
 * The job cost lines below have had this treatment from the start. Item lines
 * did not, and they are the ones the customer actually reads.
 *
 * Done at send because that is the last moment before the document leaves, and
 * because a draft being edited over several days should not keep re-anchoring.
 */
async function refreshItemSnapshots(supabase, variationId, lines) {
  const itemLines = (lines || []).filter(
    (line) => ["change", "remove"].includes(line.action) && line.order_line_item_id
  );
  if (!itemLines.length) return;

  const { data: orderLines, error } = await supabase
    .from("pcd_order_line_items")
    .select("*")
    .in("id", itemLines.map((line) => line.order_line_item_id));
  if (error) throw error;
  const byId = new Map((orderLines || []).map((line) => [line.id, line]));

  for (const line of itemLines) {
    const current = byId.get(line.order_line_item_id);
    // The order line is gone, which means a previous variation removed it. The
    // snapshot stays as it was rather than being blanked: it is the only record
    // left of what this variation was written against.
    if (!current) continue;

    const fresh = originalItemSnapshot(current);
    if (JSON.stringify(fresh) === JSON.stringify(line.original_item_snapshot || null)) continue;

    const { error: updateError } = await supabase
      .from("pcd_order_variation_lines")
      .update({
        original_item_snapshot: fresh,
        original_line_total_ex_gst: toNumber(current.line_total_ex_gst),
      })
      .eq("id", line.id)
      .eq("variation_id", variationId);
    if (updateError) throw updateError;
  }
}

/** The same shape the line routes record, so a re-take matches the original. */
function originalItemSnapshot(sourceLine) {
  if (!sourceLine) return null;
  return {
    id: sourceLine.id || null,
    title: sourceLine.title || null,
    description: sourceLine.description || null,
    product_type: sourceLine.product_type || null,
    material: sourceLine.material || null,
    supplier_name: sourceLine.supplier_name || null,
    thickness: sourceLine.thickness || null,
    width_mm: sourceLine.width_mm ?? null,
    height_mm: sourceLine.height_mm ?? null,
    finish: sourceLine.finish || null,
    colour: sourceLine.colour || null,
    profile_type: sourceLine.profile_type || null,
    profile: sourceLine.profile || null,
    edge_mould: sourceLine.edge_mould || null,
    qty: sourceLine.qty ?? 1,
    line_total_ex_gst: sourceLine.line_total_ex_gst ?? 0,
  };
}

/**
 * Re-measure every job cost line against the order as it stands now, and
 * recalculate the variation if anything moved.
 *
 * Two variations can be open at once. Approve and apply the first and the
 * second is still holding the figures it read when it was drafted, so its
 * "currently" column would show a number that is no longer true and its price
 * would be the difference from the wrong starting point. Doing this at send is
 * the last moment before the customer sees it.
 */
async function refreshJobCostBaselines(supabase, variationId, lines, order) {
  if (!order) return;
  const jobCostLines = (lines || []).filter((line) => line.action === JOB_COST_ACTION);
  if (!jobCostLines.length) return;

  let changed = false;
  for (const line of jobCostLines) {
    const current = orderJobCostAmount(order, line.cost_type);
    if (roundMoney(toNumber(line.original_line_total_ex_gst)) === roundMoney(current)) continue;
    const next = { ...line, original_line_total_ex_gst: current };
    const { error } = await supabase
      .from("pcd_order_variation_lines")
      .update({ original_line_total_ex_gst: current, line_total_ex_gst: variationLineDelta(next) })
      .eq("id", line.id)
      .eq("variation_id", variationId);
    if (error) throw error;
    changed = true;
  }

  if (changed) await recalcVariation(supabase, variationId);
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
    const { data: variationLines, error: linesError } = await context.supabase
      .from("pcd_order_variation_lines")
      .select("*")
      .eq("variation_id", variationId)
      .order("sort_order", { ascending: true });
    if (linesError) throw linesError;
    // An applied variation has already rewritten the order. Sending it again
    // put it back in front of the customer as though it were still pending.
    assertSendable("variation", variation.status);

    if (!variationLines?.length) {
      return Response.json({ ok: false, error: "Add at least one variation line before sending." }, { status: 400 });
    }
    // A line with no cost on it is worth saying out loud, and that is all.
    //
    // This used to refuse the send outright, and it refused the wrong lines: it
    // demanded a board rate, so a line priced by hand, which the save had
    // deliberately allowed, was rejected at the last step with a message about a
    // board that was never the problem. There was no way past it.
    //
    // A missing cost is a margin question, not a customer one. The price the
    // customer sees is a separate number and it is already on the line. So this
    // says what it noticed, once, and sends as soon as the person confirms.
    const unpriced = unpricedVariationLines(variationLines);
    if (unpriced.length && !payload.force) {
      return Response.json({
        ok: true,
        needsConfirmation: true,
        warning: unpricedWarning(unpriced),
        unpricedLines: unpriced,
      });
    }

    // A job cost line stores what that cost was on the order when the line was
    // written. If another variation has been applied since, that figure is out
    // of date, and it is the "currently" number the customer is about to be
    // shown. Re-measured against the order as it stands right now, at the last
    // moment before the document leaves. Without this, a second variation
    // drafted alongside a first would quote a before-figure that was never true.
    // Both re-anchor the "currently" side of the document against the order as
    // it stands right now, at the last moment before the customer sees it.
    await refreshItemSnapshots(context.supabase, variationId, variationLines);
    await refreshJobCostBaselines(context.supabase, variationId, variationLines, variation.pcd_orders);

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
    // A refusal carries its own status. Reporting a rule as a 500 leaves the
    // person unable to tell "you cannot do this" from "something is broken".
    return Response.json(
      { ok: false, error: error?.message || "Could not send variation." },
      { status: error?.status || 500 }
    );
  }
}
