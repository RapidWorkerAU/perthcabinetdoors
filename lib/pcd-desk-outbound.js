// AN EMAIL THE APP SENT, WRITTEN INTO THE CUSTOMER'S CONVERSATION.
//
// ── THE PROBLEM ──────────────────────────────────────────────────────────────
//
// There are three ways a customer's email gets answered, and only two of them
// were visible to the board.
//
//   the desk reply    writes an outbound row against the ticket itself
//   Outlook           lands in Sent Items, and the mail sync reads both inbox
//                     and sentitems, so it comes back as an outbound message
//   the quote system  sends through Resend, which never touches the mailbox we
//                     sync, so nothing was ever written anywhere
//
// pcd_board_message_state() decides whose turn it is from pcd_messages alone.
// So sending somebody a quote, a variation or a payment request left their
// email as the last thing that passed between us, and the card sat on the board
// saying they were still waiting on an answer they had already been sent.
//
// ── WHAT THIS DOES ───────────────────────────────────────────────────────────
//
// Files the email as what it is: an outbound message on their conversation. The
// desk timeline then shows the email we actually sent rather than a one line
// "Quote sent to customer", the board sees the reply, and "when we last wrote
// to this address" is true for the first time.
//
// ── WHICH CONVERSATION ───────────────────────────────────────────────────────
//
// Their most recent open one, which is the rule the desk reply already uses
// when you hit reply without picking a thread. A CLOSED conversation is left
// closed and a new one started instead: closing draws a line in time, and
// dragging a settled thread back open because we sent an unrelated quote would
// undo somebody's decision.
//
// ── IT NEVER BREAKS A SEND ───────────────────────────────────────────────────
//
// The email has already gone by the time this runs. If the write fails, that is
// a note we did not keep, not a reason to tell somebody their quote failed to
// send, so every path here returns a result and throws nothing.

const OUTBOUND_STATUS = "waiting";

/**
 * Record an email we sent a customer as an outbound message on their thread.
 *
 * Returns { ok, reason, ticketId, messageId }. `ok: false` is never fatal.
 */
export async function recordOutboundEmail(supabase, {
  customerId,
  toEmail,
  subject,
  bodyHtml = "",
  bodyText = "",
  providerMessageId = null,
  agentId = null,
  fromEmail = process.env.RESEND_FROM_EMAIL || null,
  newTicketSubject = null,
} = {}) {
  const to = String(toEmail || "").trim();
  if (!supabase || !customerId || !to) {
    return { ok: false, reason: "No customer or address to file this against." };
  }

  try {
    const now = new Date().toISOString();

    // Their newest conversation that is still open. Closed ones are left alone.
    const { data: existing } = await supabase
      .from("pcd_tickets")
      .select("id, status")
      .eq("customer_id", customerId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let ticket = existing || null;

    if (!ticket) {
      const { data: created, error: ticketError } = await supabase
        .from("pcd_tickets")
        .insert({
          customer_id: customerId,
          subject: String(newTicketSubject || subject || "Perth Cabinet Doors").trim(),
          channel: "email",
          status: OUTBOUND_STATUS,
          first_message_at: now,
          last_message_at: now,
        })
        .select("id, status")
        .single();
      if (ticketError) throw ticketError;
      ticket = created;
    }

    const { data: saved, error: messageError } = await supabase
      .from("pcd_messages")
      .insert({
        ticket_id: ticket.id,
        customer_id: customerId,
        direction: "outbound",
        agent_id: agentId || null,
        from_name: "Perth Cabinet Doors",
        from_email: fromEmail,
        to_email: to,
        subject: String(subject || "").trim() || "Perth Cabinet Doors",
        body_html: bodyHtml || "",
        body_text: bodyText || "",
        provider_message_id: providerMessageId || null,
      })
      .select("id")
      .single();
    if (messageError) throw messageError;

    // Sending hands the ball back to the customer, the same way a desk reply
    // does. last_message_at is what orders the desk and picks the thread next
    // time, so it moves whether or not the status changed.
    await supabase
      .from("pcd_tickets")
      .update({ last_message_at: now, updated_at: now, status: OUTBOUND_STATUS })
      .eq("id", ticket.id);

    return { ok: true, ticketId: ticket.id, messageId: saved?.id || null };
  } catch (error) {
    // Named in the log, because the symptom (a card that will not clear) is a
    // long way from the cause.
    console.error("[desk-outbound] the sent email was not filed on the conversation:", error?.message || error);
    return { ok: false, reason: error?.message || "Could not file the sent email." };
  }
}

/** The agent row for the signed-in admin, or null. Used to sign the message. */
export async function agentForUser(supabase, email) {
  const login = String(email || "").trim();
  if (!supabase || !login) return null;
  const { data } = await supabase
    .from("pcd_agents")
    .select("id, name")
    .ilike("login_email", login)
    .maybeSingle();
  return data || null;
}
