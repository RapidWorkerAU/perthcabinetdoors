// WHAT ALFRED IS ALLOWED TO KNOW WHEN HE WRITES TO A CUSTOMER.
//
// ── EVERY FACT HAS A KEY, AND A DRAFT MUST CITE THEM ─────────────────────────
//
// Alfred may only state what is in the system. So the system hands him the
// facts, each with a key (F1, F2...), read here from the database and nowhere
// else, and a draft has to list the keys of every fact it relies on. A key that
// was never handed over refuses the draft. That is how "never says something
// untrue" is checked rather than hoped for, and it is why each draft can show
// the person approving it exactly which facts it used.
//
// ── WHAT IS NOT HERE ON PURPOSE ──────────────────────────────────────────────
//
// No supplier costs, margins, other customers, or internal notes. Alfred is
// writing to a customer, so he is only given what that customer may be told.

import { LESSON_REASONS } from "./pcd-alfred-reasons";
import { orderStage } from "./pcd-order-stage";
import { getSiteSettings } from "./pcd-site-settings-store";
import { BUSINESS_PHONE, SALES_EMAIL } from "./pcd-business-identity";
import { termsHtmlToPlainText } from "./pcd-terms-html";

const PERTH = "Australia/Perth";

export function perthDate(value, { withTime = false } = {}) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-AU", { timeZone: PERTH, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
  if (!withTime) return day;
  const time = new Intl.DateTimeFormat("en-AU", { timeZone: PERTH, hour: "numeric", minute: "2-digit" }).format(date).replace(/\s/g, "").toLowerCase();
  return `${day}, ${time}`;
}

const plain = (html) => termsHtmlToPlainText(String(html || "")).replace(/\n{3,}/g, "\n\n").trim();
const money = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
const LIVE_ORDERS = ["pending_deposit", "active", "on_hold", "complete"];

/**
 * The facts, the conversation and the examples for one customer email.
 *
 * @returns {{ facts: {key,text}[], thread: {from,when,text}[], answering: {from,when,subject,text},
 *            examples: string[], customerName: string, firstName: string, toEmail: string,
 *            orderIds: string[] }}
 */
export async function replyContext(supabase, { customerId, ticketId = null, messageId = null, focusOrderId = null, lastContactAt = null }) {
  const facts = [];
  const add = (text) => {
    const key = `F${facts.length + 1}`;
    facts.push({ key, text });
    return key;
  };

  const { data: customer } = await supabase.from("pcd_customers").select("*").eq("id", customerId).maybeSingle();
  const primaryId = customer?.merged_into_id || customerId;
  const { data: group } = await supabase.from("pcd_customers").select("id, name, email").or(`id.eq.${primaryId},merged_into_id.eq.${primaryId}`);
  const ids = (group || []).map((c) => c.id);
  if (!ids.length) ids.push(customerId);

  const customerName = String(customer?.name || "").trim();
  const firstName = /^[A-Za-z][a-z'-]+$/.test(customerName.split(/\s+/)[0] || "") ? customerName.split(/\s+/)[0] : "";
  add(`The customer is ${customerName || "unnamed"}${customer?.email ? `, email ${customer.email}` : ""}.`);
  add(`Our phone number is ${BUSINESS_PHONE} and our email is ${SALES_EMAIL}.`);

  // ── The conversation ────────────────────────────────────────────────────
  //
  // The thread being answered, or for an update with no email to answer, the
  // most recent emails with this person across every thread.
  let messageQuery = supabase
    .from("pcd_messages")
    .select("id, direction, from_name, from_email, subject, body_html, body_text, created_at")
    .neq("direction", "note");
  messageQuery = ticketId ? messageQuery.eq("ticket_id", ticketId) : messageQuery.in("customer_id", ids);
  const { data: messages } = await messageQuery.order("created_at", { ascending: true });
  const thread = (messages || []).slice(-8).map((m) => ({
    id: m.id,
    from: m.direction === "inbound" ? "The customer" : "Us",
    when: perthDate(m.created_at, { withTime: true }),
    subject: m.subject || "",
    text: plain(m.body_html || m.body_text).slice(0, 3000),
  }));
  const answering = messageId ? thread.find((m) => m.id === messageId) || thread[thread.length - 1] || null : null;

  // ── Their orders ────────────────────────────────────────────────────────
  const { data: orders } = await supabase
    .from("pcd_orders")
    .select("*")
    .in("customer_id", ids)
    .in("status", LIVE_ORDERS)
    .order("created_at", { ascending: false })
    .limit(5);
  const orderIds = (orders || []).map((o) => o.id);
  const [{ data: lines }, { data: payments }, { data: bookings }] = await Promise.all([
    orderIds.length ? supabase.from("pcd_order_line_items").select("*").in("order_id", orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from("pcd_order_payments").select("*").in("order_id", orderIds) : Promise.resolve({ data: [] }),
    supabase
      .from("pcd_calendar_events")
      .select("kind, title, starts_at, ends_at, all_day, order_id, status")
      .in("customer_id", ids)
      .gte("starts_at", new Date(Date.now() - 86400000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(6),
  ]);

  for (const order of orders || []) {
    const mine = (lines || []).filter((l) => l.order_id === order.id);
    const paid = (payments || []).filter((p) => p.order_id === order.id);
    const booked = (bookings || []).some((b) => b.order_id === order.id && b.kind === "install" && b.status !== "cancelled");
    const stage = orderStage(order, mine, { payments: paid, installBooked: booked });
    const parts = [
      `Order ${order.order_number}${order.name ? ` (${order.name})` : ""}: ${stage.label}. ${stage.why}`,
      order.scheduled_start_date ? `Scheduled start ${perthDate(order.scheduled_start_date)}.` : "",
      order.target_completion_date ? `Estimated completion ${perthDate(order.target_completion_date)}.` : "",
      `${mine.length} item${mine.length === 1 ? "" : "s"} on the order.`,
    ];
    add(parts.filter(Boolean).join(" "));
    const etas = mine.map((l) => l.supplier_eta).filter(Boolean).sort();
    if (etas.length) add(`Order ${order.order_number}: latest supplier date for materials is ${perthDate(etas[etas.length - 1])}.`);
  }
  if (!(orders || []).length) add("This customer has no orders with us yet.");

  // ── The order an update is about, in more detail ─────────────────────────
  let focus = null;
  if (focusOrderId) {
    const order = (orders || []).find((o) => o.id === focusOrderId);
    const mine = (lines || []).filter((l) => l.order_id === focusOrderId);
    if (order) {
      focus = { id: order.id, number: order.order_number, name: order.name || "" };
      add(`This update is about order ${order.order_number}${order.name ? ` (${order.name})` : ""}, status ${String(order.status).replace(/_/g, " ")}.`);
      const tally = (field) => {
        const counts = new Map();
        mine.forEach((l) => {
          const value = String(l[field] || "").trim();
          if (value) counts.set(value, (counts.get(value) || 0) + (Number(l.qty) || 1));
        });
        return [...counts].map(([value, n]) => `${n} ${value}`).join(", ");
      };
      const stages = tally("production_stage");
      const statuses = tally("status");
      if (stages) add(`Order ${order.order_number} workshop stages, by piece: ${stages}.`);
      if (statuses) add(`Order ${order.order_number} supplier status, by piece: ${statuses}.`);
    }
  }
  if (lastContactAt) {
    const lastOut = [...(messages || [])].reverse().find((m) => m.direction === "outbound");
    add(`We last emailed this customer on ${perthDate(lastContactAt)}.${lastOut ? ` That email said: "${plain(lastOut.body_html || lastOut.body_text).slice(0, 600)}"` : ""}`);
  }

  for (const booking of bookings || []) {
    if (booking.status === "cancelled") continue;
    const when = booking.all_day
      ? perthDate(booking.starts_at)
      : `${perthDate(booking.starts_at, { withTime: true })} to ${new Intl.DateTimeFormat("en-AU", { timeZone: PERTH, hour: "numeric", minute: "2-digit" }).format(new Date(booking.ends_at)).replace(/\s/g, "").toLowerCase()}`;
    add(`Booked ${booking.kind === "measure" ? "site measure" : booking.kind}: ${when}.`);
  }

  // ── Their quotes ────────────────────────────────────────────────────────
  const { data: quotes } = await supabase
    .from("pcd_quotes")
    .select("quote_number, status, sent_at, total_inc_gst, title")
    .in("customer_id", ids)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(4);
  for (const quote of quotes || []) {
    if (quote.status === "draft") continue;
    add(`Quote ${quote.quote_number}${quote.title ? ` (${quote.title})` : ""}: ${quote.status.replace(/_/g, " ")}${quote.sent_at ? `, sent ${perthDate(quote.sent_at)}` : ""}, total ${money(quote.total_inc_gst)} inc GST.`);
  }

  // ── The business ───────────────────────────────────────────────────────
  const { settings: site } = await getSiteSettings(supabase);
  if (site?.lead_time_days) add(`Our current lead time for new decorative board orders is ${site.lead_time_days} working days from when the order is confirmed.`);

  // ── How we write: our own sent emails, never the customer's ───────────────
  const { data: sent } = await supabase
    .from("pcd_messages")
    .select("body_html, body_text")
    .eq("direction", "outbound")
    .not("agent_id", "is", null)
    .is("alfred_draft_id", null)
    .order("created_at", { ascending: false })
    .limit(5);
  const examples = (sent || []).map((m) => plain(m.body_html || m.body_text).slice(0, 900)).filter((t) => t.length > 40);

  // ── What a person turned down, and why ─────────────────────────────────
  //
  // The reason picked on Decline draft is how Alfred learns. Only the reasons
  // about the writing itself: "We already rang them" says nothing about the
  // draft, so it is left out.
  const { data: declined } = await supabase
    .from("pcd_alfred_drafts")
    .select("kind, decline_reason, body_text")
    .eq("status", "declined")
    .neq("decided_by", "Alfred")
    .in("decline_reason", LESSON_REASONS)
    .not("body_text", "is", null)
    .gte("decided_at", new Date(Date.now() - 60 * 86400000).toISOString())
    .order("decided_at", { ascending: false })
    .limit(8);
  const lessons = (declined || []).map((d) => ({ reason: d.decline_reason, kind: d.kind, text: String(d.body_text || "").slice(0, 600) }));

  // ── What a person changed before sending ───────────────────────────────
  //
  // Alfred's wording beside what went out. Empty until
  // supabase/202610061600_pcd_alfred_original_body.sql has run.
  const { data: changed } = await supabase
    .from("pcd_alfred_drafts")
    .select("kind, original_body, body_text")
    .eq("status", "approved")
    .eq("edited_before_send", true)
    .not("original_body", "is", null)
    .gte("decided_at", new Date(Date.now() - 60 * 86400000).toISOString())
    .order("decided_at", { ascending: false })
    .limit(5);
  const edits = (changed || []).map((d) => ({ kind: d.kind, before: String(d.original_body || "").slice(0, 600), after: String(d.body_text || "").slice(0, 600) }));

  return {
    facts,
    thread,
    answering,
    examples,
    lessons,
    edits,
    customerName,
    firstName,
    toEmail: customer?.email || "",
    orderIds,
    focus,
  };
}
