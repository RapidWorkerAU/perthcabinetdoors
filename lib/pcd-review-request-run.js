// SENDING THE GOOGLE REVIEW REQUEST.
//
// The rules about WHEN are in lib/pcd-review-requests.js. This file reads what
// they need from the database, sends, and writes down what happened.
//
// ── ONCE PER ORDER, WHOEVER CALLS IT ─────────────────────────────────────────
//
// Two schedulers call the job (see app/api/cron/review-requests), and staff can
// press Send now at the same moment a pass is running. So a send is CLAIMED
// before it is made: review_request_sent_at is written only where it is still
// blank, and only the caller whose write landed sends. If the provider then
// refuses it, the claim is let go so the next pass tries again.
//
// ── NOTHING HERE THROWS OUTWARDS ─────────────────────────────────────────────
//
// One bad order must not stop the rest of the pass, and a review email must
// never be the reason an order fails to save or load.

import { Resend } from "resend";
import { BUSINESS_DEFAULTS_SINGLETON_ID, getBusinessDefaults } from "./pcd-business-defaults";
import { logOrderActivity } from "./pcd-activity-log";
import { recordOutboundEmail } from "./pcd-desk-outbound";
import { customerReviewRequestHtml } from "./pcd-email-templates";
import { sendEmail } from "./pcd-send-email";
import {
  REVIEW_BUTTON,
  dayLabel,
  firstName,
  insideSendingHours,
  perthDay,
  reviewMessageParagraphs,
  reviewRequestState,
  reviewSettingsProblem,
} from "./pcd-review-requests";

// Far above anything real. Whatever is left is picked up on the next pass.
const MAX_PER_PASS = 200;

const lower = (value) => String(value || "").trim().toLowerCase();

function resendClient() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

/** The settings, and when the switch went on. */
export async function readReviewSettings(supabase) {
  const settings = await getBusinessDefaults(supabase);
  // Read from the row, because the normaliser does not carry it: nothing may
  // write it but the database. A database without the migration has no such
  // column, and then nothing is ever on.
  const { data, error } = await supabase
    .from("pcd_business_defaults")
    .select("review_requests_enabled_at")
    .eq("id", BUSINESS_DEFAULTS_SINGLETON_ID)
    .maybeSingle();
  return { settings, enabledAt: error ? null : data?.review_requests_enabled_at || null };
}

/** The customer's three links. All carry the order's review_token and nothing else. */
export function reviewLinks(baseUrl, token) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const code = encodeURIComponent(token || "");
  return {
    // Through our site first, so the order can show the button was pressed.
    buttonUrl: `${base}/api/review-request/go?code=${code}`,
    // A page with a button, not a link that unsubscribes on arrival: mail
    // scanners open every link in an email, and would unsubscribe everybody.
    unsubscribeUrl: `${base}/reviews/unsubscribe?code=${code}`,
    // The one click unsubscribe that Gmail and Outlook show beside the sender.
    // They POST to it, which a scanner does not.
    oneClickUrl: `${base}/api/review-request/unsubscribe?code=${code}`,
  };
}

/**
 * Everything the rules need about a set of orders, read in four queries.
 */
export async function loadReviewContext(supabase, orders, { settings, now = new Date() } = {}) {
  const ids = orders.map((order) => order.id);
  const customerIds = [...new Set(orders.map((order) => order.customer_id).filter(Boolean))];
  const emails = [...new Set(orders.map((order) => lower(order.customer_email)).filter(Boolean))];

  const paymentsByOrder = new Map();
  if (ids.length) {
    const { data: payments } = await supabase.from("pcd_order_payments").select("*").in("order_id", ids);
    for (const payment of payments || []) {
      const list = paymentsByOrder.get(payment.order_id) || [];
      list.push(payment);
      paymentsByOrder.set(payment.order_id, list);
    }
  }

  const neverAsk = new Set();
  if (customerIds.length) {
    const { data: customers } = await supabase
      .from("pcd_customers")
      .select("id, review_requests_never")
      .in("id", customerIds);
    for (const customer of customers || []) if (customer.review_requests_never) neverAsk.add(customer.id);
  }

  const optedOut = new Set();
  if (emails.length) {
    const { data: rows } = await supabase.from("pcd_review_opt_outs").select("email").in("email", emails);
    for (const row of rows || []) optedOut.add(lower(row.email));
  }

  // Requests already sent inside the gap, to anybody. A short list: at most
  // one per customer per gap.
  const asked = [];
  const gapMonths = Number(settings?.review_request_gap_months) || 0;
  if (gapMonths > 0) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - gapMonths);
    const { data: rows } = await supabase
      .from("pcd_orders")
      .select("id, customer_id, customer_email, review_request_sent_at")
      .gte("review_request_sent_at", cutoff.toISOString());
    asked.push(...(rows || []));
  }

  return { paymentsByOrder, neverAsk, optedOut, asked };
}

/** The newest request sent to this customer or address on another order. */
function lastAskedFor(order, asked) {
  const email = lower(order.customer_email);
  return asked
    .filter(
      (row) =>
        row.id !== order.id &&
        ((order.customer_id && row.customer_id === order.customer_id) || (email && lower(row.customer_email) === email))
    )
    .map((row) => row.review_request_sent_at)
    .sort()
    .pop() || null;
}

export function stateFromContext(order, context, { settings, enabledAt, now }) {
  return reviewRequestState(order, {
    settings,
    enabledAt,
    now,
    payments: context.paymentsByOrder.get(order.id) || order.pcd_order_payments || [],
    neverAsk: Boolean(order.customer_id && context.neverAsk.has(order.customer_id)),
    optedOut: context.optedOut.has(lower(order.customer_email)),
    lastAskedAt: lastAskedFor(order, context.asked),
  });
}

/**
 * Where one order's request is up to, for the order page.
 *
 * Returns null rather than throwing, so a database without the migration shows
 * an order page with no review panel instead of no order page.
 */
export async function reviewRequestForOrder(supabase, order, { now = new Date() } = {}) {
  try {
    if (!order || !Object.prototype.hasOwnProperty.call(order, "review_token")) return null;
    const { settings, enabledAt } = await readReviewSettings(supabase);
    const context = await loadReviewContext(supabase, [order], { settings, now });
    const state = stateFromContext(order, context, { settings, enabledAt, now });
    return {
      ...state,
      email: order.customer_email || "",
      clickedAt: order.review_link_clicked_at || null,
      problem: reviewSettingsProblem(settings),
    };
  } catch (error) {
    console.error(`[review-request] could not work out the state of an order: ${error?.message || error}`);
    return null;
  }
}

/** The email, ready to send. */
export function buildReviewEmail(order, settings, baseUrl) {
  const name = firstName(order.customer_name);
  const links = reviewLinks(baseUrl, order.review_token);
  const paragraphs = reviewMessageParagraphs(settings.review_request_message, {
    firstName: name,
    orderNumber: order.order_number || "",
  });
  const subject = String(settings.review_request_subject || "")
    .replace(/\{first_name\}/g, name || "")
    .replace(/\{order_number\}/g, order.order_number || "")
    .replace(/\s+/g, " ")
    .trim();
  const html = customerReviewRequestHtml({
    heading: name ? `Thank you, ${name}` : "Thank you",
    paragraphs,
    buttonUrl: links.buttonUrl,
    unsubscribeUrl: links.unsubscribeUrl,
    orderNumber: order.order_number || "",
  });
  const text = [
    ...paragraphs.map((paragraph) =>
      paragraph === REVIEW_BUTTON ? `Leave a Google review: ${links.buttonUrl}` : paragraph
    ),
    "",
    `Stop review requests: ${links.unsubscribeUrl}`,
  ].join("\n\n");
  return { subject, html, text, links };
}

/**
 * Send one order's request.
 *
 * @param actor   "system" for the daily job, or the staff member's email for
 *                Send now
 * @param mailer  a Resend client. Passed in by the tests; everywhere else it
 *                is the real one.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function sendReviewRequest(
  supabase,
  order,
  { settings, baseUrl, actor = "system", now = new Date(), mailer = resendClient() }
) {
  const to = String(order.customer_email || "").trim();
  if (!to) return { ok: false, error: "This order has no email address." };
  const problem = reviewSettingsProblem({ ...settings, review_requests_enabled: true });
  if (problem) return { ok: false, error: problem };
  if (!mailer) return { ok: false, error: "Email is not configured, so nothing was sent." };

  const stamp = now.toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("pcd_orders")
    .update({ review_request_sent_at: stamp })
    .eq("id", order.id)
    .eq("status", "complete")
    .is("review_request_sent_at", null)
    .is("review_request_skipped_at", null)
    .select("id");
  if (claimError) return { ok: false, error: claimError.message };
  if (!claimed?.length) return { ok: false, error: "This order has already been sent its request, or is no longer due one." };

  const email = buildReviewEmail(order, settings, baseUrl);
  const sent = await sendEmail(mailer, {
    from: process.env.RESEND_FROM_EMAIL,
    to: [to],
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: {
      "List-Unsubscribe": `<${email.links.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (!sent.ok) {
    // Let go, so the next pass tries again. Filtered on our own stamp so a
    // request somebody else has since sent is never cleared.
    await supabase
      .from("pcd_orders")
      .update({ review_request_sent_at: null })
      .eq("id", order.id)
      .eq("review_request_sent_at", stamp);
    await logOrderActivity(supabase, {
      order_id: order.id,
      customer_id: order.customer_id || null,
      actor_type: actor === "system" ? "system" : "admin",
      action_type: "review_request_failed",
      title: "Google review request did not send",
      description: `The email to ${to} was refused: ${sent.error}. It will be tried again on the next pass.`,
      metadata: { error: sent.error },
      // Once a day at most, so a provider outage is one line a day, not one a pass.
      event_key: `order:${order.id}:review-request-failed:${perthDay(now)}`,
    });
    return { ok: false, error: sent.error };
  }

  await logOrderActivity(supabase, {
    order_id: order.id,
    customer_id: order.customer_id || null,
    actor_type: actor === "system" ? "system" : "admin",
    action_type: "review_request_sent",
    title: "Google review request sent",
    description:
      actor === "system"
        ? `Emailed to ${to}, thanking them and asking for a Google review.`
        : `Sent now by ${actor} to ${to}, thanking them and asking for a Google review.`,
    metadata: { to, provider_message_id: sent.id || null },
    event_key: `order:${order.id}:review-request`,
  });

  // Onto their desk thread, so the board and the desk both know we wrote.
  await recordOutboundEmail(supabase, {
    customerId: order.customer_id,
    toEmail: to,
    subject: email.subject,
    bodyHtml: email.html,
    bodyText: email.text,
    providerMessageId: sent.id || null,
    sentAs: "automatic",
  });

  return { ok: true };
}

/** Write down a decision not to send, once. */
async function stampSkipped(supabase, order, reason, description, now) {
  const { data: claimed } = await supabase
    .from("pcd_orders")
    .update({
      review_request_skipped_at: now.toISOString(),
      review_request_skipped_reason: reason,
      review_request_skipped_by: null,
    })
    .eq("id", order.id)
    .is("review_request_sent_at", null)
    .is("review_request_skipped_at", null)
    .select("id");
  if (!claimed?.length) return false;
  await logOrderActivity(supabase, {
    order_id: order.id,
    customer_id: order.customer_id || null,
    actor_type: "system",
    action_type: "review_request_skipped",
    title: "No Google review request",
    description,
    metadata: { reason },
    event_key: `order:${order.id}:review-request-skipped`,
  });
  return true;
}

/**
 * The daily pass.
 *
 * @returns {Promise<object>} a summary for the log line
 */
export async function runReviewRequests(
  supabase,
  { now = new Date(), baseUrl = "", ignoreHours = false, mailer = resendClient() } = {}
) {
  const summary = { ok: true, enabled: false, sent: 0, skipped: 0, waiting: 0, problems: [] };

  const { settings, enabledAt } = await readReviewSettings(supabase);
  if (!settings.review_requests_enabled || !enabledAt) return summary;
  summary.enabled = true;

  const problem = reviewSettingsProblem(settings);
  if (problem) {
    summary.problems.push(problem);
    return summary;
  }

  if (!ignoreHours && !insideSendingHours(now)) {
    summary.outsideHours = true;
    return summary;
  }

  const { data: orders, error } = await supabase
    .from("pcd_orders")
    .select("*")
    .eq("status", "complete")
    .is("review_request_sent_at", null)
    .is("review_request_skipped_at", null)
    .gte("completed_at", enabledAt)
    .order("completed_at", { ascending: true })
    .limit(MAX_PER_PASS);
  if (error) throw error;
  if (!orders?.length) return summary;

  const context = await loadReviewContext(supabase, orders, { settings, now });

  for (const order of orders) {
    try {
      const state = stateFromContext(order, context, { settings, enabledAt, now });

      if (state.key === "due") {
        const sent = await sendReviewRequest(supabase, order, { settings, baseUrl, now, mailer });
        if (sent.ok) {
          summary.sent += 1;
          // So a second order for the same customer in this pass counts as asked.
          context.asked.push({
            id: order.id,
            customer_id: order.customer_id,
            customer_email: order.customer_email,
            review_request_sent_at: now.toISOString(),
          });
        } else {
          summary.problems.push(`${order.order_number || order.id}: ${sent.error}`);
        }
        continue;
      }

      if (state.key === "opted_out" || state.key === "asked_recently" || state.key === "too_late") {
        if (await stampSkipped(supabase, order, state.key, state.label, now)) summary.skipped += 1;
        continue;
      }

      if (state.key === "no_email") {
        // Logged once, not stamped: add an address and it goes on the next pass.
        await logOrderActivity(supabase, {
          order_id: order.id,
          customer_id: order.customer_id || null,
          actor_type: "system",
          action_type: "review_request_no_email",
          title: "Google review request waiting for an email address",
          description: state.label,
          event_key: `order:${order.id}:review-request-no-email`,
        });
      }

      summary.waiting += 1;
    } catch (thrown) {
      summary.problems.push(`${order.order_number || order.id}: ${thrown?.message || thrown}`);
    }
  }

  return summary;
}

/** The timeline line written when an order is marked Complete. */
export function linedUpWords(state) {
  if (state?.key === "waiting") return `Google review request lined up for ${dayLabel(state.sendOn)}.`;
  if (state?.key === "due") return "Google review request lined up for the next pass.";
  if (state?.key === "owing") return "Google review request on hold until the order is paid in full.";
  return "";
}
