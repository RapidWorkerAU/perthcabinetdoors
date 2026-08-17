// Shared quote-request creation — the insert (+ line items + activity log) and
// the business/customer confirmation emails. Used by BOTH the website quote
// form (/api/quote-requests) and the public design planner's "Send my design to
// PCD" (/api/public/design/[code]/submit), so a lead lands and notifies
// identically whichever way it came in. Colour validation is the caller's job:
// the flat form validates each board colour; a design submit sends a summary and
// skips it (carcass-white / unset colours aren't library selections).

import { Resend } from "resend";
import {
  SALES_EMAIL,
  businessQuoteRequestHtml,
  customerQuoteRequestHtml,
  quoteLineItemsText,
  sourceLabel,
  uniqueRecipients,
} from "./pcd-email-templates";
import { logOrderActivity } from "./pcd-activity-log";
import { isEdgeProfileSelectionAvailable } from "./quote-form-data";

// PostgREST reports an unknown column as PGRST204 naming the column. Same
// pattern as the quote line saver's supplier_name guard.
function isMissingColourSourceSchemaError(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" && (message.includes("colour_library_id") || message.includes("supplier_name"));
}

function withoutColourSourceColumns(row) {
  const { colour_library_id: _id, supplier_name: _supplier, ...rest } = row;
  return rest;
}

export async function insertQuoteRequest(supabase, payload) {
  const { data: requestRow, error } = await supabase
    .from("pcd_quote_requests")
    .insert({
      source: payload.source || "request_quote",
      product_id: payload.productId || null,
      product_name: payload.productName || null,
      customer_name: payload.customerName || null,
      customer_email: payload.customerEmail || null,
      customer_phone: payload.customerPhone || null,
      delivery_suburb: payload.deliverySuburb || null,
      cabinet_brand: payload.cabinetBrand || null,
      notes: payload.notes || null,
      design_project_id: payload.designProjectId || null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (lines.length) {
    const rows = lines.map((line, index) => ({
      quote_request_id: requestRow.id,
      sort_order: index,
      product_type: line.productType || null,
      product_name: line.productName || payload.productName || null,
      material: line.material || null,
      thickness: line.thickness || null,
      width_mm: line.width || null,
      height_mm: line.height || null,
      finish: line.finish || null,
      colour: line.colour || null,
      // The exact colour library row the customer picked, plus its brand. These
      // are what let the conversion price the line without anyone re-picking
      // the colour by hand; a colour name on its own is not unique across
      // suppliers. Null when the request came from somewhere that never had a
      // library row to point at.
      colour_library_id: line.colourLibraryId || null,
      supplier_name: line.supplierName || null,
      profile_type: line.profileType || null,
      profile: line.profile || null,
      edge_mould: isEdgeProfileSelectionAvailable(line.edgeMould, line.material) ? line.edgeMould || null : null,
      qty: line.qty || 1,
      hinge_holes: !!line.hingeHoles,
      hinge_supply: !!line.hingeSupply,
      hinge_qty: line.hingeQty || null,
      notes: line.notes || null,
    }));
    const { error: linesError } = await supabase.from("pcd_quote_request_line_items").insert(rows);
    // A live site must not start rejecting quote requests because a migration
    // has not been run yet. If the two colour-source columns are not there, drop
    // them and save the lead: the spec still lands, the conversion just falls
    // back to matching the colour by name.
    if (linesError) {
      if (!isMissingColourSourceSchemaError(linesError)) throw linesError;
      const { error: retryError } = await supabase
        .from("pcd_quote_request_line_items")
        .insert(rows.map(withoutColourSourceColumns));
      if (retryError) throw retryError;
    }
  }

  await logOrderActivity(supabase, {
    quote_request_id: requestRow.id,
    actor_type: "customer",
    action_type: "quote_request_submitted",
    title: "Quote request submitted",
    description: [payload.customerName, payload.deliverySuburb, payload.source].filter(Boolean).join(" - "),
    metadata: { source: payload.source, product_name: payload.productName || null, line_items: lines.length },
    event_key: `quote_request:${requestRow.id}:submitted`,
    created_at: requestRow.created_at,
  });

  return requestRow;
}

export async function sendQuoteRequestEmails(payload) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const businessRecipients = uniqueRecipients(SALES_EMAIL, process.env.QUOTE_TO_EMAIL);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  const businessEmail = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: businessRecipients,
    replyTo: payload.customerEmail || undefined,
    subject: `Quote request - ${payload.customerName || payload.productName || "PCD customer"}`,
    html: businessQuoteRequestHtml(payload),
    text: [
      "Perth Cabinet Doors - Quote Request",
      "",
      `Source: ${sourceLabel(payload.source)}`,
      `Product: ${payload.productName || ""}`,
      `Name: ${payload.customerName || ""}`,
      `Email: ${payload.customerEmail || ""}`,
      `Phone: ${payload.customerPhone || ""}`,
      `Suburb: ${payload.deliverySuburb || ""}`,
      `Cabinet brand: ${payload.cabinetBrand || ""}`,
      "",
      `Line items: ${lines.length}`,
      ...quoteLineItemsText(lines),
      "",
      payload.notes || "",
    ].join("\n"),
  });
  if (businessEmail.error) throw new Error(businessEmail.error.message || "Could not send quote request notification email.");

  if (payload.customerEmail) {
    const customerEmail = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [payload.customerEmail],
      replyTo: SALES_EMAIL,
      subject: "We received your Perth Cabinet Doors quote request",
      html: customerQuoteRequestHtml(payload),
      text: [
        `Hi ${payload.customerName || "there"},`,
        "",
        "Thanks for sending your quote request to Perth Cabinet Doors. We have received it and you should expect a response within 1-3 business days.",
        "",
        ...quoteLineItemsText(lines),
        "",
        `Perth Cabinet Doors`,
        SALES_EMAIL,
      ].join("\n"),
    });
    if (customerEmail.error) throw new Error(customerEmail.error.message || "Could not send customer confirmation email.");
  }
}
