import { Resend } from "resend";
import { z } from "zod";
import {
  SALES_EMAIL,
  businessEnquiryHtml,
  customerEnquiryHtml,
  uniqueRecipients,
} from "../../../lib/pcd-email-templates";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

const enquirySchema = z.object({
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional(),
  postcode: z.string().optional(),
  topic: z.string().optional(),
  message: z.string().min(1),
});

export async function POST(request) {
  try {
    const parsed = enquirySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ ok: false, error: "Invalid enquiry payload." }, { status: 400 });
    }

    const payload = parsed.data;
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("pcd_enquiries").insert({
      customer_name: payload.customerName || null,
      customer_email: payload.customerEmail || null,
      customer_phone: payload.customerPhone || null,
      postcode: payload.postcode || null,
      topic: payload.topic || null,
      message: payload.message,
    });
    if (error) throw error;

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const businessRecipients = uniqueRecipients(SALES_EMAIL, process.env.QUOTE_TO_EMAIL);
      const businessEmail = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: businessRecipients,
        replyTo: payload.customerEmail || undefined,
        subject: `Website enquiry - ${payload.customerName || "PCD customer"}`,
        html: businessEnquiryHtml(payload),
        text: [
          "Perth Cabinet Doors - General Enquiry",
          "",
          `Name: ${payload.customerName || ""}`,
          `Email: ${payload.customerEmail || ""}`,
          `Phone: ${payload.customerPhone || ""}`,
          `Postcode: ${payload.postcode || ""}`,
          `Topic: ${payload.topic || ""}`,
          "",
          payload.message,
        ].join("\n"),
      });
      if (businessEmail.error) {
        throw new Error(businessEmail.error.message || "Could not send enquiry notification email.");
      }

      if (payload.customerEmail) {
        const customerEmail = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: [payload.customerEmail],
          replyTo: SALES_EMAIL,
          subject: "We received your Perth Cabinet Doors enquiry",
          html: customerEnquiryHtml(payload),
          text: [
            `Hi ${payload.customerName || "there"},`,
            "",
            "Thanks for contacting Perth Cabinet Doors. We have received your enquiry and you should expect a response within 1-3 business days.",
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

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send enquiry." }, { status: 500 });
  }
}
