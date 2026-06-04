import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../lib/admin-api";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const { origin } = new URL(request.url);
    const { data: quote, error } = await context.supabase
      .from("pcd_quotes")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;

    const viewUrl = `${origin}/quotes/view?code=${encodeURIComponent(quote.access_code)}`;
    const { error: updateError } = await context.supabase
      .from("pcd_quotes")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) throw updateError;

    let emailSent = false;
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && quote.customer_email) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: [quote.customer_email],
        subject: `${quote.quote_number} - Perth Cabinet Doors quote`,
        text: [
          `Hi ${quote.customer_name || "there"},`,
          "",
          "Your Perth Cabinet Doors quote is ready to review.",
          "",
          `View quote: ${viewUrl}`,
          `Access code: ${quote.access_code}`,
          "",
          "Regards,",
          "Perth Cabinet Doors",
        ].join("\n"),
      });
      emailSent = true;
    }

    return Response.json({ ok: true, emailSent, viewUrl });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send quote." }, { status: 500 });
  }
}
