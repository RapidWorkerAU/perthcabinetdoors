import { Resend } from "resend";
import { z } from "zod";
import {
  SALES_EMAIL,
  businessQuoteRequestHtml,
  customerQuoteRequestHtml,
  uniqueRecipients,
} from "../../../lib/pcd-email-templates";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

const lineSchema = z.object({
  productType: z.string().optional(),
  productName: z.string().optional(),
  material: z.string().optional(),
  thickness: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  finish: z.string().optional(),
  colour: z.string().optional(),
  profileType: z.string().optional(),
  profile: z.string().optional(),
  edgeMould: z.string().optional(),
  qty: z.number().optional(),
  hingeHoles: z.boolean().optional(),
  hingeSupply: z.boolean().optional(),
  hingeQty: z.string().optional(),
  notes: z.string().optional(),
});

const quoteRequestSchema = z.object({
  source: z.enum(["request_quote", "product_detail"]).default("request_quote"),
  productId: z.string().optional(),
  productName: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional(),
  deliverySuburb: z.string().optional(),
  cabinetBrand: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).default([]),
});

export async function POST(request) {
  try {
    const parsed = quoteRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ ok: false, error: "Invalid quote request payload." }, { status: 400 });
    }

    const payload = parsed.data;
    const supabase = createSupabaseAdminClient();
    const { data: requestRow, error } = await supabase
      .from("pcd_quote_requests")
      .insert({
        source: payload.source,
        product_id: payload.productId || null,
        product_name: payload.productName || null,
        customer_name: payload.customerName || null,
        customer_email: payload.customerEmail || null,
        customer_phone: payload.customerPhone || null,
        delivery_suburb: payload.deliverySuburb || null,
        cabinet_brand: payload.cabinetBrand || null,
        notes: payload.notes || null,
      })
      .select("*")
      .single();
    if (error) throw error;

    if (payload.lines.length) {
      const rows = payload.lines.map((line, index) => ({
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
        profile_type: line.profileType || null,
        profile: line.profile || null,
        edge_mould: line.edgeMould || null,
        qty: line.qty || 1,
        hinge_holes: !!line.hingeHoles,
        hinge_supply: !!line.hingeSupply,
        hinge_qty: line.hingeQty || null,
        notes: line.notes || null,
      }));
      const { error: linesError } = await supabase.from("pcd_quote_request_line_items").insert(rows);
      if (linesError) throw linesError;
    }

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const businessRecipients = uniqueRecipients(SALES_EMAIL, process.env.QUOTE_TO_EMAIL);
      const businessEmail = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: businessRecipients,
        replyTo: payload.customerEmail || undefined,
        subject: `Quote request - ${payload.customerName || payload.productName || "PCD customer"}`,
        html: businessQuoteRequestHtml(payload),
        text: [
          "Perth Cabinet Doors - Quote Request",
          "",
          `Source: ${payload.source}`,
          `Product: ${payload.productName || ""}`,
          `Name: ${payload.customerName || ""}`,
          `Email: ${payload.customerEmail || ""}`,
          `Phone: ${payload.customerPhone || ""}`,
          `Suburb: ${payload.deliverySuburb || ""}`,
          `Cabinet brand: ${payload.cabinetBrand || ""}`,
          "",
          `Line items: ${payload.lines.length}`,
          "",
          payload.notes || "",
        ].join("\n"),
      });
      if (businessEmail.error) {
        throw new Error(businessEmail.error.message || "Could not send quote request notification email.");
      }

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
            `Perth Cabinet Doors`,
            SALES_EMAIL,
          ].join("\n"),
        });
        if (customerEmail.error) {
          throw new Error(customerEmail.error.message || "Could not send customer confirmation email.");
        }
      }
    }

    return Response.json({ ok: true, id: requestRow.id });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send quote request." }, { status: 500 });
  }
}
