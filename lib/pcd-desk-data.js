// Everything the customer desk shows, in one read.
//
// The page is a single screen with a header, a list of communications and a
// detail pane, so it asks once rather than letting each part fetch its own.
//
// THE COMMS LIST IS NOT JUST EMAIL. Quotes sent, quotes approved, payments and
// variations already live in pcd_order_activity, and website enquiries and
// quote requests in their own tables. All of it belongs in the same list: what
// somebody wants when they open a customer is "what has happened with these
// people", not "which of four screens was it on".

import { requestLineText } from "./pcd-line-summary";
import { loadCustomerPayments, paymentsTotal } from "./pcd-customer-payments";
import { toTermsHtml } from "./pcd-terms-html";

const MESSAGE_FIELDS =
  "id,ticket_id,direction,agent_id,from_name,from_email,to_email,subject,body_html,body_text,created_at";

/**
 * A QUOTE REQUEST, READ BACK IN FULL, so answering a question about one does
 * not mean leaving the desk to go and look at it.
 *
 * The entry used to be the brand and the status, which is the two things you
 * can already see, and none of the things you are being asked about.
 *
 * THEIR OWN WORDS COME FIRST. The message is what somebody is replying to; the
 * items are the detail behind it. Then the delivery suburb, which is the next
 * question after "what is it".
 *
 * Everything goes through toTermsHtml, so what a customer typed is escaped the
 * same way every other body on this page is.
 */
export function requestEntryHtml(row = {}, lines = []) {
  const parts = [];

  const notes = String(row.notes || "").trim();
  if (notes) parts.push(toTermsHtml(notes));

  if (lines.length) {
    parts.push("<p><strong>What they asked for</strong></p>");
    parts.push(`<ul>${lines.map((line) => `<li>${requestLineText(line)}</li>`).join("")}</ul>`);
  } else if (!notes) {
    parts.push("<p>No items or message came through with this request.</p>");
  }

  const footer = [
    row.cabinet_brand,
    row.delivery_suburb ? `Delivery to ${row.delivery_suburb}` : "",
  ].filter(Boolean).join(" · ");
  if (footer) parts.push(`<p>${footer}</p>`);

  return toTermsHtml(parts.join(""));
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

/** Activity rows turned into the same shape as a message, so one list sorts. */
function activityAsEntries(rows = []) {
  return rows.map((row) => ({
    id: `activity:${row.id}`,
    kind: "system",
    direction: "system",
    actor: row.actor_type === "customer" ? "Customer" : row.actor_type === "admin" ? "Admin" : "System",
    subject: row.title,
    body_html: row.description ? toTermsHtml(row.description) : "",
    occurred_at: iso(row.created_at),
    action_type: row.action_type,
    // What to link to, so the entry is a way in rather than a dead note.
    quote_id: row.quote_id || null,
    order_id: row.order_id || null,
    variation_id: row.variation_id || null,
    ticket_id: null,
  }));
}

function messageAsEntry(row, agentsById, attachmentsByMessage) {
  return {
    id: row.id,
    kind: row.direction === "note" ? "note" : row.direction === "outbound" ? "outbound" : "inbound",
    direction: row.direction,
    actor:
      row.direction === "inbound"
        ? row.from_name || row.from_email || "Customer"
        : agentsById.get(row.agent_id)?.name || "Perth Cabinet Doors",
    from_email: row.from_email,
    to_email: row.to_email,
    subject: row.subject,
    body_html: toTermsHtml(row.body_html || row.body_text || ""),
    occurred_at: iso(row.created_at),
    ticket_id: row.ticket_id,
    attachments: attachmentsByMessage.get(row.id) || [],
  };
}

/**
 * The whole desk for one customer.
 *
 * Returns null when there is no such customer, so the caller can 404 rather
 * than render an empty page that looks like a customer with no history.
 */
export async function loadCustomerDesk(supabase, customerId) {
  const { data: customer } = await supabase.from("pcd_customers").select("*").eq("id", customerId).maybeSingle();
  if (!customer) return null;

  // ONE PERSON'S DESK, ACROSS EVERY RECORD THEY HAVE.
  //
  // The same person writing from two addresses becomes two customer records,
  // and so does their partner answering for them. Where those records have been
  // linked, the desk has to read all of them or half the conversation is on a
  // page nobody thinks to open. Nothing was moved when they were linked, so the
  // rows are still under whichever record they were written against; the desk
  // is what puts them back together.
  //
  // Opening a secondary lands on the primary, so there is one desk per person
  // rather than two that each show a piece.
  const primaryId = customer.merged_into_id || customer.id;
  const { data: contacts } = await supabase
    .from("pcd_customers")
    .select("*")
    .or(`id.eq.${primaryId},merged_into_id.eq.${primaryId}`)
    .order("merged_into_id", { nullsFirst: true });

  const group = contacts?.length ? contacts : [customer];
  const primary = group.filter((c) => !c.merged_into_id)[0] || customer;
  const ids = group.map((c) => c.id);

  const [
    { data: tickets },
    { data: messages },
    { data: agents },
    { data: pendingChanges },
    { data: quotes },
    { data: orders },
    { data: activity },
    { data: enquiries },
    { data: requests },
  ] = await Promise.all([
    supabase.from("pcd_tickets").select("*").in("customer_id", ids).order("last_message_at", { ascending: false }),
    supabase.from("pcd_messages").select(MESSAGE_FIELDS).in("customer_id", ids).order("created_at", { ascending: false }),
    supabase.from("pcd_agents").select("id,name,login_email"),
    supabase.from("pcd_pending_customer_changes").select("*").in("customer_id", ids).eq("status", "pending"),
    // Not a web order still waiting on its payment: until it is paid it is a
    // cart, and if it never is it is archived quietly. See pcd-deposit-gate.
    supabase.from("pcd_quotes").select("id,quote_number,title,status,total_inc_gst,created_at,order_id,customer_email").in("customer_id", ids).neq("status", "web_checkout").order("created_at", { ascending: false }),
    supabase.from("pcd_orders").select("id,order_number,name,status,total_inc_gst,created_at,customer_email").in("customer_id", ids).order("created_at", { ascending: false }),
    supabase.from("pcd_order_activity").select("*").in("customer_id", ids).order("created_at", { ascending: false }).limit(200),
    supabase.from("pcd_enquiries").select("id,topic,message,status,created_at").in("customer_id", ids),
    // WITH WHAT THEY ACTUALLY WROTE. The desk used to show a quote request as
    // its brand and its status and nothing else, so answering a question about
    // one meant leaving the page to go and read it.
    supabase.from("pcd_quote_requests").select("id,product_name,cabinet_brand,status,created_at,notes,delivery_suburb,converted_quote_id").in("customer_id", ids),
  ]);

  // And the items on those requests, so the whole ask is on the desk.
  const requestLines = new Map();
  const requestIds = (requests || []).map((r) => r.id);
  if (requestIds.length) {
    const { data: rows } = await supabase
      .from("pcd_quote_request_line_items")
      .select("*")
      .in("quote_request_id", requestIds)
      .order("sort_order", { ascending: true });
    for (const row of rows || []) {
      const list = requestLines.get(row.quote_request_id) || [];
      list.push(row);
      requestLines.set(row.quote_request_id, list);
    }
  }

  // WHAT THEY HAVE ACTUALLY PAID US, from wherever it came in.
  //
  // Not read from the orders above: a site measure fee is taken months before
  // there is an order and has no order_id to be found by, which is exactly the
  // money that was invisible on this page. See lib/pcd-customer-payments.js.
  const payments = await loadCustomerPayments(supabase, ids);

  const messageIds = (messages || []).map((m) => m.id);
  const attachmentsByMessage = new Map();
  if (messageIds.length) {
    // Chunked: PostgREST puts an "in" filter in the URL.
    for (let i = 0; i < messageIds.length; i += 100) {
      const { data: files } = await supabase
        .from("pcd_message_attachments")
        .select("*")
        .in("message_id", messageIds.slice(i, i + 100));
      for (const file of files || []) {
        const list = attachmentsByMessage.get(file.message_id) || [];
        // The public URL is worked out here rather than in the browser, so the
        // page never has to know how storage paths are built.
        const { data: url } = supabase.storage.from("attachments").getPublicUrl(file.storage_path);
        list.push({ ...file, url: url?.publicUrl || "" });
        attachmentsByMessage.set(file.message_id, list);
      }
    }
  }

  const agentsById = new Map((agents || []).map((a) => [a.id, a]));

  // Enquiries and quote requests as entries too, so a customer who filled in a
  // form before they ever emailed still shows that as the start of the story.
  const formEntries = [
    ...(enquiries || []).map((row) => ({
      id: `enquiry:${row.id}`,
      kind: "system",
      direction: "system",
      actor: "Website",
      subject: row.topic ? `Website enquiry: ${row.topic}` : "Website enquiry",
      body_html: toTermsHtml(row.message || ""),
      occurred_at: iso(row.created_at),
      action_type: "enquiry",
      enquiry_id: row.id,
    })),
    ...(requests || []).map((row) => ({
      id: `request:${row.id}`,
      kind: "system",
      direction: "system",
      actor: "Website",
      subject: `Quote request${row.product_name ? `: ${row.product_name}` : ""}`,
      body_html: requestEntryHtml(row, requestLines.get(row.id) || []),
      occurred_at: iso(row.created_at),
      action_type: "quote_request",
      quote_request_id: row.id,
    })),
  ];

  const entries = [
    ...(messages || []).map((row) => messageAsEntry(row, agentsById, attachmentsByMessage)),
    ...activityAsEntries(activity || []),
    ...formEntries,
  ].sort((a, b) => new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0));

  return {
    // The primary is the customer this desk is FOR, whichever record was asked
    // for. Opening a secondary shows the person, not half of them.
    customer: primary,
    // Every record that reads as this person, primary first. The desk lists
    // them so it is obvious which addresses reach them and how to separate one.
    contacts: group,
    tickets: tickets || [],
    entries,
    agents: agents || [],
    pendingChanges: pendingChanges || [],
    quotes: quotes || [],
    orders: orders || [],
    payments,
    stats: {
      tickets: (tickets || []).length,
      open: (tickets || []).filter((t) => t.status !== "closed").length,
      messages: (messages || []).length,
      ordered: (orders || []).reduce((sum, o) => sum + (Number(o.total_inc_gst) || 0), 0),
      paid: paymentsTotal(payments),
    },
  };
}
