// WHO HAS HAD SOMETHING HAPPEN, AND WHAT.
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
//
// Reporting, weekly customer updates. It answers one question: which customers'
// orders changed in a period, and what would we tell them. The wording itself
// lives in pcd-update-wording.js; this file only decides WHICH changes count
// and rolls them up into something a person can read.
//
// ── THE ROLL UP IS THE WHOLE POINT ───────────────────────────────────────────
//
// pcd_order_activity writes ONE ROW PER LINE ITEM. Marking ten doors as Ordered
// writes ten near identical rows, and an email listing all ten is not a summary
// of anything. So rows are grouped by what changed, what it changed to, and the
// day it happened, and the pieces are counted off the line items:
//
//     ten rows  ->  "10 x Profiled doors ordered on 20 August 2026"
//
// ── NOTHING IS SENT TWICE, AND NOTHING IS MISSED ─────────────────────────────
//
// The table shows the date range you chose. The EMAIL covers everything since
// the last update actually sent to that customer, which is read back out of the
// activity log rather than stored on the customer. A skipped week is caught up
// on its own; a customer who was updated on Tuesday does not hear about Monday
// again on Friday.
//
// ── SENDING IS ALWAYS A PERSON ───────────────────────────────────────────────
//
// Nothing here sends anything. There is no cron, no trigger, no schedule. This
// builds a report; somebody reads it, opens the email, edits it and presses
// send. See app/api/admin/reporting/customer-updates/send/route.js.

import { sentenceFor } from "./pcd-update-wording";

/** The action_type we write when an update actually goes out. */
export const UPDATE_SENT_ACTION = "customer_update_sent";

/**
 * The events worth reading at all.
 *
 * A curated list rather than a blocklist: a new action_type added next year is
 * silent until somebody decides what it should say, which is the safe direction
 * for something that emails customers.
 */
export const CUSTOMER_FACING_ACTIONS = [
  "order_item_updated",
  "order_updated",
  "payment_received",
  "payment_settled_outside_link",
  "variation_applied",
  "issue_raised",
];

/**
 * order_updated logs every field edit on an order in one description string.
 * Only these three are worth a customer's time; the rest are corrections,
 * renames and internal references.
 */
const ORDER_FIELD_SENTENCES = [
  { match: /Scheduled start changed from .* to (.+?)(?:;|$)/i, kind: "scheduled_start" },
  { match: /Target completion changed from .* to (.+?)(?:;|$)/i, kind: "target_completion" },
];

/**
 * The amount out of an activity description.
 *
 * THE DOLLAR SIGN IS NOT OPTIONAL. Without it this matched the first run of
 * digits in the string, and a variation logged as "PCD-V-2026-5051F3 - $719.95"
 * came out as $2,026.00: the YEAR out of the reference number, invoiced back to
 * the customer in an email. Anchoring on the $ is what makes it the money.
 *
 * AND THE MINUS MUST TOUCH THE $. These descriptions separate their parts with
 * " - ", so allowing a gap read that separator as a minus sign and turned a
 * $719.95 addition into a $719.95 credit. A credit note nobody issued is a
 * worse email than a wrong number.
 *
 *   "PCD-V-2026-5051F3 - $719.95"    ->   719.95
 *   "PCD-V-2026-4F8313 - -$472.52"   ->  -472.52
 */
const money = (value) => {
  if (typeof value === "number") return value;
  const found = String(value || "").match(/(-?)\$\s*([\d,]+(?:\.\d+)?)/);
  if (!found) return 0;
  return Number(found[2].replace(/,/g, "")) * (found[1] === "-" ? -1 : 1);
};

const dayOf = (iso) => String(iso || "").slice(0, 10);

/**
 * Turn one activity row into zero or more normalised changes.
 *
 * Zero is the common case and it is not a failure: most of what the log records
 * is internal, and this is where that gets decided.
 */
function changesFromRow(row, itemsById) {
  const at = row.created_at;
  const desc = String(row.description || "");
  const out = [];

  if (row.action_type === "payment_received") {
    out.push({
      kind: "payment_received", at,
      label: (desc.split(" - ")[0] || "payment").trim(),
      amount: money(desc),
    });
    return out;
  }

  if (row.action_type === "payment_settled_outside_link") {
    out.push({
      kind: "payment_outside", at,
      label: desc.replace(/^Paid by\s*/i, "").trim() || "bank transfer",
      amount: money(row.metadata?.amount ?? desc),
    });
    return out;
  }

  if (row.action_type === "variation_applied") {
    out.push({
      kind: "variation_applied", at,
      reference: (desc.split(" - ")[0] || "").trim(),
      amount: money(desc),
    });
    return out;
  }

  if (row.action_type === "issue_raised") {
    // The detail is deliberately dropped here rather than in the wording: it is
    // written for the workshop and there is no safe way to forward it.
    out.push({ kind: "issue_raised", at });
    return out;
  }

  if (row.action_type === "order_updated") {
    if (/Status changed from .* to complete/i.test(desc)) out.push({ kind: "order_complete", at });
    if (/Status changed from .* to on_hold/i.test(desc)) out.push({ kind: "order_hold", at });
    ORDER_FIELD_SENTENCES.forEach(({ match, kind }) => {
      const m = desc.match(match);
      if (m && m[1] && m[1].trim().toLowerCase() !== "blank") out.push({ kind, at, to: m[1].trim() });
    });
    // Everything else on an order_updated row is an internal edit. Kept so the
    // review screen can say how many were hidden rather than silently dropping
    // them, which would make the count on screen disagree with the count in the
    // order history.
    if (!out.length) out.push({ kind: "internal", at, detail: desc });
    return out;
  }

  if (row.action_type === "order_item_updated") {
    const item = itemsById.get(row.metadata?.item_id) || null;
    const qty = Math.max(1, Number(item?.qty) || 1);
    const label = item?.title || item?.product_type || "items";

    // describeChanges writes "Label changed from X to Y", joined with "; ".
    desc.split(";").forEach((part) => {
      const text = part.trim();
      let m;

      if ((m = text.match(/^Status changed from (.+?) to (.+)$/i))) {
        out.push({ kind: "item_status", at, from: m[1].trim(), to: m[2].trim(), qty, itemLabel: label, on: dayOf(at) });
      } else if ((m = text.match(/^Supplier ETA changed from (.+?) to (.+)$/i))) {
        const from = m[1].trim();
        const to = m[2].trim();
        if (to.toLowerCase() === "blank") return;
        out.push(
          from.toLowerCase() === "blank"
            ? { kind: "item_eta_set", at, to }
            : { kind: "item_eta_moved", at, from, to }
        );
      } else if ((m = text.match(/^Production stage changed from (.+?) to (.+)$/i))) {
        out.push({ kind: "item_stage", at, to: m[2].trim(), qty, itemLabel: label });
      }
      // Fulfilment, supplier name, supplier ref, the board fields and the
      // production notes all fall through. See NEVER_SENT in the wording module.
    });

    if (!out.length) out.push({ kind: "internal", at, detail: desc });
    return out;
  }

  return out;
}

/**
 * Collapse the per item rows into one line each.
 *
 * Grouped by what changed, what it changed to and the DAY, so a run of doors
 * marked off across an afternoon is one line, while the same status set again a
 * week later is properly its own.
 */
function rollUp(changes) {
  const rolled = [];
  const buckets = new Map();

  changes.forEach((change) => {
    const rollable = change.kind === "item_status" || change.kind === "item_stage";
    if (!rollable) {
      rolled.push(change);
      return;
    }
    const key = [change.kind, change.to, change.itemLabel, dayOf(change.at)].join("|");
    const seen = buckets.get(key);
    if (seen) {
      seen.qty += change.qty;
      // The earliest time on the day, so the line sorts where the work started.
      if (change.at < seen.at) seen.at = change.at;
      return;
    }
    const copy = { ...change };
    buckets.set(key, copy);
    rolled.push(copy);
  });

  return rolled.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * The report.
 *
 * @param {object} supabase  admin client
 * @param {object} input
 * @param {string} input.from  ISO date, inclusive
 * @param {string} input.to    ISO date, inclusive
 * @returns {Promise<{rows: Array, from: string, to: string}>}
 */
export async function loadCustomerUpdates(supabase, { from, to }) {
  // Inclusive of the whole closing day. A range ending "today" that stopped at
  // midnight would miss everything that happened during it.
  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const { data: activity, error } = await supabase
    .from("pcd_order_activity")
    .select("*")
    .in("action_type", CUSTOMER_FACING_ACTIONS)
    .not("order_id", "is", null)
    .gte("created_at", fromTs)
    .lte("created_at", toTs)
    .order("created_at", { ascending: false });
  if (error) throw error;

  if (!activity?.length) return { rows: [], from, to };

  const orderIds = [...new Set(activity.map((a) => a.order_id))];
  const [ordersResult, itemsResult] = await Promise.all([
    // NO currency COLUMN HERE. pcd_orders does not have one, and asking for it
    // failed the whole lookup: every row was then skipped for having no order,
    // and the report came back empty. An empty report does not look like a
    // fault, it looks like a quiet week, which is how a wrong column name
    // silently turns into "nobody needs an update this week".
    supabase
      .from("pcd_orders")
      .select("id, order_number, name, status, customer_id, customer_name, customer_email")
      .in("id", orderIds),
    // qty and title, so a rolled up line can say "10 x Profiled doors" rather
    // than "10 x items". The activity row records which item changed but not
    // how many pieces that line covers.
    supabase.from("pcd_order_line_items").select("id, qty, title, product_type").in("order_id", orderIds),
  ]);

  // THROWN, NOT SWALLOWED. This report decides who gets contacted, so silence
  // is the one answer it must never give by accident.
  if (ordersResult.error) throw ordersResult.error;
  if (itemsResult.error) throw itemsResult.error;
  const orders = ordersResult.data;
  const items = itemsResult.data;

  const orderById = new Map((orders || []).map((o) => [o.id, o]));
  const itemsById = new Map((items || []).map((i) => [i.id, i]));

  // When each customer was last actually told something. Read back out of the
  // log rather than stored on the customer, so there is one truth and no column
  // to keep in step.
  const { data: sends } = await supabase
    .from("pcd_order_activity")
    .select("customer_id, created_at")
    .eq("action_type", UPDATE_SENT_ACTION)
    .order("created_at", { ascending: false });
  const lastSent = new Map();
  (sends || []).forEach((s) => {
    if (s.customer_id && !lastSent.has(s.customer_id)) lastSent.set(s.customer_id, s.created_at);
  });

  const byCustomer = new Map();

  activity.forEach((row) => {
    const order = orderById.get(row.order_id);
    if (!order) return;
    // Keyed on the customer record where there is one, and on the order's email
    // otherwise, so a job raised before the customer was linked still appears
    // rather than vanishing from the report.
    const key = order.customer_id || `email:${(order.customer_email || "").toLowerCase()}`;
    if (!key || key === "email:") return;

    const changes = changesFromRow(row, itemsById);
    if (!changes.length) return;

    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        key,
        customerId: order.customer_id || null,
        name: order.customer_name || "",
        email: order.customer_email || "",
        // Not read off the order, which has no such column. Every job is priced
        // in AUD and the money formatter defaults to it anyway; this is here so
        // a future multi currency change has one place to start.
        currency: "AUD",
        lastSentAt: order.customer_id ? lastSent.get(order.customer_id) || null : null,
        orders: new Map(),
      });
    }
    const cust = byCustomer.get(key);

    if (!cust.orders.has(order.id)) {
      cust.orders.set(order.id, {
        id: order.id,
        number: order.order_number,
        name: order.name,
        status: order.status,
        changes: [],
      });
    }
    cust.orders.get(order.id).changes.push(...changes.map((c) => ({ ...c, currency: cust.currency })));
  });

  const rows = [...byCustomer.values()]
    .map((cust) => {
      const orders = [...cust.orders.values()].map((o) => ({ ...o, changes: rollUp(o.changes) }));
      const all = orders.flatMap((o) => o.changes);
      const reportable = all.filter((c) => c.kind !== "internal");
      return {
        key: cust.key,
        customerId: cust.customerId,
        name: cust.name,
        email: cust.email,
        currency: cust.currency,
        lastSentAt: cust.lastSentAt,
        orders,
        updateCount: reportable.length,
        internalCount: all.length - reportable.length,
        latestAt: all.reduce((max, c) => (c.at > max ? c.at : max), ""),
      };
    })
    // A customer whose only activity was internal edits is not somebody to
    // email, and putting them on the list makes the list untrustworthy.
    .filter((r) => r.updateCount > 0)
    .sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));

  return { rows, from, to };
}

/**
 * Everything not yet reported to one customer, for the email.
 *
 * Starts at their last update rather than at the range on screen, so a skipped
 * week catches up on its own. Where somebody has never been told anything it
 * falls back to the range, because "everything ever" on a two year old customer
 * is not an update, it is a history lesson.
 */
export async function loadUpdatesForCustomer(supabase, { customerId, email, from, to }) {
  let start = from;
  if (customerId) {
    const { data } = await supabase
      .from("pcd_order_activity")
      .select("created_at")
      .eq("action_type", UPDATE_SENT_ACTION)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.created_at;
    if (last) start = last.slice(0, 10) < from ? last.slice(0, 10) : from;
  }

  const { rows } = await loadCustomerUpdates(supabase, { from: start, to });
  const match = rows.find(
    (r) => (customerId && r.customerId === customerId) || (!!email && r.email.toLowerCase() === email.toLowerCase())
  );
  return { row: match || null, from: start, to, widened: start !== from };
}
