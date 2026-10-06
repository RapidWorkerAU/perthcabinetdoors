// ALFRED'S FIRST JOB: DRAFT A REPLY WHEN A CUSTOMER WRITES IN.
//
// ── WHAT IT DOES ─────────────────────────────────────────────────────────────
//
// After each mailbox read, it looks for conversations where the customer wrote
// last and nobody has answered. For each one it gathers the facts the system
// holds (lib/pcd-alfred-context.js), asks Claude once (lib/pcd-alfred-model.js),
// and keeps one of three things:
//
//   a draft      waits on the Alfred page and in the customer's reply box
//   a question   when a fact is missing, so Alfred never guesses
//   a skip       a thank you or an auto reply, recorded so it is not asked again
//
// Nothing is sent. Sending is approveDraft, which needs a person.
//
// ── WHAT STOPS IT ────────────────────────────────────────────────────────────
//
//   the switch in Settings, and the job's own switch
//   the daily draft limit and the monthly spend limit
//   a conversation already drafted, asked about or skipped (source_key)
//
// ── STALE DRAFTS GO ──────────────────────────────────────────────────────────
//
// A draft is withdrawn, and remade from fresh facts on the next pass if still
// needed, when the customer writes again, when somebody has already replied,
// or when it has waited longer than the setting allows. So a person approving
// never sends last week's news or answers a question that has moved on.

import { logOrderActivity } from "./pcd-activity-log";
import { getAlfredSettings } from "./pcd-alfred-settings";
import { replyContext } from "./pcd-alfred-context";
import { askForReply } from "./pcd-alfred-model";
import { sendDeskReply } from "./pcd-desk-reply";
import { toTermsHtml } from "./pcd-terms-html";
import { answerUpdateQuestion, staleUpdateReason } from "./pcd-alfred-updates";
import { answerEnquiryQuestion, discardDraftQuote, runEnquiryReplies, runQuoteDrafts, staleIntakeState } from "./pcd-alfred-intake";

const DAY = 86400000;
// The most a single pass drafts, so a backlog after a quiet week is cleared
// over a few passes rather than in one long, expensive run.
const PER_PASS = 8;
// Only conversations the customer wrote in recently. A message from months ago
// that nobody answered is a person's call, not a draft.
const RECENT_DAYS = 14;

const sourceKey = (messageId) => `reply:${messageId}`;

function perthMidnight(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${day}T00:00:00+08:00`);
}
function perthMonthStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit" }).format(now);
  return new Date(`${day}-01T00:00:00+08:00`);
}

/** What has been used today and this month, against the limits. */
export async function alfredUsage(supabase, now = new Date()) {
  const [{ count: draftsToday }, { data: runs }] = await Promise.all([
    supabase.from("pcd_alfred_drafts").select("id", { count: "exact", head: true }).gte("created_at", perthMidnight(now).toISOString()),
    supabase.from("pcd_alfred_runs").select("cost_usd").gte("started_at", perthMonthStart(now).toISOString()),
  ]);
  const spentThisMonth = (runs || []).reduce((sum, run) => sum + Number(run.cost_usd || 0), 0);
  return { draftsToday: draftsToday || 0, spentThisMonth: Number(spentThisMonth.toFixed(2)) };
}

/** The conversations waiting on us: the customer wrote last, recently. */
export async function conversationsWaiting(supabase, now = new Date()) {
  const since = new Date(now.getTime() - RECENT_DAYS * DAY).toISOString();
  const { data: tickets } = await supabase
    .from("pcd_tickets")
    .select("id, customer_id, subject, status, last_message_at")
    .eq("status", "open")
    .not("customer_id", "is", null)
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: true })
    .limit(60);
  const waiting = [];
  for (const ticket of tickets || []) {
    const { data: last } = await supabase
      .from("pcd_messages")
      .select("id, direction, created_at")
      .eq("ticket_id", ticket.id)
      .neq("direction", "note")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.direction === "inbound") waiting.push({ ticket, messageId: last.id, receivedAt: last.created_at });
  }
  return waiting;
}

/** Withdraw drafts that have gone stale. Returns how many. */
export async function withdrawStale(supabase, settings, now = new Date()) {
  const { data: live } = await supabase.from("pcd_alfred_drafts").select("id, kind, ticket_id, message_id, order_id, quote_id, enquiry_id, created_at").eq("status", "waiting");
  let withdrawn = 0;
  for (const draft of live || []) {
    let reason = "";
    // A draft quote is the quote itself, so it never goes stale by age. It
    // settles when the quote is sent the normal way, or deleted.
    if (draft.kind === "quote") {
      const state = await staleIntakeState(supabase, draft);
      if (state?.status === "approved") {
        await supabase
          .from("pcd_alfred_drafts")
          .update({ status: "approved", decided_by: "Sent from the quote", decided_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", draft.id)
          .eq("status", "waiting");
        continue;
      }
      reason = state?.reason || "";
    } else if (now.getTime() - new Date(draft.created_at).getTime() > settings.stale_after_days * DAY) {
      reason = `Waited more than ${settings.stale_after_days} days without being approved.`;
    } else if (draft.kind === "reply" && draft.ticket_id && draft.message_id) {
      const { data: newer } = await supabase
        .from("pcd_messages")
        .select("direction")
        .eq("ticket_id", draft.ticket_id)
        .neq("direction", "note")
        .gt("created_at", (await messageTime(supabase, draft.message_id)) || draft.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newer?.direction === "inbound") reason = "The customer wrote again, so this draft was out of date.";
      if (newer?.direction === "outbound") reason = "Somebody had already replied.";
    } else if (draft.kind === "update" && draft.order_id) {
      reason = await staleUpdateReason(supabase, draft);
    } else if (draft.kind === "enquiry" && draft.enquiry_id) {
      reason = (await staleIntakeState(supabase, draft))?.reason || "";
    }
    if (!reason) continue;
    const { data } = await supabase
      .from("pcd_alfred_drafts")
      .update({ status: "withdrawn", problem: reason, updated_at: now.toISOString() })
      .eq("id", draft.id)
      .eq("status", "waiting")
      .select("id");
    if (data?.length) withdrawn += 1;
  }
  return withdrawn;
}

async function messageTime(supabase, messageId) {
  const { data } = await supabase.from("pcd_messages").select("created_at").eq("id", messageId).maybeSingle();
  return data?.created_at || null;
}

/**
 * Draft (or ask about, or skip) one conversation. Used by the pass and by a
 * person answering one of Alfred's questions.
 */
export async function draftOneReply(supabase, { ticket, messageId, answer = "", client } = {}) {
  const context = await replyContext(supabase, { customerId: ticket.customer_id, ticketId: ticket.id, messageId });
  const reply = await askForReply(context, { answer, client });
  const spent = { input: reply.usage?.input_tokens || 0, output: reply.usage?.output_tokens || 0, cost: reply.cost || 0 };
  const base = {
    source_key: sourceKey(messageId),
    customer_id: ticket.customer_id,
    ticket_id: ticket.id,
    message_id: messageId,
    order_id: context.orderIds[0] || null,
  };

  if (!reply.ok) return { made: "problem", problem: reply.problem, spent };

  const { result } = reply;
  if (result.decision === "question") {
    const { error } = await supabase.from("pcd_alfred_questions").insert({
      ...base,
      question: result.question,
      why: result.why,
      options: result.options,
    });
    if (error) return { made: "problem", problem: error.message, spent };
    return { made: "question", spent };
  }

  const draft = {
    ...base,
    kind: "reply",
    model: reply.model,
    input_tokens: spent.input,
    output_tokens: spent.output,
    cost_usd: spent.cost,
  };
  if (result.decision === "skip") {
    // Recorded so the same message is not sent to Claude every hour. Shown in
    // What Alfred did, so a skip that should not have been is easy to spot.
    const { error } = await supabase.from("pcd_alfred_drafts").insert({
      ...draft,
      status: "declined",
      decided_by: "Alfred",
      decided_at: new Date().toISOString(),
      decline_reason: `Skipped: ${result.reason}`,
      subject: ticket.subject || "",
    });
    if (error) return { made: "problem", problem: error.message, spent };
    return { made: "skip", spent };
  }

  const { data: saved, error } = await supabase
    .from("pcd_alfred_drafts")
    .insert({
      ...draft,
      to_email: context.toEmail,
      subject: result.subject || ticket.subject || "",
      body_text: result.body,
      why: result.why,
      facts: result.facts,
      checks: [
        "Goes only to the email on this customer's record",
        `Every fact traced to the system (${result.facts.length})`,
        "No dates, prices or promises beyond those facts",
      ],
    })
    .select("id")
    .single();
  if (error) return { made: "problem", problem: error.message, spent };

  await logOrderActivity(supabase, {
    customer_id: ticket.customer_id,
    order_id: base.order_id,
    actor_type: "alfred",
    action_type: "alfred_drafted_reply",
    title: "Reply drafted by Alfred",
    description: `Waiting for approval. ${result.why}`.trim(),
    metadata: { draft_id: saved.id, ticket_id: ticket.id },
    event_key: `alfred:draft:${saved.id}`,
  });
  return { made: "draft", draftId: saved.id, spent };
}

/**
 * The pass: withdraw what went stale, then draft what is waiting.
 * @returns a summary for the log line and the run record
 */
export async function runReplyDrafts(supabase, { now = new Date(), client } = {}) {
  const summary = { ok: true, enabled: false, drafts: 0, questions: 0, skipped: 0, withdrawn: 0, problems: [], cost: 0 };
  const { settings, available, error } = await getAlfredSettings(supabase);
  if (!available) {
    summary.problems.push(error);
    return summary;
  }
  if (!settings.enabled || !settings.jobs.replies) return summary;
  summary.enabled = true;

  const { data: run } = await supabase.from("pcd_alfred_runs").insert({ job: "replies" }).select("id").single();

  summary.withdrawn = await withdrawStale(supabase, settings, now);

  const usage = await alfredUsage(supabase, now);
  let room = settings.daily_draft_cap - usage.draftsToday;
  if (usage.spentThisMonth >= settings.monthly_spend_cap_usd) {
    summary.problems.push(`The monthly limit of US$${settings.monthly_spend_cap_usd} is reached, so nothing new was drafted.`);
    room = 0;
  }
  if (room <= 0 && !summary.problems.length) summary.problems.push(`The daily limit of ${settings.daily_draft_cap} drafts is reached.`);

  let input = 0;
  let output = 0;
  if (room > 0) {
    const waiting = await conversationsWaiting(supabase, now);
    // Skip anything already drafted, asked about or skipped.
    const keys = waiting.map((w) => sourceKey(w.messageId));
    const [{ data: drafted }, { data: asked }] = await Promise.all([
      keys.length ? supabase.from("pcd_alfred_drafts").select("source_key").in("source_key", keys).in("status", ["waiting", "approved", "declined"]) : Promise.resolve({ data: [] }),
      keys.length ? supabase.from("pcd_alfred_questions").select("source_key").in("source_key", keys).in("status", ["open", "answered"]) : Promise.resolve({ data: [] }),
    ]);
    const done = new Set([...(drafted || []), ...(asked || [])].map((row) => row.source_key));
    const todo = waiting.filter((w) => !done.has(sourceKey(w.messageId))).slice(0, Math.min(PER_PASS, room));

    for (const item of todo) {
      const result = await draftOneReply(supabase, { ticket: item.ticket, messageId: item.messageId, client });
      input += result.spent.input;
      output += result.spent.output;
      summary.cost += result.spent.cost;
      if (result.made === "draft") summary.drafts += 1;
      else if (result.made === "question") summary.questions += 1;
      else if (result.made === "skip") summary.skipped += 1;
      else summary.problems.push(`${item.ticket.subject || "A conversation"}: ${result.problem}`);
    }
  }

  summary.cost = Number(summary.cost.toFixed(4));
  if (run?.id) {
    await supabase
      .from("pcd_alfred_runs")
      .update({
        finished_at: new Date().toISOString(),
        drafts_made: summary.drafts,
        questions_asked: summary.questions,
        skipped: summary.skipped,
        input_tokens: input,
        output_tokens: output,
        cost_usd: summary.cost,
        problems: summary.problems.join("\n") || null,
      })
      .eq("id", run.id);
  }
  return summary;
}

/**
 * A person approves a draft: it is sent exactly as a desk reply is, and the
 * record says who approved it and whether they changed it.
 *
 * Refused if anything has moved since it was drafted: the customer wrote
 * again, or somebody already replied. The draft is withdrawn and will be made
 * again from fresh facts.
 */
export async function approveDraft(supabase, draftId, { approvedBy, bodyText, agentEmail }) {
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  if (!String(approvedBy || "").trim()) throw fail("Choose who is approving first.");

  const { data: draft } = await supabase.from("pcd_alfred_drafts").select("*").eq("id", draftId).maybeSingle();
  if (!draft) throw fail("That draft no longer exists.", 404);
  if (draft.status !== "waiting") throw fail(`That draft has already been ${draft.status}.`, 409);
  // A draft quote is checked and sent from the quote, the normal way.
  if (draft.kind === "quote") throw fail("Open the draft quote to check it and send it from there.");

  // Nothing changed underneath it.
  const { settings } = await getAlfredSettings(supabase);
  const stale = await withdrawStale(supabase, settings);
  if (stale) {
    const { data: still } = await supabase.from("pcd_alfred_drafts").select("status, problem").eq("id", draftId).maybeSingle();
    if (still?.status === "withdrawn") throw fail(`${still.problem} Nothing was sent. Alfred will draft it again if a reply is still needed.`, 409);
  }

  const text = String(bodyText ?? draft.body_text ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) throw fail("The email is empty.");
  const edited = text !== String(draft.body_text || "").trim();

  // Claimed before it is sent, so two people pressing approve at once cannot
  // both send it.
  // Alfred's own wording is kept when it was changed, so he can learn from
  // the edit (supabase/202610061600_pcd_alfred_original_body.sql). Without that
  // column yet, the claim is made without it rather than refused.
  const claim = { status: "approved", decided_by: approvedBy, decided_at: new Date().toISOString(), edited_before_send: edited, body_text: text };
  const claimWith = (row) => supabase.from("pcd_alfred_drafts").update(row).eq("id", draftId).eq("status", "waiting").select("id");
  let { data: claimed, error: claimError } = await claimWith(edited ? { ...claim, original_body: draft.body_text } : claim);
  if (claimError?.code === "PGRST204" || /original_body/.test(claimError?.message || "")) ({ data: claimed } = await claimWith(claim));
  if (!claimed?.length) throw fail("Somebody else has just dealt with that draft.", 409);

  let sentOk = false;
  try {
    const sent = await sendDeskReply(supabase, {
      customerId: draft.customer_id,
      kind: "reply",
      bodyHtml: toTermsHtml(text),
      subject: draft.subject,
      ticketId: draft.ticket_id,
      // An update is us writing first, so it starts its own conversation
      // rather than landing on whatever was last spoken about.
      newTicket: draft.kind === "update" || draft.kind === "enquiry" || draft.kind === "chat",
      agentEmail,
      alfred: { draftId, approvedBy, edited },
    });
    sentOk = true;
    await supabase.from("pcd_alfred_drafts").update({ sent_message_id: sent.message?.id || null }).eq("id", draftId);
    // The enquiry has had its answer, so it leaves the new enquiries list.
    if (draft.kind === "enquiry" && draft.enquiry_id) {
      await supabase.from("pcd_enquiries").update({ status: "responded", updated_at: new Date().toISOString() }).eq("id", draft.enquiry_id).eq("status", "new");
    }
    await logOrderActivity(supabase, {
      customer_id: draft.customer_id,
      order_id: draft.order_id,
      actor_type: "alfred",
      action_type: "alfred_reply_sent",
      title: draft.kind === "update" ? "Update sent" : draft.kind === "enquiry" ? "Enquiry answered" : draft.kind === "chat" ? "Email sent" : "Reply sent",
      description: `Written by Alfred, approved by ${approvedBy}${edited ? ", edited before sending" : ""}. Sent to ${sent.message?.to_email || draft.to_email}.`,
      metadata: { draft_id: draftId, approved_by: approvedBy, edited, message_id: sent.message?.id || null },
      event_key: `alfred:sent:${draftId}`,
    });
    return { ok: true, edited, message: sent.message };
  } catch (error) {
    // Sent, whatever failed afterwards: the draft stays approved so nobody
    // sends it again.
    if (sentOk || error?.alreadySent) {
      await supabase
        .from("pcd_alfred_drafts")
        .update({ problem: `Sent. A step after sending failed, so check the customer's page shows it: ${error?.message || error}` })
        .eq("id", draftId);
      return { ok: true, edited, message: null, recorded: false };
    }
    // Not sent, so the draft goes back to waiting with what went wrong.
    await supabase
      .from("pcd_alfred_drafts")
      .update({ status: "waiting", decided_by: null, decided_at: null, problem: error?.message || "Could not send." })
      .eq("id", draftId);
    throw error;
  }
}

/** A person declines a draft, with a reason Alfred learns from. */
export async function declineDraft(supabase, draftId, { declinedBy, reason }) {
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  if (!String(declinedBy || "").trim()) throw fail("Choose who is declining first.");
  if (!String(reason || "").trim()) throw fail("Pick a reason.");
  // Declining a draft quote deletes it, while it is still an unsent draft, and
  // the request goes back on the list for a person.
  const { data: draft } = await supabase.from("pcd_alfred_drafts").select("*").eq("id", draftId).maybeSingle();
  if (draft?.kind === "quote" && draft.status === "waiting") await discardDraftQuote(supabase, draft);
  const { data } = await supabase
    .from("pcd_alfred_drafts")
    .update({ status: "declined", decided_by: declinedBy, decided_at: new Date().toISOString(), decline_reason: reason })
    .eq("id", draftId)
    .eq("status", "waiting")
    .select("customer_id, order_id")
    .maybeSingle();
  if (!data) throw fail("That draft is no longer waiting.", 409);
  await logOrderActivity(supabase, {
    customer_id: data.customer_id,
    order_id: data.order_id,
    actor_type: "admin",
    action_type: "alfred_draft_declined",
    title: draft?.kind === "quote" ? "Alfred's draft quote deleted" : "Alfred's draft declined",
    description: draft?.kind === "quote"
      ? `Deleted by ${declinedBy}: ${reason}. The request is back on the list.`
      : `Declined by ${declinedBy}: ${reason}. Nothing was sent.`,
    metadata: { draft_id: draftId, reason },
    event_key: `alfred:declined:${draftId}`,
  });
  return { ok: true };
}

/** A person answers one of Alfred's questions, and Alfred drafts from the answer. */
export async function answerQuestion(supabase, questionId, { answeredBy, answer, client }) {
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  if (!String(answeredBy || "").trim()) throw fail("Choose who is answering first.");
  if (!String(answer || "").trim()) throw fail("Write or pick an answer.");
  const { data: question } = await supabase
    .from("pcd_alfred_questions")
    .update({ status: "answered", answer, answered_by: answeredBy, answered_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (!question) throw fail("That question has already been answered.", 409);
  // A question about an order update or an enquiry, rather than an email.
  const isEnquiry = String(question.source_key || "").startsWith("enquiry:");
  if (isEnquiry || (!question.message_id && question.order_id)) {
    const result = isEnquiry
      ? await answerEnquiryQuestion(supabase, question, answer, { client })
      : await answerUpdateQuestion(supabase, question, answer, { client });
    await supabase.from("pcd_alfred_runs").insert({
      job: "answer",
      finished_at: new Date().toISOString(),
      drafts_made: result.made === "draft" ? 1 : 0,
      input_tokens: result.spent.input,
      output_tokens: result.spent.output,
      cost_usd: result.spent.cost,
      problems: result.problem || null,
    });
    if (result.made === "problem") throw fail(`Your answer is saved, but Alfred could not draft: ${result.problem}`, 502);
    return { ok: true, made: result.made, draftId: result.draftId || null };
  }
  if (!question.ticket_id || !question.message_id) return { ok: true, made: "nothing" };

  const { data: ticket } = await supabase.from("pcd_tickets").select("id, customer_id, subject").eq("id", question.ticket_id).maybeSingle();
  if (!ticket) return { ok: true, made: "nothing" };
  // The question held the conversation's place. The draft takes it now.
  const result = await draftOneReply(supabase, { ticket, messageId: question.message_id, answer, client });
  await supabase.from("pcd_alfred_runs").insert({
    job: "answer",
    finished_at: new Date().toISOString(),
    drafts_made: result.made === "draft" ? 1 : 0,
    input_tokens: result.spent.input,
    output_tokens: result.spent.output,
    cost_usd: result.spent.cost,
    problems: result.problem || null,
  });
  if (result.made === "problem") throw fail(`Your answer is saved, but Alfred could not draft: ${result.problem}`, 502);
  return { ok: true, made: result.made, draftId: result.draftId || null };
}

/**
 * The quote request and enquiry pass, run hourly with the replies. Quotes cost
 * nothing (no model), enquiries cost a reply each, and both count toward the
 * daily draft limit.
 */
export async function runIntakeDrafts(supabase, { now = new Date(), client } = {}) {
  const summary = { ok: true, enabled: false, quotes: 0, drafts: 0, questions: 0, skipped: 0, problems: [], cost: 0 };
  const { settings, available, error } = await getAlfredSettings(supabase);
  if (!available) {
    summary.problems.push(error);
    return summary;
  }
  if (!settings.enabled || (!settings.jobs.quotes && !settings.jobs.enquiries)) return summary;
  summary.enabled = true;

  const usage = await alfredUsage(supabase, now);
  let room = settings.daily_draft_cap - usage.draftsToday;
  if (room <= 0) {
    summary.problems.push(`The daily limit of ${settings.daily_draft_cap} drafts is reached.`);
    return summary;
  }
  const { data: run } = await supabase.from("pcd_alfred_runs").insert({ job: "intake" }).select("id").single();
  let input = 0;
  let output = 0;

  if (settings.jobs.quotes) {
    const quotes = await runQuoteDrafts(supabase, settings, { now, room: Math.min(PER_PASS, room) });
    summary.quotes = quotes.drafts;
    summary.problems.push(...quotes.problems);
    room -= quotes.drafts;
  }
  if (settings.jobs.enquiries && room > 0) {
    if (usage.spentThisMonth >= settings.monthly_spend_cap_usd) {
      summary.problems.push(`The monthly limit of US$${settings.monthly_spend_cap_usd} is reached, so no enquiry replies were drafted.`);
    } else {
      const replies = await runEnquiryReplies(supabase, { now, room: Math.min(PER_PASS, room), client });
      summary.drafts = replies.drafts;
      summary.questions = replies.questions;
      summary.skipped = replies.skipped;
      summary.cost = replies.cost;
      summary.problems.push(...replies.problems);
      input = replies.input;
      output = replies.output;
    }
  }

  if (run?.id) {
    await supabase
      .from("pcd_alfred_runs")
      .update({
        finished_at: new Date().toISOString(),
        drafts_made: summary.quotes + summary.drafts,
        questions_asked: summary.questions,
        skipped: summary.skipped,
        input_tokens: input,
        output_tokens: output,
        cost_usd: summary.cost,
        problems: summary.problems.join("\n") || null,
      })
      .eq("id", run.id);
  }
  return summary;
}
