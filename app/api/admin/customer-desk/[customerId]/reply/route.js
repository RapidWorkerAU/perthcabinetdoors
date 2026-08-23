import { Resend } from "resend";
import { requireAdminApiContext } from "@/lib/admin-api";
import { getBusinessDefaults } from "@/lib/pcd-business-defaults";
import { sanitizeTermsHtml, termsHtmlToPlainText, toTermsHtml } from "@/lib/pcd-terms-html";
import { deskReplyEmailHtml, deskReplyEmailText, referenceFor } from "@/lib/pcd-desk-email";

// Replying to a customer, and writing internal notes.
//
// ONE ROUTE, TWO KINDS, AND THE DIFFERENCE IS ABSOLUTE. A reply is emailed. A
// note is not, has never been, and must never be: it is the thing somebody
// writes precisely because the customer should not see it. The direction is
// decided from the request once, at the top, and the send is guarded on it
// again at the point of sending, because this is the one mistake in the whole
// feature that cannot be taken back.

export const dynamic = "force-dynamic";

async function customerIdFrom(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.customerId;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const customerId = await customerIdFrom(params);
  const body = await request.json().catch(() => ({}));

  const isNote = body.kind === "note";
  const written = sanitizeTermsHtml(toTermsHtml(body.body_html || ""));
  if (!termsHtmlToPlainText(written).trim()) {
    return Response.json({ ok: false, error: "Write something first." }, { status: 422 });
  }

  // A note is not an email, so it is not signed. Signing an internal note would
  // be odd at best and, if one were ever sent by mistake, misleading.
  const defaults = await getBusinessDefaults(context.supabase);
  const signatureHtml = isNote ? "" : sanitizeTermsHtml(toTermsHtml(defaults.email_signature_html || ""));

  // What the DESK stores: the message and the signature, which is what the
  // customer reads. The wrapper and the reference block are presentation and
  // are rebuilt at send time.
  const html = signatureHtml ? `${written}<p>&nbsp;</p>${signatureHtml}` : written;
  const text = termsHtmlToPlainText(html);

  try {
    const { data: customer } = await context.supabase
      .from("pcd_customers")
      .select("*")
      .eq("id", customerId)
      .maybeSingle();
    if (!customer) return Response.json({ ok: false, error: "No such customer." }, { status: 404 });

    // The ticket to hang it on.
    //
    // new_ticket starts a fresh conversation instead of continuing the last
    // one. Without it, a message about a completely different job would be
    // filed under whatever was most recently spoken about, which is exactly the
    // muddle the desk exists to avoid.
    const startNew = Boolean(body.new_ticket);

    let ticket = null;
    if (!startNew && body.ticket_id) {
      const { data } = await context.supabase.from("pcd_tickets").select("*").eq("id", body.ticket_id).maybeSingle();
      ticket = data;
    }
    if (!startNew && !ticket) {
      const { data } = await context.supabase
        .from("pcd_tickets")
        .select("*")
        .eq("customer_id", customerId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ticket = data;
    }
    if (!ticket) {
      const { data, error } = await context.supabase
        .from("pcd_tickets")
        .insert({
          customer_id: customerId,
          subject: String(body.subject || "").trim() || (isNote ? "Internal note" : "New conversation"),
          status: isNote ? "open" : "waiting",
          first_message_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      ticket = data;
    }

    // WHO THIS REPLY IS ACTUALLY GOING TO.
    //
    // A customer can have more than one record: the same person writing from two
    // addresses, or their partner answering for them. The desk shows them as one
    // person, so the record in the url is the primary and its address is not
    // necessarily the address this conversation is with.
    //
    // The thread knows. A ticket belongs to the record the message came in on,
    // so the reply goes back to whoever wrote, which is what somebody expects
    // when they hit reply on a conversation in front of them. Only a brand new
    // conversation, which has nobody to reply TO, goes to the primary.
    let replyTo = customer.email;
    if (ticket?.customer_id && ticket.customer_id !== customerId) {
      const { data: threadCustomer } = await context.supabase
        .from("pcd_customers")
        .select("id, email")
        .eq("id", ticket.customer_id)
        .maybeSingle();
      if (threadCustomer?.email) replyTo = threadCustomer.email;
    }

    const { data: agent } = await context.supabase
      .from("pcd_agents")
      .select("id,name")
      .ilike("login_email", context.user?.email || "")
      .maybeSingle();

    const subject = String(body.subject || ticket.subject || "Perth Cabinet Doors").trim();
    let providerMessageId = null;

    if (!isNote) {
      if (!replyTo) {
        return Response.json({ ok: false, error: "This customer has no email address to reply to." }, { status: 422 });
      }
      if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
        return Response.json({ ok: false, error: "Email is not configured, so the reply was not sent." }, { status: 503 });
      }

      // Which job this is about. The order wins over the quote where there is
      // one, because the order is the live thing. Neither carries a link: an
      // approved order with variations against it would send somebody to
      // figures that are no longer what they are getting.
      // Across every record that reads as this person, so a quote raised under
      // their other address is still the job this email is about.
      const { data: linked } = await context.supabase
        .from("pcd_customers")
        .select("id")
        .or(`id.eq.${customerId},merged_into_id.eq.${customerId}`);
      const customerIds = (linked || []).map((c) => c.id);
      const ids = customerIds.length ? customerIds : [customerId];

      const [{ data: quote }, { data: order }] = await Promise.all([
        context.supabase
          .from("pcd_quotes")
          .select("quote_number,total_inc_gst,created_at")
          .in("customer_id", ids)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        context.supabase
          .from("pcd_orders")
          .select("order_number,total_inc_gst,created_at")
          .in("customer_id", ids)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const reference = referenceFor({ quote, order });

      const resend = new Resend(process.env.RESEND_API_KEY);
      const sent = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: replyTo,
        // Replies come back to the mailbox we read, which is how the customer's
        // answer rejoins this ticket.
        replyTo: process.env.RESEND_FROM_EMAIL,
        subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        html: deskReplyEmailHtml({ bodyHtml: written, signatureHtml, reference, subject }),
        text: deskReplyEmailText({
          bodyText: termsHtmlToPlainText(written),
          signatureText: termsHtmlToPlainText(signatureHtml),
          reference,
        }),
      });
      if (sent?.error) throw new Error(sent.error.message || "Resend refused the message.");
      providerMessageId = sent?.data?.id || null;
    }

    const { data: saved, error: saveError } = await context.supabase
      .from("pcd_messages")
      .insert({
        ticket_id: ticket.id,
        customer_id: customerId,
        // Guarded a second time. A note reaching the send branch above is the
        // one unrecoverable mistake here.
        direction: isNote ? "note" : "outbound",
        agent_id: agent?.id || null,
        from_name: agent?.name || "Perth Cabinet Doors",
        from_email: isNote ? null : process.env.RESEND_FROM_EMAIL,
        to_email: isNote ? null : replyTo,
        subject: isNote ? `Note: ${subject}` : subject,
        body_html: html,
        body_text: text,
        provider_message_id: providerMessageId,
      })
      .select("*")
      .single();
    if (saveError) throw saveError;

    // Replying hands the ball to the customer. A note changes nothing: it is
    // still on us.
    const patch = { last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (!isNote) patch.status = "waiting";
    if (!ticket.assigned_agent_id && agent?.id) patch.assigned_agent_id = agent.id;
    await context.supabase.from("pcd_tickets").update(patch).eq("id", ticket.id);

    return Response.json({ ok: true, message: saved, ticket: { ...ticket, ...patch }, sent: !isNote });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save that." }, { status: 500 });
  }
}
