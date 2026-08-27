// THE 30 DAY QUOTE CLOCK.
//
// ── THE SILENCE THIS FILLS ───────────────────────────────────────────────────
//
// A quote went out and then nothing happened to it, ever. The customer was
// never told it had a life, it never closed, and it sat at 'sent' forever while
// the price on it drifted further from what we could actually build it for.
// Lead conversion already treated anything past its validity as lost, so the
// books said the quote was gone while the system said it was live and still
// approvable at last month's rates.
//
// ── THE CLOCK ────────────────────────────────────────────────────────────────
//
//   day 0            sent. sent_at is the start, not created_at: the clock
//                    belongs to the email the customer is holding.
//   day 23           one email. Expires in 7 days, on this date, here is the
//                    link, and doing nothing is a complete answer.
//   day 30           last day it can be approved.
//   day 31           archived. The link stops resolving and reporting counts it
//                    as a lost lead.
//
// 23 and 31 are not typed anywhere. They are quote_valid_days from Business
// Defaults, minus the seven days' notice, and plus one. Change the setting and
// the whole clock moves with it.
//
// ── WHAT IT WILL NOT TOUCH ───────────────────────────────────────────────────
//
// Only 'sent' and 'viewed'. An approved quote, a quote awaiting its deposit, a
// rejected one, a draft, one already archived and one that has become an order
// are all invisible to this. awaiting_deposit matters most of the four: those
// customers said yes and are part way through paying, the deposit sweep is
// already chasing them, and two jobs writing to the same person about the same
// quote is how somebody gets an "act now" and a "thanks for approving" in the
// same hour.
//
// ── RE-SENDING RESTARTS EVERYTHING ───────────────────────────────────────────
//
// The send route overwrites sent_at, so a re-sent quote gets its full validity
// again, which is what a customer holding a fresh email would expect. It also
// has to clear expiry_warned_at, or the second send is never warned about,
// because the stamp from the first one is still sitting there.
//
// ── SAFE TO RUN TWICE, OR HALFWAY ────────────────────────────────────────────
//
// Every stamp is written immediately after its send rather than at the end of
// the pass, so a run that is cut short resumes rather than repeating. Archiving
// is filtered on the status it expects, so two overlapping passes cannot both
// claim the same quote. Nothing here throws outwards: one bad quote must not
// stop the rest of the sweep.

import { ARCHIVED_EXPIRED, quoteArchivePatch } from "./pcd-archive";
import { logOrderActivity } from "./pcd-activity-log";
import { quoteValidDays } from "./pcd-business-defaults";
import { digestRow, perthDate, sendQuoteExpiryDigest, sendQuoteExpiryReminder } from "./pcd-quote-expiry-emails";
// THE COUNTING LIVES IN ONE FILE, and lead conversion reads the same one. If
// this job and that report ever counted a day differently, a quote could be
// archived here while the report still called it live, or reported lost while
// its link still worked. See lib/pcd-quote-clock.js.
import { daysUntilExpiry, expiresAt, expiryState, UNANSWERED_STATUSES } from "./pcd-quote-clock";

// A pass is bounded so a backlog cannot run past the function's time limit. Far
// above anything real, and whatever is left is picked up on the next pass.
const MAX_PER_PASS = 300;

const DAY_MS = 86400000;

/**
 * Claim a job that must only run once in a window, whoever calls it.
 *
 * TWO SCHEDULERS CALL THESE ROUTES, deliberately: GitHub Actions and Vercel's
 * own cron, so one of them lapsing does not stop the work. For the twice daily
 * sweep that is harmless, because every send is stamped. For a weekly digest it
 * would mean two identical emails, so this is a compare and swap on the stamp:
 * whoever writes it first wins and the other is told no.
 *
 * @returns {Promise<boolean>} true if this caller may do the work
 */
export async function claimJobRun(supabase, job, intervalMs, now = new Date()) {
  const { data: existing, error } = await supabase
    .from("pcd_job_stamps")
    .select("last_run_at")
    .eq("job", job)
    .maybeSingle();

  // A table that is not there yet means the migration has not been run. Refusing
  // is the safe answer: a digest not sent is a missing email, a digest sent
  // every pass is four a day into sales@.
  if (error) {
    console.error(`[quote-expiry] could not read the job stamp for ${job}: ${error.message}`);
    return false;
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from("pcd_job_stamps")
      .insert({ job, last_run_at: now.toISOString() });
    // A duplicate key here is the other pass having won the race. Correct.
    return !insertError;
  }

  if (now.getTime() - new Date(existing.last_run_at).getTime() < intervalMs) return false;

  const { data: claimed, error: updateError } = await supabase
    .from("pcd_job_stamps")
    .update({ last_run_at: now.toISOString() })
    .eq("job", job)
    // THE SWAP. Only succeeds if nobody else has moved the stamp since it was
    // read, so two passes arriving together cannot both send.
    .eq("last_run_at", existing.last_run_at)
    .select("job");

  return !updateError && Boolean(claimed?.length);
}

/**
 * Tell the customers whose quotes are inside their last seven days, and archive
 * the ones that have run out.
 *
 * @returns {Promise<{warned:number, archived:number, archivedUnwarned:number, problems:string[]}>}
 */
export async function runQuoteExpirySweep(supabase, { now = new Date(), baseUrl = "", validDays } = {}) {
  const summary = { warned: 0, archived: 0, archivedUnwarned: 0, problems: [], validDays };

  const { data: quotes, error } = await supabase
    .from("pcd_quotes")
    .select("*")
    .in("status", UNANSWERED_STATUSES)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: true })
    .limit(MAX_PER_PASS);
  if (error) throw error;

  for (const quote of quotes || []) {
    const state = expiryState(quote, { validDays, now });
    if (state === "out_of_scope" || state === "waiting" || state === "warned") continue;

    try {
      if (state === "warn") {
        const due = expiresAt(quote.sent_at, validDays);
        await sendQuoteExpiryReminder(quote, {
          baseUrl,
          validDays,
          expiresAt: due,
          // Counted rather than assumed to be seven. A pass that runs late, or
          // a backlog cleared after an outage, would otherwise tell somebody
          // they have a week when they have three days.
          daysLeft: daysUntilExpiry(quote.sent_at, validDays, now),
          includePrice: quote.sent_with_price !== false,
        });

        // STAMPED EITHER WAY, and immediately. A reminder the mail provider
        // refused is a missing reminder; retrying it every pass would be a loop
        // that fills somebody's inbox the moment the provider recovers. The
        // problem is reported instead, and the archive still happens on time.
        await supabase
          .from("pcd_quotes")
          .update({ expiry_warned_at: now.toISOString() })
          .eq("id", quote.id);

        await logOrderActivity(supabase, {
          quote_id: quote.id,
          customer_id: quote.customer_id || null,
          actor_type: "system",
          action_type: "quote_expiry_warned",
          title: "Expiry reminder sent",
          description:
            `${quote.quote_number} expires on ${perthDate(due)}. The customer was emailed to say so and ` +
            `that it will be archived after that date.`,
          metadata: { quote_number: quote.quote_number, expires_at: due?.toISOString() || null },
          // Once per quote per send. Clearing expiry_warned_at on a re-send is
          // what lets a genuinely re-sent quote be warned again.
          event_key: `quote:${quote.id}:expiry-warned:${quote.sent_at}`,
        });

        summary.warned += 1;
        continue;
      }

      // ── EXPIRED ──────────────────────────────────────────────────────────
      //
      // No email. Somebody who never answered does not need to be told the
      // thing they ignored has closed, and a customer whose quote lapsed while
      // this job was not running would get "it expires in 7 days" and "it has
      // expired" within a minute of each other.
      const patch = quoteArchivePatch(quote, ARCHIVED_EXPIRED, now.toISOString());
      const { data: archived, error: archiveError } = await supabase
        .from("pcd_quotes")
        .update({ ...patch, updated_at: now.toISOString() })
        .eq("id", quote.id)
        // CLAIMED, NOT ASSUMED. Filtering on the status we read means a customer
        // who approved in the seconds since cannot have their quote archived out
        // from under them, and two overlapping passes cannot both count it.
        .eq("status", quote.status)
        .select("id");
      if (archiveError) throw archiveError;
      if (!archived?.length) continue;

      const warned = Boolean(quote.expiry_warned_at);
      await logOrderActivity(supabase, {
        quote_id: quote.id,
        customer_id: quote.customer_id || null,
        actor_type: "system",
        action_type: "quote_archived_expired",
        title: "Quote archived, no answer",
        description:
          `${quote.quote_number} was sent on ${perthDate(quote.sent_at)} and had no answer within ` +
          `${validDays} days, so it has been archived and its link no longer works. ` +
          (warned
            ? "The customer was reminded seven days before it expired."
            : "It expired before a reminder could be sent, so the customer was not warned.") +
          " Restore it from the quote if it is needed again.",
        metadata: {
          quote_number: quote.quote_number,
          valid_days: validDays,
          warned,
          archived_from_status: quote.status,
        },
        event_key: `quote:${quote.id}:expired`,
      });

      summary.archived += 1;
      if (!warned) summary.archivedUnwarned += 1;
    } catch (thrown) {
      summary.problems.push(`${quote.quote_number}: ${thrown?.message || thrown}`);
    }
  }

  return summary;
}

/**
 * The week, gathered for the digest.
 *
 * Read back out of the database rather than accumulated during the sweep, so a
 * digest describes the week rather than the last pass, and still tells the truth
 * on a week where a pass failed.
 */
export async function gatherExpiryDigest(supabase, { now = new Date(), validDays, sinceMs = 7 * DAY_MS } = {}) {
  const since = new Date(now.getTime() - sinceMs);

  const [{ data: archived }, { data: live }] = await Promise.all([
    supabase
      .from("pcd_quotes")
      .select("quote_number, customer_name, sent_at, total_inc_gst, currency, expiry_warned_at, archived_at")
      .eq("status", "archived")
      .eq("archived_reason", ARCHIVED_EXPIRED)
      .gte("archived_at", since.toISOString())
      .order("archived_at", { ascending: true }),
    supabase
      .from("pcd_quotes")
      .select("quote_number, customer_name, sent_at, total_inc_gst, currency, expiry_warned_at, status, order_id")
      .in("status", UNANSWERED_STATUSES)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: true }),
  ]);

  const expiringSoon = [];
  const warned = [];

  for (const quote of live || []) {
    const state = expiryState(quote, { validDays, now });
    if (state !== "warn" && state !== "warned") continue;
    const row = digestRow(quote, {
      expiresAt: expiresAt(quote.sent_at, validDays),
      daysLeft: daysUntilExpiry(quote.sent_at, validDays, now),
    });
    // Oldest first, which on this list is the one closest to closing.
    expiringSoon.push(row);
    if (quote.expiry_warned_at && new Date(quote.expiry_warned_at) >= since) warned.push(row);
  }

  return {
    since,
    archived: (archived || []).map((quote) => digestRow(quote)),
    expiringSoon,
    warned,
  };
}

/** The sweep, then the digest once a week. */
export async function runQuoteExpiry(supabase, { now = new Date(), baseUrl = "" } = {}) {
  const validDays = await quoteValidDays(supabase);
  const swept = await runQuoteExpirySweep(supabase, { now, baseUrl, validDays });

  // Six days rather than seven, so a digest is never skipped a whole week
  // because one pass ran a few minutes early.
  const digestDue = await claimJobRun(supabase, "quote-expiry-digest", 6 * DAY_MS, now);
  let digest = null;
  if (digestDue) {
    const gathered = await gatherExpiryDigest(supabase, { now, validDays });
    const sent = await sendQuoteExpiryDigest({ ...gathered, baseUrl });
    digest = {
      sent: sent.ok,
      archived: gathered.archived.length,
      expiringSoon: gathered.expiringSoon.length,
      warned: gathered.warned.length,
    };
    if (!sent.ok) swept.problems.push(`weekly digest: ${sent.error}`);
  }

  return { ok: true, ...swept, digest };
}
