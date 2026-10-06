// Replying to a customer, and writing internal notes, from the customer desk.
//
// Moved out of the reply route so that an email Alfred drafted and a person
// approved goes out through exactly the same steps as one a person typed: the
// same template, the same signature, the same reference block, the same thread.
// There is one way to email a customer from the desk, and this is it.
//
// ONE FUNCTION, TWO KINDS, AND THE DIFFERENCE IS ABSOLUTE. A reply is emailed. A
// note is not, has never been, and must never be: it is the thing somebody
// writes precisely because the customer should not see it. The direction is
// decided once, at the top, and the send is guarded on it again at the point
// of sending, because this is the one mistake in the whole feature that cannot
// be taken back.

import { Resend } from "resend";
import { getBusinessDefaults } from "./pcd-business-defaults";
import { sanitizeTermsHtml, termsHtmlToPlainText, toTermsHtml } from "./pcd-terms-html";
import { deskReplyEmailHtml, deskReplyEmailText, referenceFor } from "./pcd-desk-email";

function refusal(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Send a reply, or save a note, on a customer's desk.
 *
 * @param supabase
 * @param options  customerId, kind ("reply" | "note"), bodyHtml, subject,
 *                 ticketId, newTicket, agentEmail (who is signed in),
 *                 alfred { draftId, approvedBy, edited } for an approved draft
 * @returns { message, ticket, sent }
 * @throws  an Error with .status for anything the person must fix
 */
export async function sendDeskReply(supabase, options = {}) {
  const { customerId, kind, bodyHtml, subject: askedSubject, ticketId, newTicket, agentEmail, alfred = null } = options;
  const isNote = kind === "note";
  const written = sanitizeTermsHtml(toTermsHtml(bodyHtml || ""));
  if (!termsHtmlToPlainText(written).trim()) throw refusal("Write something first.", 422);

  // A note is not an email, so it is not signed. Signing an internal note would
  // be odd at best and, if one were ever sent by mistake, misleading.
  const defaults = await getBusinessDefaults(supabase);
  const signatureHtml = isNote ? "" : sanitizeTermsHtml(toTermsHtml(defaults.email_signature_html || ""));

  // What the DESK stores: the message and the signature, which is what the
  // customer reads. The wrapper and the reference block are presentation and
  // are rebuilt at send time.
  const html = signatureHtml ? `${written}<p>&nbsp;</p>${signatureHtml}` : written;
  const text = termsHtmlToPlainText(html);

  const { data: customer } = await supabase.from("pcd_customers").select("*").eq("id", customerId).maybeSingle();
  if (!customer) throw refusal("No such customer.", 404);

  // The ticket to hang it on.
  //
  // newTicket starts a fresh conversation instead of continuing the last one.
  // Without it, a message about a completely different job would be filed
  // under whatever was most recently spoken about, which is exactly the muddle
  // the desk exists to avoid.
  const startNew = Boolean(newTicket);

  let ticket = null;
  if (!startNew && ticketId) {
    const { data } = await supabase.from("pcd_tickets").select("*").eq("id", ticketId).maybeSingle();
    ticket = data;
  }
  if (!startNew && !ticket) {
    const { data } = await supabase
      .from("pcd_tickets")
      .select("*")
      .eq("customer_id", customerId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ticket = data;
  }
  if (!ticket) {
    const { data, error } = await supabase
      .from("pcd_tickets")
      .insert({
        customer_id: customerId,
        subject: String(askedSubject || "").trim() || (isNote ? "Internal note" : "New conversation"),
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
    const { data: threadCustomer } = await supabase
      .from("pcd_customers")
      .select("id, email")
      .eq("id", ticket.customer_id)
      .maybeSingle();
    if (threadCustomer?.email) replyTo = threadCustomer.email;
  }

  const { data: agent } = await supabase
    .from("pcd_agents")
    .select("id,name")
    .ilike("login_email", agentEmail || "")
    .maybeSingle();

  const subject = String(askedSubject || ticket.subject || "Perth Cabinet Doors").trim();
  let providerMessageId = null;
  // Set the moment the email has gone, so a failure after it is never mistaken
  // for one before it. Retrying a send that already went is how a customer
  // gets the same email twice.
  let emailed = false;

  if (!isNote) {
    if (!replyTo) throw refusal("This customer has no email address to reply to.", 422);
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      throw refusal("Email is not configured, so the reply was not sent.", 503);
    }

    // Which job this is about. The order wins over the quote where there is
    // one, because the order is the live thing. Neither carries a link: an
    // approved order with variations against it would send somebody to
    // figures that are no longer what they are getting.
    // Across every record that reads as this person, so a quote raised under
    // their other address is still the job this email is about.
    const { data: linked } = await supabase
      .from("pcd_customers")
      .select("id")
      .or(`id.eq.${customerId},merged_into_id.eq.${customerId}`);
    const customerIds = (linked || []).map((c) => c.id);
    const ids = customerIds.length ? customerIds : [customerId];

    const [{ data: quote }, { data: order }] = await Promise.all([
      supabase
        .from("pcd_quotes")
        .select("quote_number,total_inc_gst,created_at")
        .in("customer_id", ids)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
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
    emailed = true;
  }

  try {

  const row = {
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
  };
  // WHO WROTE IT AND WHO LET IT GO, for an email Alfred drafted.
  if (alfred && !isNote) {
    row.alfred_draft_id = alfred.draftId || null;
    row.approved_by = alfred.approvedBy || null;
    row.edited_before_send = Boolean(alfred.edited);
  }
  // A reply a person wrote or approved. It counts as keeping them posted.
  if (!isNote) row.sent_as = "reply";
  let { data: saved, error: saveError } = await supabase.from("pcd_messages").insert(row).select("*").single();
  // A database without the newer columns still records the reply.
  if (saveError?.code === "PGRST204") {
    const { sent_as: _a, alfred_draft_id: _b, approved_by: _c, edited_before_send: _d, ...plain } = row;
    ({ data: saved, error: saveError } = await supabase.from("pcd_messages").insert(plain).select("*").single());
  }
  if (saveError) throw saveError;

  // Replying hands the ball to the customer. A note changes nothing: it is
  // still on us.
  const patch = { last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (!isNote) patch.status = "waiting";
  if (!ticket.assigned_agent_id && agent?.id) patch.assigned_agent_id = agent.id;
  await supabase.from("pcd_tickets").update(patch).eq("id", ticket.id);

  return { message: saved, ticket: { ...ticket, ...patch }, sent: !isNote };
  } catch (error) {
    if (emailed && error && typeof error === "object") error.alreadySent = true;
    throw error;
  }
}
