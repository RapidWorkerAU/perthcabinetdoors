// Filing a set of Graph messages against a customer.
//
// Pulled out of the sync so approving a sender can reuse it: the two do exactly
// the same job, one over "everything new in the mailbox" and one over
// "everything this person ever sent".
//
// Approving reaches BACK on purpose. Their earlier mail is still in the
// mailbox, and the conversation somebody wants to read is almost always the one
// that already happened. Filing only from the moment of approval would leave
// the useful half behind.

import { upsertCustomerByEmail } from "./pcd-customer-utils";

/**
 * Write these messages against this customer, creating tickets as needed.
 *
 * Idempotent: a message already held is refused by the unique index on
 * provider_event_id and counted as such rather than duplicated.
 */
export async function fileMessagesForCustomer(supabase, { customer, messages, agentId = null, storeAttachments }) {
  const result = { added: 0, tickets: 0, attachments: 0, alreadyHeld: 0, problems: [] };
  if (!customer?.id || !messages?.length) return result;

  const ticketsByConversation = new Map();
  const { data: existing } = await supabase
    .from("pcd_tickets")
    .select("*")
    .eq("customer_id", customer.id);
  for (const ticket of existing || []) {
    if (ticket.provider_conversation_id) ticketsByConversation.set(ticket.provider_conversation_id, ticket);
  }

  for (const message of messages) {
    try {
      let ticket = message.conversation_id ? ticketsByConversation.get(message.conversation_id) : null;

      if (!ticket) {
        const { data: created, error } = await supabase
          .from("pcd_tickets")
          .insert({
            customer_id: customer.id,
            subject: message.subject,
            provider_conversation_id: message.conversation_id || null,
            channel: "email",
            status: message.direction === "inbound" ? "open" : "waiting",
            first_message_at: message.occurred_at,
            last_message_at: message.occurred_at,
          })
          .select("*")
          .single();

        if (error) {
          // Another run created it between our read and our write.
          if (error.code === "23505" && message.conversation_id) {
            const { data: raced } = await supabase
              .from("pcd_tickets")
              .select("*")
              .eq("provider_conversation_id", message.conversation_id)
              .maybeSingle();
            ticket = raced;
          }
          if (!ticket) throw error;
        } else {
          ticket = created;
          result.tickets += 1;
        }
        if (message.conversation_id) ticketsByConversation.set(message.conversation_id, ticket);
      }

      const { data: saved, error: insertError } = await supabase
        .from("pcd_messages")
        .insert({
          ticket_id: ticket.id,
          customer_id: customer.id,
          direction: message.direction,
          agent_id: message.direction === "outbound" ? agentId : null,
          from_name: message.from_name,
          from_email: message.from_email,
          to_email: message.to_email,
          subject: message.subject,
          body_html: message.body_html,
          body_text: message.body_text,
          provider_message_id: message.provider_message_id,
          provider_event_id: message.provider_event_id,
          created_at: message.occurred_at,
        })
        .select("id")
        .single();

      if (insertError?.code === "23505") {
        result.alreadyHeld += 1;
        continue;
      }
      if (insertError) throw insertError;

      result.added += 1;
      if (message.has_attachments && storeAttachments) {
        result.attachments += await storeAttachments({ messageId: saved.id, graphId: message.graph_id });
      }

      const patch = { last_message_at: message.occurred_at, updated_at: new Date().toISOString() };
      if (message.direction === "inbound") patch.status = "open";
      else if (ticket.status === "open") patch.status = "waiting";
      await supabase.from("pcd_tickets").update(patch).eq("id", ticket.id);
      Object.assign(ticket, patch);
    } catch (err) {
      result.problems.push({ subject: message.subject, error: err?.message || "Could not file this message." });
    }
  }

  return result;
}

/** The customer record for an address, created if this is the first we see. */
export async function customerForAddress(supabase, { email, name, source }) {
  return upsertCustomerByEmail(supabase, { email, name }, source);
}
