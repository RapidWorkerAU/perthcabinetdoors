// ALFRED'S MORNING RUN, 6:30AM PERTH.
//
// Withdraws drafts that went stale overnight, prepares the order updates that
// are due (lib/pcd-alfred-updates.js), then sends the morning summary: what is
// waiting for a person, and which orders are due an update today. Figures and
// names only. The summary never judges whether anybody is behind.
//
// The same switch and limits as every other job. Nothing here emails a
// customer: the summary goes to the address in Settings, Alfred.

import { Resend } from "resend";
import { getAlfredSettings } from "./pcd-alfred-settings";
import { alfredUsage, withdrawStale } from "./pcd-alfred-drafts";
import { ordersAgainstTheGap, runOrderUpdates } from "./pcd-alfred-updates";
import { emailShell } from "./pcd-email-templates";
import { sendEmail } from "./pcd-send-email";
import { perthDate } from "./pcd-alfred-context";

const perthDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The summary subject line. Pure, so its wording is tested. */
export function morningSummarySubject({ drafts, questions, due, day }) {
  return `Alfred: ${plural(drafts, "draft")}, ${plural(questions, "question")}, ${due} due an update · ${day}`;
}

/** The summary email. Pure, so its wording is tested. */
export function morningSummaryHtml({ drafts, questions, due, adminUrl }) {
  const rows = due
    .map(
      (e) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${esc(e.customerName || "Customer")}<div style="color:#64748b;font-size:12px;">${esc(e.order.order_number)}</div></td>` +
        `<td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;">${e.lastContactAt ? `${e.daysSince} days since we wrote` : "Not written to since the order was raised"}</td></tr>`
    )
    .join("");
  return emailShell({
    title: "Alfred's morning summary",
    intro: `${drafts} draft${drafts === 1 ? "" : "s"} and ${questions} question${questions === 1 ? "" : "s"} waiting for you.`,
    children:
      (due.length
        ? `<p style="margin:0 0 6px;font-size:14px;font-weight:700;">Orders due an update</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`
        : `<p style="margin:0;font-size:14px;color:#334155;">No orders are due an update today.</p>`) +
      `<p style="margin:18px 0 0;"><a href="${esc(adminUrl)}" style="display:inline-block;background:#0d3550;color:#ffffff;text-decoration:none;padding:12px 18px;font-size:14px;font-weight:700;border-radius:6px;">Open Alfred</a></p>`,
  });
}

export async function runAlfredMorning(supabase, { now = new Date(), baseUrl = "", client, sendSummary = true } = {}) {
  const summary = { ok: true, enabled: false, drafts: 0, questions: 0, withdrawn: 0, problems: [], cost: 0, summarySent: false };
  const { settings, available, error } = await getAlfredSettings(supabase);
  if (!available) {
    summary.problems.push(error);
    return summary;
  }
  if (!settings.enabled) return summary;
  summary.enabled = true;

  // ONCE A DAY. The schedule is .github/workflows/alfred.yml alone, but a
  // retried call must still never send the summary twice or pay for the same
  // drafts again. The Check orders now button is not the schedule, so it runs.
  if (sendSummary) {
    const midnight = new Date(`${perthDay(now)}T00:00:00+08:00`).toISOString();
    const { count } = await supabase.from("pcd_alfred_runs").select("id", { count: "exact", head: true }).eq("job", "morning").gte("started_at", midnight);
    if (count) {
      summary.problems.push("The morning pass already ran today.");
      return summary;
    }
  }

  const { data: run } = await supabase.from("pcd_alfred_runs").insert({ job: "morning" }).select("id").single();
  summary.withdrawn = await withdrawStale(supabase, settings, now);

  let due = [];
  if (settings.jobs.updates) {
    const usage = await alfredUsage(supabase, now);
    let room = settings.daily_draft_cap - usage.draftsToday;
    if (usage.spentThisMonth >= settings.monthly_spend_cap_usd) {
      summary.problems.push(`The monthly limit of US$${settings.monthly_spend_cap_usd} is reached, so no updates were drafted.`);
      room = 0;
    }
    const result = await runOrderUpdates(supabase, settings, { now, room, client });
    summary.drafts = result.drafts;
    summary.questions = result.questions;
    summary.cost = result.cost;
    summary.problems.push(...result.problems);
    due = result.due;
    if (run?.id) {
      await supabase
        .from("pcd_alfred_runs")
        .update({
          finished_at: new Date().toISOString(),
          drafts_made: result.drafts,
          questions_asked: result.questions,
          input_tokens: result.input,
          output_tokens: result.output,
          cost_usd: result.cost,
          problems: summary.problems.join("\n") || null,
        })
        .eq("id", run.id);
    }
  } else {
    due = (await ordersAgainstTheGap(supabase, settings, now)).filter((e) => e.due);
    if (run?.id) await supabase.from("pcd_alfred_runs").update({ finished_at: new Date().toISOString() }).eq("id", run.id);
  }

  // No summary on a Sunday: nobody is at work to act on it, and Monday's says
  // the same thing.
  const sunday = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Perth", weekday: "long" }).format(now) === "Sunday";
  if (sendSummary && settings.summary_enabled && !sunday && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    const [{ count: drafts }, { count: questions }] = await Promise.all([
      supabase.from("pcd_alfred_drafts").select("id", { count: "exact", head: true }).eq("status", "waiting"),
      supabase.from("pcd_alfred_questions").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);
    const sent = await sendEmail(new Resend(process.env.RESEND_API_KEY), {
      from: process.env.RESEND_FROM_EMAIL,
      to: [settings.summary_email],
      subject: morningSummarySubject({ drafts: drafts || 0, questions: questions || 0, due: due.length, day: perthDate(now) }),
      html: morningSummaryHtml({
        drafts: drafts || 0,
        questions: questions || 0,
        due,
        adminUrl: `${String(baseUrl || "").replace(/\/+$/, "")}/admin/alfred/waiting`,
      }),
    });
    summary.summarySent = sent.ok;
    if (!sent.ok) summary.problems.push(`Morning summary: ${sent.error}`);
  }
  return summary;
}
