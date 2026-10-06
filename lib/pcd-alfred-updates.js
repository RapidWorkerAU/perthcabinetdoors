// ALFRED'S SECOND JOB: KEEP ACTIVE ORDERS UPDATED BEFORE THE GAP RUNS OUT.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Every active or on hold order should hear from us at least every 10 days
// (Settings, Alfred). Alfred prepares the update two days before the limit, so
// it is waiting for a person in good time.
//
// THE CLOCK RUNS FROM THE LAST REAL UPDATE: an email a person wrote or approved
// (a reply from the customer page, Outlook, or Alfred's draft once approved),
// or the Customer Updates report. A quote, an invoice, a payment request or a
// review request is not news about the job and does not restart it. See
// supabase/202610061200_pcd_alfred_updates.sql. An order nobody has written
// about yet runs from the day it was raised.
//
// Pending deposit orders are left alone: the deposit reminders already chase
// them, and two jobs writing to one person about one order is how somebody gets
// an "act now" and a "thanks" in the same hour.
//
// ── NO NEWS MEANS A QUESTION, NEVER A FILLER EMAIL ───────────────────────────
//
// If nothing has happened on the order since we last wrote (no stage change, no
// booking, no planning update), Alfred does not write "still going!". He asks
// a person whether it is on track, and drafts from the answer. A person can
// also say they will update the customer themselves, and then nothing is made.
//
// Nothing is sent. Drafts wait for approval like every other draft.

import { logOrderActivity } from "./pcd-activity-log";
import { replyContext, perthDate } from "./pcd-alfred-context";
import { askForReply } from "./pcd-alfred-model";

const DAY = 86400000;
export const UPDATE_STATUSES = ["active", "on_hold"];
// The kinds of activity that are NOT news about the job: our own updates and
// Alfred's work, money and automatic emails.
const NOT_NEWS = /^(alfred_|customer_update_sent|review_|payment|deposit|order_viewed|quote_)/;

const perthDay = (value) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

/** Whole Perth days between two moments. */
export function perthDaysBetween(from, to = new Date()) {
  const a = new Date(`${perthDay(from)}T00:00:00+08:00`).getTime();
  const b = new Date(`${perthDay(to)}T00:00:00+08:00`).getTime();
  return Math.round((b - a) / DAY);
}

/**
 * Where an order is against the gap. Pure, so it is tested without a database.
 * @returns { daysSince, dueIn, due, lastContactAt }
 */
export function updateClock(order, lastContactAt, gapDays, now = new Date()) {
  const since = lastContactAt || order.created_at;
  const daysSince = perthDaysBetween(since, now);
  return { daysSince, dueIn: gapDays - daysSince, due: daysSince >= gapDays - 2, lastContactAt: lastContactAt || null };
}

/** The email kinds that count as keeping somebody posted. */
export function countsAsUpdate(message) {
  return message.direction === "outbound" && (message.sent_as === undefined || message.sent_as === null || message.sent_as === "reply");
}

/**
 * The last real update to each order's customer, across every record that reads
 * as that person.
 * @returns Map orderId -> ISO date or null
 */
export async function lastContactForOrders(supabase, orders) {
  const customerIds = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const result = new Map(orders.map((o) => [o.id, null]));
  if (!customerIds.length) return result;

  // A FEW CUSTOMERS AT A TIME. The database hands back at most a thousand rows
  // a request, and every sent email for every active customer at once passes
  // that quietly: the newest emails were the ones dropped, so a customer
  // written to yesterday could read as due an update. Twenty five customers a
  // request, newest emails first, stays well inside it.
  const groupOf = new Map();
  const messages = [];
  const reports = [];
  for (let i = 0; i < customerIds.length; i += 25) {
    const chunk = customerIds.slice(i, i + 25);
    // Everyone who reads as each customer: the record and anything merged into it.
    const { data: people } = await supabase
      .from("pcd_customers")
      .select("id, merged_into_id")
      .or(`id.in.(${chunk.join(",")}),merged_into_id.in.(${chunk.join(",")})`);
    (people || []).forEach((p) => groupOf.set(p.id, p.merged_into_id || p.id));
    const ids = [...new Set([...(people || []).map((p) => p.id), ...chunk])];

    // Sent emails. A database without the sent_as column counts every email.
    const withKind = await supabase
      .from("pcd_messages")
      .select("customer_id, direction, sent_as, created_at")
      .in("customer_id", ids)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (withKind.error) {
      const plain = await supabase
        .from("pcd_messages")
        .select("customer_id, direction, created_at")
        .in("customer_id", ids)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(1000);
      messages.push(...(plain.data || []));
    } else {
      messages.push(...(withKind.data || []));
    }
    const { data: sentReports } = await supabase
      .from("pcd_order_activity")
      .select("customer_id, created_at")
      .in("customer_id", ids)
      .eq("action_type", "customer_update_sent")
      .order("created_at", { ascending: false })
      .limit(1000);
    reports.push(...(sentReports || []));
  }

  const latestByGroup = new Map();
  const consider = (customerId, at) => {
    const group = groupOf.get(customerId) || customerId;
    if (!latestByGroup.has(group) || String(at) > String(latestByGroup.get(group))) latestByGroup.set(group, at);
  };
  messages.filter(countsAsUpdate).forEach((m) => consider(m.customer_id, m.created_at));
  reports.forEach((r) => consider(r.customer_id, r.created_at));

  orders.forEach((o) => {
    const group = groupOf.get(o.customer_id) || o.customer_id;
    result.set(o.id, latestByGroup.get(group) || null);
  });
  return result;
}

/**
 * Every active or on hold order and where it stands against the gap.
 * @returns [{ order, customerName, ...updateClock }] soonest due first
 */
export async function ordersAgainstTheGap(supabase, settings, now = new Date()) {
  const { data: orders } = await supabase
    .from("pcd_orders")
    .select("id, order_number, name, status, customer_id, customer_name, customer_email, created_at")
    .in("status", UPDATE_STATUSES)
    .not("customer_id", "is", null);
  const list = (orders || []).filter((o) => String(o.customer_email || "").trim());
  const last = await lastContactForOrders(supabase, list);
  return list
    .map((order) => ({ order, customerName: order.customer_name || "", ...updateClock(order, last.get(order.id), settings.update_gap_days, now) }))
    .sort((a, b) => a.dueIn - b.dueIn);
}

/** Has anything happened on this order since we last wrote? */
export async function newsSince(supabase, orderId, since) {
  if (!since) return true;
  const [{ data: activity }, { data: bookings }] = await Promise.all([
    supabase.from("pcd_order_activity").select("action_type, actor_type").eq("order_id", orderId).gt("created_at", since),
    supabase.from("pcd_calendar_events").select("id").eq("order_id", orderId).gt("created_at", since).limit(1),
  ]);
  const real = (activity || []).filter((a) => a.actor_type !== "alfred" && a.actor_type !== "customer" && !NOT_NEWS.test(String(a.action_type || "")));
  return real.length > 0 || Boolean((bookings || []).length);
}

export const updateSourceKey = (orderId, lastContactAt) => `update:${orderId}:${lastContactAt ? perthDay(lastContactAt) : "none"}`;

/** The question asked when nothing has happened since we last wrote. */
export function noNewsQuestion(entry, targetDate) {
  const when = entry.lastContactAt ? `since we last wrote on ${perthDate(entry.lastContactAt)}` : "since the order was raised";
  return {
    question: `Nothing has changed on ${entry.order.order_number} ${when}. Is it on track?`,
    why: `${entry.customerName || "The customer"} is due an update in ${Math.max(0, entry.dueIn)} day${entry.dueIn === 1 ? "" : "s"}. Alfred will not send an update with no news in it, so he needs to know where it is up to.`,
    options: [
      targetDate ? `Yes, on track for ${perthDate(targetDate)}` : "Yes, it is on track",
      "It is running a little late",
      "I will update them myself",
    ],
  };
}

/** Draft (or ask about) one order's update. */
export async function draftOneUpdate(supabase, entry, { answer = "", client } = {}) {
  const { order } = entry;
  const sourceKey = updateSourceKey(order.id, entry.lastContactAt);
  const context = await replyContext(supabase, {
    customerId: order.customer_id,
    focusOrderId: order.id,
    lastContactAt: entry.lastContactAt,
  });
  const reply = await askForReply(context, { answer, client, task: "update" });
  const spent = { input: reply.usage?.input_tokens || 0, output: reply.usage?.output_tokens || 0, cost: reply.cost || 0 };
  if (!reply.ok) return { made: "problem", problem: reply.problem, spent };

  const base = { source_key: sourceKey, customer_id: order.customer_id, order_id: order.id };
  const { result } = reply;
  if (result.decision === "question") {
    const { error } = await supabase.from("pcd_alfred_questions").insert({ ...base, question: result.question, why: result.why, options: result.options });
    return error ? { made: "problem", problem: error.message, spent } : { made: "question", spent };
  }
  if (result.decision === "skip") return { made: "skip", spent };

  const { data: saved, error } = await supabase
    .from("pcd_alfred_drafts")
    .insert({
      ...base,
      kind: "update",
      to_email: context.toEmail,
      subject: result.subject || `An update on your order ${order.order_number}`,
      body_text: result.body,
      why: result.why || `No update for ${entry.daysSince} days. Your limit is ${entry.daysSince + entry.dueIn}.`,
      facts: result.facts,
      checks: [
        "Goes only to the email on this customer's record",
        `Every fact traced to the system (${result.facts.length})`,
        "Something has changed since our last email",
      ],
      model: reply.model,
      input_tokens: spent.input,
      output_tokens: spent.output,
      cost_usd: spent.cost,
    })
    .select("id")
    .single();
  if (error) return { made: "problem", problem: error.message, spent };
  await logOrderActivity(supabase, {
    order_id: order.id,
    customer_id: order.customer_id,
    actor_type: "alfred",
    action_type: "alfred_drafted_update",
    title: "Update drafted by Alfred",
    description: `Waiting for approval. ${entry.daysSince} days since the last update.`,
    metadata: { draft_id: saved.id },
    event_key: `alfred:draft:${saved.id}`,
  });
  return { made: "draft", draftId: saved.id, spent };
}

/**
 * The morning pass for updates.
 * @returns { drafts, questions, problems, cost, input, output, due }
 */
export async function runOrderUpdates(supabase, settings, { now = new Date(), room = Infinity, client } = {}) {
  const out = { drafts: 0, questions: 0, problems: [], cost: 0, input: 0, output: 0, due: [] };
  const all = await ordersAgainstTheGap(supabase, settings, now);
  out.due = all.filter((e) => e.due);
  if (!out.due.length) return out;

  const keys = out.due.map((e) => updateSourceKey(e.order.id, e.lastContactAt));
  const [{ data: drafted }, { data: asked }] = await Promise.all([
    supabase.from("pcd_alfred_drafts").select("source_key").in("source_key", keys).in("status", ["waiting", "approved", "declined"]),
    supabase.from("pcd_alfred_questions").select("source_key").in("source_key", keys).in("status", ["open", "answered"]),
  ]);
  const done = new Set([...(drafted || []), ...(asked || [])].map((r) => r.source_key));

  for (const entry of out.due) {
    if (room <= 0) break;
    const key = updateSourceKey(entry.order.id, entry.lastContactAt);
    if (done.has(key)) continue;
    try {
      if (!(await newsSince(supabase, entry.order.id, entry.lastContactAt))) {
        const { data: full } = await supabase.from("pcd_orders").select("target_completion_date").eq("id", entry.order.id).maybeSingle();
        const q = noNewsQuestion(entry, full?.target_completion_date);
        const { error } = await supabase.from("pcd_alfred_questions").insert({
          source_key: key,
          customer_id: entry.order.customer_id,
          order_id: entry.order.id,
          ...q,
        });
        if (error) out.problems.push(`${entry.order.order_number}: ${error.message}`);
        else out.questions += 1;
        continue;
      }
      const result = await draftOneUpdate(supabase, entry, { client });
      out.input += result.spent.input;
      out.output += result.spent.output;
      out.cost += result.spent.cost;
      if (result.made === "draft") {
        out.drafts += 1;
        room -= 1;
      } else if (result.made === "question") out.questions += 1;
      else if (result.made === "problem") out.problems.push(`${entry.order.order_number}: ${result.problem}`);
    } catch (error) {
      out.problems.push(`${entry.order.order_number}: ${error?.message || error}`);
    }
  }
  out.cost = Number(out.cost.toFixed(4));
  return out;
}

/** Update drafts that have gone stale: somebody wrote since, or the order moved on. */
export async function staleUpdateReason(supabase, draft) {
  const { data: order } = await supabase.from("pcd_orders").select("status, customer_id").eq("id", draft.order_id).maybeSingle();
  if (!order || !UPDATE_STATUSES.includes(order.status)) return "The order is no longer active, so this update was not needed.";
  const last = await lastContactForOrders(supabase, [{ id: draft.order_id, customer_id: order.customer_id }]);
  const at = last.get(draft.order_id);
  if (at && String(at) > String(draft.created_at)) return "Somebody had already written to them since this was drafted.";
  return "";
}

/** One question answered about an update. */
export async function answerUpdateQuestion(supabase, question, answer, { client } = {}) {
  if (/myself/i.test(answer)) return { made: "nothing", spent: { input: 0, output: 0, cost: 0 } };
  const { data: order } = await supabase
    .from("pcd_orders")
    .select("id, order_number, name, status, customer_id, customer_name, customer_email, created_at")
    .eq("id", question.order_id)
    .maybeSingle();
  if (!order) return { made: "nothing", spent: { input: 0, output: 0, cost: 0 } };
  const last = await lastContactForOrders(supabase, [order]);
  const { data: settingsRow } = await supabase.from("pcd_alfred_settings").select("settings").eq("id", "main").maybeSingle();
  const gap = Number(settingsRow?.settings?.update_gap_days) || 10;
  const entry = { order, customerName: order.customer_name || "", ...updateClock(order, last.get(order.id), gap) };
  return draftOneUpdate(supabase, entry, { answer, client });
}
