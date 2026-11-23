// WHAT ALFRED KNOWS ABOUT ONE CUSTOMER, for the chat's customer_facts tool.
//
// ── EVERY FACT HAS A KEY, AND AN ANSWER MUST CITE THEM ───────────────────────
//
// Alfred may only state what is in the system. So the system hands him the
// facts, each with a key (F1, F2...), read here from the database and nowhere
// else, and an answer has to list the keys of every fact it relies on. A key
// that was never handed over refuses the answer.

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
 * The facts and recent emails for one customer.
 *
 * @returns {{ facts: {key,text}[], thread: {from,when,text}[], customerName: string,
 *            firstName: string, orderIds: string[] }}
 */
export async function customerContext(supabase, { customerId }) {
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
  // The most recent emails with this person across every thread.
  const { data: messages } = await supabase
    .from("pcd_messages")
    .select("id, direction, from_name, from_email, subject, body_html, body_text, created_at")
    .neq("direction", "note")
    .in("customer_id", ids)
    .order("created_at", { ascending: true });
  const thread = (messages || []).slice(-8).map((m) => ({
    id: m.id,
    from: m.direction === "inbound" ? "The customer" : "Us",
    when: perthDate(m.created_at, { withTime: true }),
    subject: m.subject || "",
    text: plain(m.body_html || m.body_text).slice(0, 3000),
  }));

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

  return { facts, thread, customerName, firstName, orderIds };
}
