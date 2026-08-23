// Turning mailbox messages into customers, tickets and messages.
//
// THE ADDRESS DECIDES WHOSE IT IS. Every message has a counterparty: the person
// who is not us. That address goes through upsertCustomerByEmail, the same one
// path every quote request and saved design already uses, so somebody who
// emailed in March and filled in a form in August is one record and not two.
//
// THE CONVERSATION DECIDES WHICH TICKET. Graph keeps conversationId stable
// across replies, so a reply five months later rejoins the ticket it belongs to
// instead of starting a new one. A unique index on that column means two
// messages of the same thread arriving at once cannot race into two tickets.
//
// RUNNING IT TWICE IS SAFE, and that is deliberate rather than incidental: the
// window is taken with an overlap because clocks are not exact, and a message
// missed matters far more than one seen twice. provider_event_id is unique, so
// the second sighting is refused by the database rather than duplicated.

import { upsertCustomerByEmail } from "./pcd-customer-utils";
import { decisionFor, loadSenderRules, PENDING_TABLE } from "./pcd-mail-senders";
import { fetchMailboxMessages, fetchMessageAttachments, graphConfig, graphStatus } from "./pcd-graph-mail";

// How far back the very first run reaches. The mailbox has years in it and
// almost none of that is worth reading; this fills the desk with conversations
// that are still live. Widen it deliberately, not by accident.
export const FIRST_RUN_DAYS = 90;

// Re-read a little of what we have already seen. See the note above on why.
const OVERLAP_MINUTES = 10;

// Addresses that are us. A message between two of our own addresses has no
// customer in it and belongs to nobody.
function ourAddresses() {
  return new Set(
    [graphConfig().mailbox, process.env.RESEND_FROM_EMAIL, process.env.QUOTE_TO_EMAIL]
      .filter(Boolean)
      .map((address) => String(address).trim().toLowerCase())
  );
}

// A message with nobody on the other side of it, or with us on both sides.
// Whether the person IS a customer is not decided here: that is a remembered
// answer, see pcd-mail-senders.js.
export function hasCounterparty(message, ours = ourAddresses()) {
  const email = message?.counterparty?.email;
  return Boolean(email) && !ours.has(email);
}

// PostgREST puts an "in" filter in the URL, so a list of 500 ids becomes a URL
// no server will accept. Ask in chunks and stitch the answers together.
async function fetchIn(supabase, table, column, values, select = "*", chunkSize = 100) {
  const unique = [...new Set(values.filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, unique.slice(i, i + chunkSize));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/** Where to resume from: the newest message we hold, less the overlap. */
export async function syncWindowStart(supabase, { firstRunDays = FIRST_RUN_DAYS } = {}) {
  const { data } = await supabase
    .from("pcd_messages")
    .select("created_at")
    .not("provider_event_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.created_at) {
    return new Date(Date.now() - firstRunDays * 24 * 3600 * 1000).toISOString();
  }
  return new Date(new Date(data.created_at).getTime() - OVERLAP_MINUTES * 60 * 1000).toISOString();
}

async function agentForMailbox(supabase) {
  const { data } = await supabase
    .from("pcd_agents")
    .select("id")
    .ilike("login_email", graphConfig().mailbox)
    .maybeSingle();
  return data?.id || null;
}

// A ticket for this conversation, or a new one. The subject is taken from the
// first message we see of the thread and then left alone: a customer who
// changes the subject line mid-thread has not started a new job, and renaming
// the ticket under whoever is reading it helps nobody.
async function ticketFor(supabase, { customerId, message }) {
  if (message.conversation_id) {
    const { data: existing } = await supabase
      .from("pcd_tickets")
      .select("*")
      .eq("provider_conversation_id", message.conversation_id)
      .maybeSingle();
    if (existing?.id) return { ticket: existing, created: false };
  }

  const row = {
    customer_id: customerId,
    subject: message.subject,
    provider_conversation_id: message.conversation_id || null,
    channel: "email",
    // An email from a customer needs an answer. One we sent does not, so a
    // thread we started sits as waiting until they reply.
    status: message.direction === "inbound" ? "open" : "waiting",
    first_message_at: message.occurred_at,
    last_message_at: message.occurred_at,
  };

  const { data, error } = await supabase.from("pcd_tickets").insert(row).select("*").single();
  if (!error) return { ticket: data, created: true };

  // 23505 = unique violation on the conversation. Another run got there first,
  // so take theirs rather than failing.
  if (error.code === "23505" && message.conversation_id) {
    const { data: raced } = await supabase
      .from("pcd_tickets")
      .select("*")
      .eq("provider_conversation_id", message.conversation_id)
      .maybeSingle();
    if (raced?.id) return { ticket: raced, created: false };
  }
  throw error;
}

// Exported so approving a sender files their attachments the same way the
// sync does, rather than a second copy of this drifting out of step.
export async function storeMessageAttachments(supabase, { messageId, graphId }) {
  let stored = 0;
  let files = [];
  try {
    files = await fetchMessageAttachments(graphId);
  } catch {
    // A file we cannot read must not cost us the message it came with.
    return 0;
  }

  for (const file of files) {
    // The existing "attachments" bucket, the same one quote PDFs use. The
    // message id keeps one email's files together and stops two files of the
    // same name colliding.
    const safeName = String(file.file_name).replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const path = `email/${messageId}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(path, file.bytes, { contentType: file.content_type, upsert: true });
    if (uploadError) continue;

    const { error: rowError } = await supabase.from("pcd_message_attachments").insert({
      message_id: messageId,
      file_name: file.file_name,
      content_type: file.content_type,
      size_bytes: file.size_bytes,
      storage_path: path,
    });
    if (!rowError) stored += 1;
  }
  return stored;
}

/**
 * Read the mailbox and write what is new.
 *
 * Returns a plain summary rather than throwing on the first bad message: one
 * unreadable email must not stop the other forty from being filed. Anything
 * that did fail comes back in `problems` so it is visible rather than lost.
 */
export async function syncMailbox(supabase, { firstRunDays = FIRST_RUN_DAYS, limit = 500, since: forcedSince = null } = {}) {
  const status = await graphStatus();
  if (!status.ok) {
    return { ok: false, error: status.error, configured: status.configured, added: 0, tickets: 0, customers: 0, problems: [] };
  }

  // A normal run resumes from the newest message it already holds. A BACKFILL
  // passes an explicit date and re-reads the lot.
  //
  // This exists because the resume point is a high-water mark, so anything the
  // window failed to reach the first time is behind it forever after. That is
  // exactly what a paging bug did on the first real run: it read the latest
  // page and stopped, and every older message inside the window became
  // unreachable. Re-reading is free — provider_event_id is unique, so a message
  // already held is refused rather than duplicated — and there has to be a way
  // to say "look again properly" without emptying the tables first.
  const since = forcedSince || (await syncWindowStart(supabase, { firstRunDays }));
  const messages = await fetchMailboxMessages({ since, limit });
  const ours = ourAddresses();
  const agentId = await agentForMailbox(supabase);
  const rules = await loadSenderRules(supabase);

  // ── everything the loop needs, asked for in bulk ─────────────────────────
  //
  // A message used to cost four or five separate round trips: is it already
  // held, who is the customer, which ticket, then the insert. At Australian
  // latency that is most of a second EACH, and a hundred messages took two
  // minutes with the database idle the whole time.
  //
  // The biggest win is knowing up front which messages are already held. On
  // every run after the first that is nearly all of them, and each one used to
  // cost an insert that failed on the unique index just to find out.
  const relevant = messages.filter((message) => hasCounterparty(message, ours));

  const [held, existingCustomers, existingTickets, knownSenders] = await Promise.all([
    fetchIn(supabase, "pcd_messages", "provider_event_id", relevant.map((m) => m.provider_event_id), "provider_event_id"),
    fetchIn(supabase, "pcd_customers", "email", relevant.map((m) => m.counterparty.email), "*"),
    fetchIn(supabase, "pcd_tickets", "provider_conversation_id", relevant.map((m) => m.conversation_id), "*"),
    fetchIn(supabase, PENDING_TABLE, "email", relevant.map((m) => m.counterparty.email), "*"),
  ]);

  const heldIds = new Set(held.map((row) => row.provider_event_id));
  // Keyed lowercase: pcd_customers is unique on lower(email), so that is the
  // key the database itself uses.
  const customersByEmail = new Map(existingCustomers.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
  const ticketsByConversation = new Map(existingTickets.map((t) => [t.provider_conversation_id, t]));
  const senderByEmail = new Map(knownSenders.map((row) => [row.email.toLowerCase(), row]));
  // Undecided senders are tallied in memory and written once at the end. Doing
  // it per message cost two round trips each, and on a first run most of the
  // mailbox is undecided: that alone was the bulk of a two and a half minute
  // sync.
  const pendingUpdates = new Map();

  // `capped` is the honest bit. A run that stopped at its ceiling has NOT
  // caught up, and saying "done" at that point is what let the mailbox and the
  // board drift apart without anybody being told.
  // How far through the mailbox this pass reached. A CATCH UP cannot use the
  // newest row in the table to resume from: everything it is recovering is
  // OLDER than that, so the window would snap back to today and the rest of the
  // gap would be left exactly where it was. It resumes from here instead.
  const newestSeen = messages.reduce(
    (latest, message) => (message.occurred_at && message.occurred_at > latest ? message.occurred_at : latest),
    ""
  );
  const summary = { ok: true, error: "", configured: true, scanned: messages.length, capped: Boolean(messages.capped), newestSeen, added: 0, tickets: 0, customers: 0, attachments: 0, skipped: 0, ignored: 0, awaiting: 0, alreadyHeld: 0, problems: [] };
  const seenCustomers = new Set();

  for (const message of messages) {
    if (!hasCounterparty(message, ours)) {
      summary.skipped += 1;
      continue;
    }

    try {
      const address = message.counterparty.email;
      const decision = decisionFor(address, rules);

      if (decision === "ignore") {
        summary.ignored += 1;
        continue;
      }

      // Nothing to do, and now known without asking the database.
      if (message.provider_event_id && heldIds.has(message.provider_event_id)) {
        summary.alreadyHeld += 1;
        continue;
      }

      // Somebody we already hold a customer record for is a customer, whatever
      // the rules say. They have quoted, ordered or filled in a form, so asking
      // whether they count would be daft.
      const known = decision === "customer" ? null : customersByEmail.get(address) || null;

      // A CONVERSATION WE ALREADY HOLD IS ALREADY DECIDED.
      //
      // The gate below is for strangers writing in, and it was being applied to
      // every message including our own replies. So this happened, and it left
      // no trace anywhere a person would look:
      //
      //   A customer writes from one address, is filed, and gets a card on the
      //   board. Somebody replies in Outlook, and the reply goes to her OTHER
      //   address, or to her and somebody else. That address is on no customer
      //   record, so the reply is treated as an unknown sender asking to be let
      //   in: parked in the pending list, never filed, never on her desk. The
      //   board goes on saying nobody has answered her, because as far as the
      //   database is concerned nobody has.
      //
      // Graph keeps conversationId stable across a whole thread, so a reply on
      // a thread we already hold does not need its address resolving at all. We
      // know whose conversation it is: it is the one this ticket belongs to.
      //
      // This also catches the customer replying from their second address, which
      // is the same fault from the other side.
      const onKnownThread = message.conversation_id
        ? ticketsByConversation.get(message.conversation_id) || null
        : null;

      if (decision !== "customer" && !known && !onKnownThread) {
        // Nobody has decided about this address. Note that they wrote, and
        // leave their mail alone until somebody says which they are. It is
        // sitting in Outlook the whole time.
        const already = senderByEmail.get(address);
        // Decided once and the answer since removed: not a new question.
        if (!already || already.status === "pending") {
          const tally = pendingUpdates.get(address) || {
            email: address,
            display_name: already?.display_name || message.counterparty.name || null,
            first_subject: already?.first_subject || message.subject || null,
            preview: already?.preview || String(message.body_text || "").slice(0, 280) || null,
            first_seen_at: already?.first_seen_at || message.occurred_at,
            message_count: already?.message_count || 0,
            last_subject: null,
            last_seen_at: null,
          };
          tally.message_count += 1;
          tally.last_subject = message.subject || tally.last_subject;
          tally.last_seen_at = message.occurred_at || tally.last_seen_at;
          pendingUpdates.set(address, tally);
        }
        summary.awaiting += 1;
        continue;
      }

      // WHOSE IT IS. A message on a thread we already hold belongs to that
      // thread's customer, and looking its address up instead would make a
      // SECOND record for the same person the first time they use their other
      // address. That is the duplicate the desk spends its time undoing.
      const customer = onKnownThread?.customer_id
        ? { id: onKnownThread.customer_id, email: null }
        : await upsertCustomerByEmail(
            supabase,
            { email: message.counterparty.email, name: message.counterparty.name },
            { source: "inbound_email", label: `Email, ${message.subject}` }
          );
      if (!customer?.id) {
        summary.skipped += 1;
        continue;
      }
      if (!seenCustomers.has(customer.id)) {
        seenCustomers.add(customer.id);
        summary.customers += 1;
      }

      if (customer.email) customersByEmail.set(customer.email.toLowerCase(), customer);

      const cachedTicket = message.conversation_id ? ticketsByConversation.get(message.conversation_id) : null;
      const { ticket, created } = cachedTicket
        ? { ticket: cachedTicket, created: false }
        : await ticketFor(supabase, { customerId: customer.id, message });
      if (created) summary.tickets += 1;
      // A conversation usually arrives as several messages in one run. Holding
      // the ticket means the rest of the thread costs no lookup at all.
      if (message.conversation_id) ticketsByConversation.set(message.conversation_id, ticket);

      const { data: saved, error } = await supabase
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

      // Already held. This is the normal case on every run after the first and
      // is not worth reporting.
      if (error?.code === "23505") continue;
      if (error) throw error;

      summary.added += 1;
      if (message.has_attachments) {
        summary.attachments += await storeMessageAttachments(supabase, { messageId: saved.id, graphId: message.graph_id });
      }

      // The ticket follows the conversation: something from the customer needs
      // an answer, something we sent means the ball is with them. A closed
      // ticket reopens when they write again, which is the whole point of the
      // customer who vanishes for five months and comes back.
      const patch = { last_message_at: message.occurred_at, updated_at: new Date().toISOString() };
      if (message.direction === "inbound") patch.status = "open";
      else if (ticket.status === "open") patch.status = "waiting";
      await supabase.from("pcd_tickets").update(patch).eq("id", ticket.id);
      // The held copy has to move with it, or the next message of this thread
      // decides its status from a stale row.
      Object.assign(ticket, patch);
    } catch (err) {
      summary.problems.push({ subject: message.subject, error: err?.message || "Could not file this message." });
    }
  }

  // One write for every undecided sender seen in this run.
  if (pendingUpdates.size) {
    try {
      const rows = [...pendingUpdates.values()].map((row) => ({ ...row, status: "pending" }));
      const { error } = await supabase.from(PENDING_TABLE).upsert(rows, { onConflict: "email", ignoreDuplicates: false });
      if (error) throw error;
    } catch (err) {
      // The mail is filed either way; only the approval list is behind.
      summary.problems.push({ subject: "New senders list", error: err?.message || "Could not update the new senders list." });
    }
  }

  return summary;
}
