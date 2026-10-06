// WHAT ASK ALFRED CAN LOOK UP, BEYOND A CUSTOMER'S OWN PICTURE.
//
// Every function here only reads, and returns plain lines that become numbered
// facts (see lib/pcd-alfred-ask.js). Figures, never verdicts: a count or an
// amount, never "you are behind" or "this is a good month".

import { requestLineText } from "./pcd-line-summary";
import { orderStage, ORDER_STAGES } from "./pcd-order-stage";
import { outstandingOnOrder, receivedOnOrder } from "./pcd-board-money";
import { CHANGEABLE_ORDER_STATUSES, itemChoices, loadOrderForChange, panelState } from "./pcd-alfred-changes";
import { panelsOfItem } from "./pcd-order-panel-keys";
import { customerJobs } from "./pcd-calendar-jobs";

const money = (n) => `$${(Number(n) || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => (v ? new Date(String(v).length === 10 ? `${v}T00:00:00+08:00` : v).toLocaleDateString("en-AU", { timeZone: "Australia/Perth", weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "");
const perthDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const STAGE_LABELS = ORDER_STAGES.map((s) => s.label);

// ── HOW MUCH A LOOKUP LISTS, AND SAYING SO ───────────────────────────────────
//
// A list stops at LIST_CAP so one question cannot fill Alfred's whole reading
// with rows. When it stops, it says how many there really are, so "10 orders
// are on hold" can never be said about a list that was cut at 10. Counts and
// totals are always worked out over everything, never over the part shown.
export const LIST_CAP = 50;

/** The first LIST_CAP lines, and a line saying what was left out. Pure. */
export function capped(lines, total = lines.length, cap = LIST_CAP) {
  const shown = lines.slice(0, cap);
  return total > shown.length
    ? [...shown, `Showing the first ${shown.length} of ${total}. Ask for a narrower list to see the rest.`]
    : shown;
}

/**
 * Rows for many ids, a hundred at a time. One request naming hundreds of ids
 * is too long for the database to accept, and an error there reads as "no
 * payments", which would show every order as unpaid.
 */
export async function rowsForIds(supabase, table, column, ids, select = "*") {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from(table).select(select).in(column, ids.slice(i, i + 100));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/** The lines on one order and where each is planned, with item ids to change them by. */
export async function orderItems(supabase, orderId) {
  const order = await loadOrderForChange(supabase, orderId);
  const lines = [
    `Order ${order.order_number} (order_id ${order.id}) for ${order.customer_name || "no customer"}: status ${String(order.status).replace(/_/g, " ")}, ${order.pcd_order_line_items.length} items.${CHANGEABLE_ORDER_STATUSES.includes(order.status) ? "" : " Alfred cannot change this order."}`,
  ];
  const who = itemChoices(order, "fulfilment");
  const status = itemChoices(order, "supplier_status");
  const stage = itemChoices(order, "production_stage");
  const eta = itemChoices(order, "supplier_eta");
  order.pcd_order_line_items.forEach((item, i) => {
    const parts = [
      `${who[i].label} (item_id ${item.id}, ${who[i].panels} panel${who[i].panels === 1 ? "" : "s"})`,
      `who makes it: ${who[i].now || "Supplier ready made (thermolaminated)"}`,
      status[i].eligiblePanels ? `supplier status: ${status[i].now}` : "",
      stage[i].eligiblePanels ? `workshop stage: ${stage[i].now}` : "",
      eta[i].eligiblePanels ? `ETA: ${eta[i].now}` : "",
    ].filter(Boolean);
    lines.push(parts.join("; ") + ".");
  });
  return { lines, customers: order.customer_id ? [order.customer_id] : [], orders: [order.id] };
}

/** The lines on one quote. */
export async function quoteLines(supabase, quoteId) {
  const { data: quote } = await supabase.from("pcd_quotes").select("id, quote_number, status, customer_id, customer_name, total_inc_gst").eq("id", quoteId).maybeSingle();
  if (!quote) return { lines: [`There is no quote with quote_id ${quoteId}.`] };
  const { data: rows } = await supabase.from("pcd_quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order", { ascending: true });
  return {
    customers: quote.customer_id ? [quote.customer_id] : [],
    quotes: [quote.id],
    lines: [
      `Quote ${quote.quote_number} (quote_id ${quote.id}) for ${quote.customer_name || "no customer"}: status ${quote.status}, total ${money(quote.total_inc_gst)} inc GST, ${(rows || []).length} lines.`,
      ...(rows || []).map((r, i) => `Line ${i + 1}: ${requestLineText(r)}${r.line_total_ex_gst != null ? `, ${money(r.line_total_ex_gst)} ex GST` : ""}.`),
    ],
  };
}

/** Orders with money still owing. */
export async function moneyOwing(supabase) {
  const { data: orders } = await supabase
    .from("pcd_orders")
    .select("id, order_number, customer_id, customer_name, status, total_inc_gst")
    .in("status", ["pending_deposit", "active", "on_hold", "complete"]);
  const ids = (orders || []).map((o) => o.id);
  const payments = await rowsForIds(supabase, "pcd_order_payments", "order_id", ids);
  const owing = (orders || [])
    .map((o) => {
      const mine = (payments || []).filter((p) => p.order_id === o.id);
      return { o, received: receivedOnOrder(mine), owing: outstandingOnOrder(o.total_inc_gst, mine) };
    })
    .filter((x) => x.owing > 0.009)
    .sort((a, b) => b.owing - a.owing);
  const total = owing.reduce((s, x) => s + x.owing, 0);
  return {
    customers: owing.map((x) => x.o.customer_id).filter(Boolean),
    lines: [
      `${owing.length} orders have money owing, ${money(total)} in all.`,
      ...capped(owing.map((x) => `Order ${x.o.order_number} for ${x.o.customer_name || "no name"} (${String(x.o.status).replace(/_/g, " ")}): total ${money(x.o.total_inc_gst)}, received ${money(x.received)}, owing ${money(x.owing)}.`)),
    ],
  };
}

/** Supplier made panels not yet received, across open orders. */
export async function supplierOrders(supabase, { supplier = "" } = {}) {
  const { data: orders } = await supabase.from("pcd_orders").select("id, order_number, customer_name, status").in("status", CHANGEABLE_ORDER_STATUSES);
  const ids = (orders || []).map((o) => o.id);
  const items = await rowsForIds(supabase, "pcd_order_line_items", "order_id", ids);
  const today = perthDay();
  const want = String(supplier || "").trim().toLowerCase();
  const rows = [];
  for (const item of items || []) {
    const order = orders.find((o) => o.id === item.order_id);
    const waiting = panelsOfItem(item)
      .map((p) => ({ ...panelState(item, p.panelKey), plan: (item.panel_planning || {})[p.panelKey] || {} }))
      .filter((s) => s.fulfilment === "supplier_ready_made" && ["Not Ordered", "Ordered"].includes(s.status));
    if (!waiting.length) continue;
    const name = String(waiting[0].plan.supplier_name || item.supplier_name || "").trim();
    if (want && !name.toLowerCase().includes(want)) continue;
    const etas = [...new Set(waiting.map((s) => s.supplier_eta).filter(Boolean))].sort();
    const late = etas.filter((e) => e < today).length;
    const notOrdered = waiting.filter((s) => s.status === "Not Ordered").length;
    rows.push(
      `Order ${order.order_number} for ${order.customer_name || "no name"}, ${requestLineText(item)}: ${waiting.length} panel${waiting.length === 1 ? "" : "s"} from ${name || "no supplier set"}` +
        `${notOrdered ? `, ${notOrdered} not ordered yet` : ""}${etas.length ? `, ETA ${etas.map(day).join(" and ")}` : ", no ETA"}${late ? `, ETA passed` : ""}.`
    );
  }
  return { lines: rows.length ? [`${rows.length} order lines are waiting on a supplier.`, ...capped(rows)] : ["Nothing is waiting on a supplier."] };
}

/** Bookings and order starts between two Perth days, inclusive. */
export async function calendar(supabase, { from, to } = {}) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(from || "")) ? from : perthDay();
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(to || "")) ? to : start;
  const [{ data: bookings, count: bookingCount }, { data: starts }] = await Promise.all([
    supabase
      .from("pcd_calendar_events")
      .select("id, kind, title, starts_at, all_day, customer_id, customer_name, site_address, status", { count: "exact" })
      .gte("starts_at", `${start}T00:00:00+08:00`)
      .lte("starts_at", `${end}T23:59:59+08:00`)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(LIST_CAP),
    supabase.from("pcd_orders").select("order_number, customer_name, scheduled_start_date").gte("scheduled_start_date", start).lte("scheduled_start_date", end).in("status", CHANGEABLE_ORDER_STATUSES),
  ]);
  const time = (v) => new Date(v).toLocaleString("en-AU", { timeZone: "Australia/Perth", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const lines = [
    ...capped((bookings || []).map((b) => `${b.kind || "Booking"} (booking_id ${b.id}): ${b.title || b.customer_name || ""}${b.customer_id ? ` (customer_id ${b.customer_id})` : ""}, ${b.all_day ? `${day(b.starts_at)}, all day` : time(b.starts_at)}${b.site_address ? `, at ${b.site_address}` : ""}${b.status === "done" ? ", done" : ""}.`), bookingCount ?? (bookings || []).length),
    ...(starts || []).map((o) => `Order ${o.order_number} for ${o.customer_name || "no name"} is scheduled to start ${day(o.scheduled_start_date)}.`),
  ];
  return {
    customers: (bookings || []).map((b) => b.customer_id).filter(Boolean),
    lines: lines.length ? [`Between ${day(start)} and ${day(end)}:`, ...lines] : [`Nothing is booked between ${day(start)} and ${day(end)}.`],
  };
}

/** A customer's open jobs, the ones a booking can go against (the booking form's list). */
export async function jobsForBooking(supabase, customerId) {
  const { data: customer } = await supabase.from("pcd_customers").select("id, name").eq("id", customerId).maybeSingle();
  if (!customer) return { lines: [`There is no customer with customer_id ${customerId}.`] };
  const jobs = await customerJobs(supabase, customer.id);
  return {
    customers: [customer.id],
    orders: jobs.filter((j) => j.kind === "order").map((j) => j.id),
    quotes: jobs.filter((j) => j.kind === "quote").map((j) => j.id),
    lines: jobs.length
      ? [
          `${customer.name || "This customer"} has ${jobs.length} job${jobs.length === 1 ? "" : "s"} a booking can go against.`,
          ...capped(jobs.map((j) => `${j.kind === "order" ? `Order ${j.reference} (order_id ${j.id})` : `Quote ${j.reference} (quote_id ${j.id})`}${j.name ? `, ${j.name}` : ""}: ${String(j.status).replace(/_/g, " ")}${j.becameOrder ? ", now an order" : ""}${j.siteAddress ? `, at ${j.siteAddress}` : ""}.`)),
        ]
      : [`${customer.name || "This customer"} has no open order or quote. A booking can still be made for them without a job.`],
  };
}

/** New enquiries and quote requests nobody has quoted. */
export async function requestsAndEnquiries(supabase) {
  const [{ data: enquiries, count: enquiryCount }, { data: requests, count: requestCount }] = await Promise.all([
    supabase.from("pcd_enquiries").select("customer_id, customer_name, topic, created_at", { count: "exact" }).eq("status", "new").order("created_at", { ascending: true }).limit(LIST_CAP),
    supabase.from("pcd_quote_requests").select("customer_name, created_at, status", { count: "exact" }).in("status", ["new", "reviewing"]).is("converted_quote_id", null).order("created_at", { ascending: true }).limit(LIST_CAP),
  ]);
  const enquiryTotal = enquiryCount ?? (enquiries || []).length;
  const requestTotal = requestCount ?? (requests || []).length;
  return {
    customers: (enquiries || []).map((e) => e.customer_id).filter(Boolean),
    lines: [
      `${enquiryTotal} new website enquiries.`,
      ...capped((enquiries || []).map((e) => `Enquiry from ${e.customer_name || "no name"}${e.topic ? ` about ${e.topic}` : ""}, ${day(e.created_at)}.`), enquiryTotal),
      `${requestTotal} quote requests not yet quoted.`,
      ...capped((requests || []).map((r) => `Quote request from ${r.customer_name || "no name"}, ${day(r.created_at)}, ${r.status}.`), requestTotal),
    ],
  };
}

/** Figures for one month. Counts and totals only. */
export async function monthFigures(supabase, { month = "" } = {}) {
  const m = /^\d{4}-\d{2}$/.test(String(month)) ? month : perthDay().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  const from = `${m}-01T00:00:00+08:00`;
  const to = `${next}-01T00:00:00+08:00`;
  const [{ data: sent }, { data: orders }, { data: paid }] = await Promise.all([
    supabase.from("pcd_quotes").select("total_inc_gst").gte("sent_at", from).lt("sent_at", to),
    supabase.from("pcd_orders").select("total_inc_gst, status").gte("created_at", from).lt("created_at", to).neq("status", "cancelled"),
    supabase.from("pcd_order_payments").select("*").gte("paid_at", from).lt("paid_at", to),
  ]);
  const sum = (rows) => (rows || []).reduce((s, r) => s + (Number(r.total_inc_gst) || 0), 0);
  const label = new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    lines: [
      `${label}: ${(sent || []).length} quotes sent, ${money(sum(sent))} inc GST in all.`,
      `${label}: ${(orders || []).length} orders raised, ${money(sum(orders))} inc GST in all.`,
      `${label}: ${money(receivedOnOrder(paid || []))} received in payments, after refunds.`,
    ],
  };
}

/** Open orders and the stage each is at, as the board shows it. Optionally only one stage. */
export async function openOrders(supabase, { stage = "" } = {}) {
  const { data: orders } = await supabase
    .from("pcd_orders")
    .select("*")
    .in("status", CHANGEABLE_ORDER_STATUSES)
    .order("created_at", { ascending: true });
  const ids = (orders || []).map((o) => o.id);
  const [items, payments, bookings] = await Promise.all([
    rowsForIds(supabase, "pcd_order_line_items", "order_id", ids),
    rowsForIds(supabase, "pcd_order_payments", "order_id", ids),
    rowsForIds(supabase, "pcd_calendar_events", "order_id", ids, "order_id, kind, status"),
  ]);
  const want = String(stage || "").trim().toLowerCase();
  const rows = (orders || [])
    .map((o) => {
      const s = orderStage(o, (items || []).filter((i) => i.order_id === o.id), {
        payments: (payments || []).filter((p) => p.order_id === o.id),
        installBooked: (bookings || []).some((b) => b.order_id === o.id && b.kind === "install" && b.status !== "cancelled"),
      });
      return { o, s };
    })
    .filter(({ s }) => !want || String(s.label).toLowerCase() === want);
  return {
    customers: rows.map((r) => r.o.customer_id).filter(Boolean),
    orders: rows.map((r) => r.o.id),
    lines: rows.length
      ? [`${rows.length} open orders${want ? ` at ${stage}` : ""}.`, ...capped(rows.map(({ o, s }) => `Order ${o.order_number} (order_id ${o.id}) for ${o.customer_name || "no name"}${o.customer_id ? ` (customer_id ${o.customer_id})` : ""}: ${s.label}.`))]
      : [`No open orders${want ? ` at ${stage}` : ""}.`],
  };
}
