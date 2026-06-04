import { z } from "zod";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const lineSchema = z.object({
  finish: z.string().optional(),
  colour: z.string().optional(),
  profileType: z.string().optional(),
  profile: z.string().optional(),
  edgeMould: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  qty: z.number().optional(),
  hingeHoles: z.number().optional(),
  hingeType: z.string().optional(),
  hingesQty: z.number().optional(),
  unitPrice: z.string().optional(),
  lineTotal: z.string().optional(),
});

const payloadSchema = z.object({
  product: z
    .object({
      id: z.string().optional(),
      slug: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  customerDetails: z.object({
    customerName: z.string().optional(),
    customerEmail: z.string().email().optional().or(z.literal("")),
    orderDate: z.string().optional(),
    project: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    po: z.string().optional(),
    customerNotes: z.string().optional(),
  }),
  lines: z.array(lineSchema).default([]),
  totals: z.object({
    doors: z.string().optional(),
    hinges: z.string().optional(),
    drilling: z.string().optional(),
    base: z.string().optional(),
    grand: z.string().optional(),
  }),
});

function textFromQuote(data) {
  const lines = [];
  lines.push("Perth Cabinet Doors - Quote Request");
  lines.push("");
  lines.push(`Product: ${data.product?.name || ""}`);
  lines.push("");
  lines.push("Customer Details:");
  lines.push(`Customer/Company: ${data.customerDetails.customerName || ""}`);
  lines.push(`Customer Email: ${data.customerDetails.customerEmail || ""}`);
  lines.push(`Required By Date: ${data.customerDetails.orderDate || ""}`);
  lines.push(`Project/Job: ${data.customerDetails.project || ""}`);
  lines.push(`Contact Phone: ${data.customerDetails.phone || ""}`);
  lines.push(`Delivery Address: ${data.customerDetails.address || ""}`);
  lines.push(`PO/Reference: ${data.customerDetails.po || ""}`);
  lines.push(`Customer Notes: ${data.customerDetails.customerNotes || ""}`);
  lines.push("");
  lines.push("Line Items:");

  data.lines.forEach((line, idx) => {
    lines.push(`Line ${idx + 1}`);
    lines.push(`Finish: ${line.finish || ""}`);
    lines.push(`Colour: ${line.colour || ""}`);
    lines.push(`Profile Type: ${line.profileType || ""}`);
    lines.push(`Profile: ${line.profile || ""}`);
    lines.push(`Edge Mould: ${line.edgeMould || ""}`);
    lines.push(`Width: ${line.width || 0}`);
    lines.push(`Height: ${line.height || 0}`);
    lines.push(`Qty: ${line.qty || 0}`);
    lines.push(`Hinge Holes: ${line.hingeHoles || 0}`);
    lines.push(`Hinge Type: ${line.hingeType || ""}`);
    lines.push(`Hinges Qty: ${line.hingesQty || 0}`);
    lines.push(`Unit Price: ${line.unitPrice || ""}`);
    lines.push(`Line Total: ${line.lineTotal || ""}`);
    lines.push("-");
  });

  lines.push("");
  lines.push("Totals:");
  lines.push(`Doors Total: ${data.totals.doors || ""}`);
  lines.push(`Hinge Hardware Total: ${data.totals.hinges || ""}`);
  lines.push(`Hinge Drilling Total: ${data.totals.drilling || ""}`);
  lines.push(`Base Total: ${data.totals.base || ""}`);
  lines.push(`Grand Total: ${data.totals.grand || ""}`);

  return lines.join("\n");
}

export async function POST(request) {
  try {
    const json = await request.json();
    const parsed = payloadSchema.safeParse(json);

    if (!parsed.success) {
      return Response.json(
        { ok: false, error: "Invalid quote payload" },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const bodyText = textFromQuote(payload);

    if (
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const quoteInsert = {
        customer_name: payload.customerDetails.customerName || null,
        customer_email: payload.customerDetails.customerEmail || null,
        required_by_date: payload.customerDetails.orderDate || null,
        project: payload.customerDetails.project || null,
        phone: payload.customerDetails.phone || null,
        address: payload.customerDetails.address || null,
        po_reference: payload.customerDetails.po || null,
        notes: payload.customerDetails.customerNotes || null,
        product_name: payload.product?.name || null,
        product_slug: payload.product?.slug || null,
        lines_json: payload.lines,
        totals_json: payload.totals,
      };

      const { error: insertError } = await supabase.from("quote_requests").insert(quoteInsert);
      if (insertError) {
        await supabase.from("quote_requests").insert({
          customer_name: payload.customerDetails.customerName || null,
          customer_email: payload.customerDetails.customerEmail || null,
          required_by_date: payload.customerDetails.orderDate || null,
          project: payload.customerDetails.project || null,
          phone: payload.customerDetails.phone || null,
          address: payload.customerDetails.address || null,
          po_reference: payload.customerDetails.po || null,
          notes: payload.customerDetails.customerNotes || null,
          lines_json: payload.lines,
          totals_json: payload.totals,
        });
      }
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const quoteInbox = process.env.QUOTE_TO_EMAIL;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (resendApiKey && quoteInbox && fromEmail) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: fromEmail,
        to: [quoteInbox],
        cc: payload.customerDetails.customerEmail
          ? [payload.customerDetails.customerEmail]
          : undefined,
        subject: `Quote Request - ${payload.customerDetails.customerName || "Website"}`,
        text: bodyText,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
