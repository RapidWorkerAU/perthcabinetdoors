// ALFRED'S THIRD AND FOURTH JOBS: QUOTE REQUESTS AND ENQUIRIES.
//
// ── QUOTE REQUESTS ───────────────────────────────────────────────────────────
//
// A request nobody has turned into a quote after 24 hours (Settings, Alfred):
// Alfred presses the same Convert to quote a person would
// (lib/pcd-quote-request-conversion.js). That makes a DRAFT quote, priced from
// today's libraries, every board checked against the colour library, and any
// line it could not settle noted against the line. No model is asked: this is
// the system's own arithmetic, so it costs nothing and cannot invent a price.
// Nothing is sent. A person opens the draft, prices what needs a person, and
// sends it the normal way. Declining deletes the draft and puts the request back.
//
// ── ENQUIRIES ────────────────────────────────────────────────────────────────
//
// A new website enquiry already gets the automatic "we got your message"
// email. Alfred drafts the real reply, from facts only (what we make, the
// materials, lead time, how to book a measure or request a quote), and it waits
// for approval like any other draft. A question he cannot answer from the facts
// becomes a question for you.

import { logOrderActivity } from "./pcd-activity-log";
import { replyContext, perthDate } from "./pcd-alfred-context";
import { askForReply } from "./pcd-alfred-model";
import { countsAsUpdate } from "./pcd-alfred-updates";
import { convertQuoteRequest } from "./pcd-quote-request-conversion";
import { MATERIAL_LABELS, PRODUCT_TYPES } from "./pcd-materials";

const HOUR = 3600000;
const DAY = 24 * HOUR;

export const quoteSourceKey = (requestId) => `quote:${requestId}`;
export const enquirySourceKey = (enquiryId) => `enquiry:${enquiryId}`;

async function liveKeys(supabase, keys) {
  if (!keys.length) return new Set();
  const [{ data: drafted }, { data: asked }] = await Promise.all([
    supabase.from("pcd_alfred_drafts").select("source_key").in("source_key", keys).in("status", ["waiting", "approved", "declined"]),
    supabase.from("pcd_alfred_questions").select("source_key").in("source_key", keys).in("status", ["open", "answered"]),
  ]);
  return new Set([...(drafted || []), ...(asked || [])].map((r) => r.source_key));
}

/** Requests waiting longer than the setting, oldest first. Pure filter, tested. */
export function requestsDue(requests, waitHours, now = new Date()) {
  return (requests || [])
    .filter((r) => ["new", "reviewing"].includes(r.status) && !r.converted_quote_id)
    .filter((r) => now.getTime() - new Date(r.created_at).getTime() >= waitHours * HOUR)
    .filter((r) => now.getTime() - new Date(r.created_at).getTime() <= 30 * DAY)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

/** Draft quotes for requests nobody has quoted. */
export async function runQuoteDrafts(supabase, settings, { now = new Date(), room = Infinity } = {}) {
  const out = { drafts: 0, problems: [] };
  const { data: requests } = await supabase
    .from("pcd_quote_requests")
    .select("id, status, converted_quote_id, created_at, customer_name")
    .in("status", ["new", "reviewing"])
    .is("converted_quote_id", null)
    .order("created_at", { ascending: true })
    .limit(30);
  const due = requestsDue(requests, settings.quote_wait_hours, now);
  const done = await liveKeys(supabase, due.map((r) => quoteSourceKey(r.id)));

  for (const request of due) {
    if (room <= 0) break;
    if (done.has(quoteSourceKey(request.id))) continue;
    try {
      const result = await convertQuoteRequest(supabase, request.id, { actorType: "alfred" });
      if (result.alreadyConverted) continue;
      const { data: quote } = await supabase.from("pcd_quotes").select("id, quote_number, customer_id, customer_email, total_inc_gst").eq("id", result.quoteId).maybeSingle();
      const hours = Math.round((now.getTime() - new Date(request.created_at).getTime()) / HOUR);
      const priced = result.lineCount - result.unpriced.length - result.madeToOrder.length;
      const facts = [
        `${result.lineCount} line${result.lineCount === 1 ? "" : "s"} from the request`,
        `${priced} priced from today's libraries with your markup`,
        ...result.unpriced.map((u) => `Needs a price: ${u.product_name}${u.colour ? `, ${u.colour}` : ""}. ${u.message}`),
        ...result.madeToOrder.map((u) => `Made to order: ${u.product_name}. Price it from the supplier's quote.`),
        ...result.notInLibrary,
        ...result.incomplete,
      ];
      const { data: saved, error } = await supabase
        .from("pcd_alfred_drafts")
        .insert({
          kind: "quote",
          source_key: quoteSourceKey(request.id),
          customer_id: quote?.customer_id || null,
          quote_id: result.quoteId,
          quote_request_id: request.id,
          to_email: quote?.customer_email || null,
          subject: `Draft quote ${result.quoteNumber || ""}`.trim(),
          why: `${request.customer_name || "A customer"}'s quote request waited ${hours} hours without a quote, so Alfred pressed Convert to quote. Nothing has been sent.`,
          facts,
          checks: [
            "Made by the same Convert to quote you use",
            "Every board checked against the colour library",
            "Priced with today's library prices and your markup",
            "Nothing has been sent to the customer",
          ],
          line_notes: result.lineNotes,
        })
        .select("id")
        .single();
      if (error) {
        out.problems.push(`${request.customer_name || request.id}: ${error.message}`);
        continue;
      }
      await logOrderActivity(supabase, {
        quote_id: result.quoteId,
        quote_request_id: request.id,
        actor_type: "alfred",
        action_type: "alfred_drafted_quote",
        title: "Quote drafted by Alfred",
        description: `The request waited ${hours} hours. ${priced} of ${result.lineCount} lines priced. Waiting for a person to check and send it.`,
        metadata: { draft_id: saved.id },
        event_key: `alfred:draft:${saved.id}`,
      });
      out.drafts += 1;
      room -= 1;
    } catch (error) {
      out.problems.push(`${request.customer_name || request.id}: ${error?.message || error}`);
    }
  }
  return out;
}

/** The facts about what we offer, for answering an enquiry. */
export function offeringFacts(siteUrl = "") {
  const base = String(siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://www.perthcabinetdoors.com").replace(/\/+$/, "");
  return [
    `We make ${PRODUCT_TYPES.filter((t) => !["Hardware", "Laminate"].includes(t)).map((t) => t.toLowerCase() + "s").join(", ")} to measure, and supply hardware.`,
    `Our board materials are ${MATERIAL_LABELS.filter((m) => m !== "Laminate").join(", ")}.`,
    `Customers can request a quote online at ${base}/request-quote.`,
    `Customers can book a site measure online at ${base}/book-a-site-measure.`,
  ];
}

/** Draft (or ask about) one enquiry reply. */
export async function draftEnquiryReply(supabase, enquiry, { answer = "", client } = {}) {
  const context = await replyContext(supabase, { customerId: enquiry.customer_id });
  for (const text of offeringFacts()) context.facts.push({ key: `F${context.facts.length + 1}`, text });
  context.answering = {
    from: "The customer",
    when: perthDate(enquiry.created_at, { withTime: true }),
    text: `Website enquiry${enquiry.topic ? ` about ${enquiry.topic}` : ""}${enquiry.postcode ? ` (postcode ${enquiry.postcode})` : ""}:\n${enquiry.message || ""}`,
  };
  const reply = await askForReply(context, { answer, client, task: "reply" });
  const spent = { input: reply.usage?.input_tokens || 0, output: reply.usage?.output_tokens || 0, cost: reply.cost || 0 };
  if (!reply.ok) return { made: "problem", problem: reply.problem, spent };
  const base = { source_key: enquirySourceKey(enquiry.id), customer_id: enquiry.customer_id };
  const { result } = reply;
  if (result.decision === "question") {
    const { error } = await supabase.from("pcd_alfred_questions").insert({ ...base, question: result.question, why: result.why, options: result.options });
    return error ? { made: "problem", problem: error.message, spent } : { made: "question", spent };
  }
  if (result.decision === "skip") {
    await supabase.from("pcd_alfred_drafts").insert({
      ...base,
      kind: "enquiry",
      enquiry_id: enquiry.id,
      status: "declined",
      decided_by: "Alfred",
      decided_at: new Date().toISOString(),
      decline_reason: `Skipped: ${result.reason}`,
      subject: enquiry.topic || "Website enquiry",
    });
    return { made: "skip", spent };
  }
  const { data: saved, error } = await supabase
    .from("pcd_alfred_drafts")
    .insert({
      ...base,
      kind: "enquiry",
      enquiry_id: enquiry.id,
      to_email: enquiry.customer_email,
      subject: result.subject || `Your enquiry${enquiry.topic ? ` about ${enquiry.topic}` : ""}`,
      body_text: result.body,
      why: result.why,
      facts: result.facts,
      checks: [
        "Goes only to the email on the enquiry",
        `Every fact traced to the system (${result.facts.length})`,
        "Follows the automatic \"we got your message\" email",
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
    customer_id: enquiry.customer_id,
    actor_type: "alfred",
    action_type: "alfred_drafted_enquiry_reply",
    title: "Enquiry reply drafted by Alfred",
    description: `Waiting for approval. ${result.why}`.trim(),
    metadata: { draft_id: saved.id, enquiry_id: enquiry.id },
    event_key: `alfred:draft:${saved.id}`,
  });
  return { made: "draft", draftId: saved.id, spent };
}

/**
 * Has a person emailed this customer since? Automatic emails and documents do
 * not count, the same rule as the update clock.
 */
async function answeredSince(supabase, customerId, since) {
  const { data } = await supabase
    .from("pcd_messages")
    .select("*")
    .eq("customer_id", customerId)
    .eq("direction", "outbound")
    .gt("created_at", since)
    .limit(20);
  return (data || []).some(countsAsUpdate);
}

/** Draft replies to new enquiries. */
export async function runEnquiryReplies(supabase, { now = new Date(), room = Infinity, client } = {}) {
  const out = { drafts: 0, questions: 0, skipped: 0, problems: [], cost: 0, input: 0, output: 0 };
  const since = new Date(now.getTime() - 14 * DAY).toISOString();
  const { data: enquiries } = await supabase
    .from("pcd_enquiries")
    .select("*")
    .eq("status", "new")
    .not("customer_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(20);
  const list = (enquiries || []).filter((e) => String(e.customer_email || "").trim());
  const done = await liveKeys(supabase, list.map((e) => enquirySourceKey(e.id)));
  for (const enquiry of list) {
    if (room <= 0) break;
    if (done.has(enquirySourceKey(enquiry.id))) continue;
    if (await answeredSince(supabase, enquiry.customer_id, enquiry.created_at)) continue;
    const result = await draftEnquiryReply(supabase, enquiry, { client });
    out.input += result.spent.input;
    out.output += result.spent.output;
    out.cost += result.spent.cost;
    if (result.made === "draft") {
      out.drafts += 1;
      room -= 1;
    } else if (result.made === "question") out.questions += 1;
    else if (result.made === "skip") out.skipped += 1;
    else out.problems.push(`${enquiry.customer_name || "An enquiry"}: ${result.problem}`);
  }
  out.cost = Number(out.cost.toFixed(4));
  return out;
}

/** Why a quote or enquiry draft is no longer waiting, or "" if it still is. */
export async function staleIntakeState(supabase, draft) {
  if (draft.kind === "quote") {
    const { data: quote } = await supabase.from("pcd_quotes").select("status").eq("id", draft.quote_id).maybeSingle();
    if (!quote) return { status: "withdrawn", reason: "The draft quote was deleted." };
    // Sent the normal way: that is the approval.
    if (quote.status !== "draft") return { status: "approved", reason: "Sent from the quote." };
    return null;
  }
  if (draft.kind === "enquiry") {
    const { data: enquiry } = await supabase.from("pcd_enquiries").select("status, customer_id, created_at").eq("id", draft.enquiry_id).maybeSingle();
    if (!enquiry) return { status: "withdrawn", reason: "The enquiry was deleted." };
    if (enquiry.status !== "new") return { status: "withdrawn", reason: "The enquiry was dealt with another way." };
    if (await answeredSince(supabase, enquiry.customer_id, draft.created_at)) return { status: "withdrawn", reason: "Somebody had already replied." };
    return null;
  }
  return null;
}

/**
 * A person declines Alfred's draft quote: the draft quote is deleted, as long
 * as it is still an unsent draft, and the request goes back to the list.
 */
export async function discardDraftQuote(supabase, draft) {
  const { data: quote } = await supabase.from("pcd_quotes").select("id, status").eq("id", draft.quote_id).maybeSingle();
  if (quote && quote.status !== "draft") {
    const refusal = new Error("That quote has already been sent, so it was not deleted. Archive it from the quote if it is not wanted.");
    refusal.status = 409;
    throw refusal;
  }
  if (quote) {
    const { data: lines } = await supabase.from("pcd_quote_line_items").select("id").eq("quote_id", quote.id);
    const lineIds = (lines || []).map((l) => l.id);
    if (lineIds.length) await supabase.from("pcd_cabinet_configs").delete().in("line_item_id", lineIds);
    await Promise.all([
      supabase.from("pcd_quote_attachments").delete().eq("quote_id", quote.id),
      supabase.from("pcd_quote_line_items").delete().eq("quote_id", quote.id),
    ]);
    const { error } = await supabase.from("pcd_quotes").delete().eq("id", quote.id);
    if (error) throw error;
  }
  if (draft.quote_request_id) {
    await supabase.from("pcd_quote_requests").update({ status: "reviewing", converted_quote_id: null }).eq("id", draft.quote_request_id);
  }
}

/** One question answered about an enquiry. */
export async function answerEnquiryQuestion(supabase, question, answer, { client } = {}) {
  const enquiryId = String(question.source_key || "").replace(/^enquiry:/, "");
  const { data: enquiry } = await supabase.from("pcd_enquiries").select("*").eq("id", enquiryId).maybeSingle();
  if (!enquiry) return { made: "nothing", spent: { input: 0, output: 0, cost: 0 } };
  return draftEnquiryReply(supabase, enquiry, { answer, client });
}
