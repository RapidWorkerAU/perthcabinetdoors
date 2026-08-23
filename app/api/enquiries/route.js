import { Resend } from "resend";
import { z } from "zod";
import {
  SALES_EMAIL,
  businessEnquiryHtml,
  customerEnquiryHtml,
  uniqueRecipients,
} from "../../../lib/pcd-email-templates";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { upsertCustomerByEmail } from "../../../lib/pcd-customer-utils";
import { attemptSend, customerNoticeFor, reportSendFailures } from "../../../lib/pcd-notify";

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
    const results = [];

    // Same rule as a quote request: the enquiry makes a customer, keyed on the
    // address, so the message shows on their desk instead of only in a list of
    // enquiries nobody links back.
    let customerId = null;
    try {
      const customer = await upsertCustomerByEmail(
        supabase,
        {
          email: payload.customerEmail,
          name: payload.customerName,
          phone: payload.customerPhone,
          site_postcode: payload.postcode,
        },
        { source: "enquiry", label: "Website enquiry" }
      );
      customerId = customer?.id || null;
    } catch {
      customerId = null;
    }

    const { error } = await supabase.from("pcd_enquiries").insert({
      customer_id: customerId,
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
      results.push(await attemptSend("business", () => resend.emails.send({
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
      })));

      if (payload.customerEmail) {
        results.push(await attemptSend("customer", () => resend.emails.send({
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
        })));
      }
    }

    // THE ENQUIRY IS SAVED. THE CUSTOMER IS DONE.
    //
    // This used to throw when a send failed, which became a 500 and told
    // somebody their message had not gone through when it had. The worst of it
    // needed nothing to be wrong at all: our notification went out fine, only
    // the customer's own copy bounced, and we still said the whole thing
    // failed. The row shows on the enquiries screen either way.
    const failures = reportSendFailures("enquiry", results);
    return Response.json({ ok: true, notice: customerNoticeFor(failures) });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send enquiry." }, { status: 500 });
  }
}
