// THE SWEEP. Everything the webhooks did not tell us.
//
// ── THE TWO JOBS ─────────────────────────────────────────────────────────────
//
// RECONCILE. A deposit that was paid but never finalised, because the webhook
// was lost, the endpoint was mid-deployment, or Stripe gave up retrying. This
// is the one that matters: the customer has paid and is waiting, and nothing on
// our side knows. Every open attempt is asked about directly rather than waited
// on, so the worst case is hours rather than forever.
//
// CHASE. The two reminders, and the note to sales@ when somebody goes quiet.
//
// ── WHY IT ASKS STRIPE RATHER THAN TRUSTING OUR ROWS ─────────────────────────
//
// Our row says what we were last told. The whole reason this exists is that we
// are sometimes not told. So an open attempt is resolved by asking Stripe what
// actually happened to it, and our row is corrected from the answer.
//
// ── SAFE TO RUN TWICE, OR HALFWAY ────────────────────────────────────────────
//
// Finalising claims the quote conditionally, so two overlapping passes cannot
// both create an order. Every reminder is stamped before the next quote is
// looked at, so a pass that is cut short resumes rather than repeating. Nothing
// here throws outwards: one quote failing must not stop the rest of the sweep,
// because the one it stops on might be the one with money sitting against it.

import { retrieveCheckoutSession } from "./pcd-stripe";
import { finaliseDepositAcceptance, markCheckoutExpired, AWAITING_DEPOSIT } from "./pcd-deposit-gate";
import {
  sendDepositFinalReminder,
  sendDepositReminder,
  sendDepositUnpaidToSales,
} from "./pcd-deposit-emails";

const HOUR = 60 * 60 * 1000;
export const FIRST_REMINDER_AFTER_MS = 1 * HOUR;
export const FINAL_REMINDER_AFTER_MS = 24 * HOUR;

// A pass is bounded so a backlog cannot run past the function's time limit. It
// is far above anything real, and whatever is left is picked up next pass.
const MAX_PER_PASS = 200;

const age = (since, now) => now.getTime() - new Date(since).getTime();

/**
 * Ask Stripe what really happened to every attempt we still think is open.
 *
 * @returns {Promise<{checked:number, finalised:number, expired:number, problems:string[]}>}
 */
export async function reconcileOpenCheckouts(supabase, { now = new Date() } = {}) {
  const summary = { checked: 0, finalised: 0, expired: 0, problems: [] };

  const { data: open, error } = await supabase
    .from("pcd_quote_checkouts")
    .select("id, quote_id, stripe_checkout_session_id, expires_at")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(MAX_PER_PASS);
  if (error) throw error;

  for (const checkout of open || []) {
    summary.checked += 1;
    try {
      const session = await retrieveCheckoutSession(checkout.stripe_checkout_session_id);

      if (session?.payment_status === "paid") {
        // THE ONE THAT MATTERS. Money arrived and nobody told us.
        const result = await finaliseDepositAcceptance(supabase, session);
        if (result.ok && !result.alreadyDone) {
          summary.finalised += 1;
          console.error(
            `[deposit-sweep] RECOVERED a paid deposit the webhook never delivered: session ` +
              `${session.id} became order ${result.orderId}. Check the Stripe webhook endpoint is healthy.`
          );
        } else if (!result.ok && result.needsAttention) {
          summary.problems.push(`${session.id} needs attention: ${result.reason}`);
        }
        continue;
      }

      // Stripe has closed it unpaid, or the 24 hours simply ran out. Either way
      // the page is no longer usable, so our row must stop saying it is. The
      // quote stays held: they have not said no, they have not finished.
      const expiredAtStripe = session?.status === "expired";
      const pastItsTime = checkout.expires_at && new Date(checkout.expires_at).getTime() <= now.getTime();
      if (expiredAtStripe || pastItsTime) {
        await markCheckoutExpired(supabase, checkout.stripe_checkout_session_id);
        summary.expired += 1;
      }
    } catch (error) {
      // A session Stripe will not talk about is not a reason to abandon the
      // rest of the pass, and it will be asked about again next time.
      summary.problems.push(`${checkout.stripe_checkout_session_id}: ${error?.message || error}`);
    }
  }

  return summary;
}

/**
 * The two reminders, and the note to sales@.
 *
 * Each stamp is written IMMEDIATELY after its send, not at the end of the pass.
 * A pass that dies halfway must not send the same reminder again next time.
 *
 * @returns {Promise<{first:number, skippedFirst:number, final:number, sales:number, problems:string[]}>}
 */
export async function sendDepositChases(supabase, { now = new Date(), baseUrl = "" } = {}) {
  const summary = { first: 0, skippedFirst: 0, final: 0, sales: 0, problems: [] };

  const { data: held, error } = await supabase
    .from("pcd_quotes")
    .select("*")
    .eq("status", AWAITING_DEPOSIT)
    .order("awaiting_deposit_at", { ascending: true })
    .limit(MAX_PER_PASS);
  if (error) throw error;

  for (const quote of held || []) {
    // Nothing to time from. Only possible on a row from before this shipped,
    // and stamping it here means the chase starts from now rather than never.
    if (!quote.awaiting_deposit_at) {
      await supabase
        .from("pcd_quotes")
        .update({ awaiting_deposit_at: now.toISOString() })
        .eq("id", quote.id);
      continue;
    }

    const held_for = age(quote.awaiting_deposit_at, now);

    // ONE CUSTOMER EMAIL PER PASS, AND IT IS THE RIGHT ONE.
    //
    // Both reminders can come due in the same pass, and then sending both would
    // put "one step left" and "final reminder" in somebody's inbox seconds
    // apart, which reads as a machine malfunctioning rather than a business
    // following up.
    //
    // It is not a rare case. The sweep runs twice a day, so anything held for
    // over 24 hours by its first pass crosses both thresholds at once: a quote
    // approved while the sweep was down, the backlog on the first run after a
    // deploy, or every held quote at once if the GitHub schedule ever lapses and
    // only the daily Vercel pass is left.
    //
    // When both are due the first is skipped, not sent late. An hour ago has
    // passed; the honest email is the one that says this is the last word.
    const finalIsDue = !quote.deposit_final_reminded_at && held_for >= FINAL_REMINDER_AFTER_MS;

    try {
      if (!quote.deposit_reminded_at && held_for >= FIRST_REMINDER_AFTER_MS && !finalIsDue) {
        const sent = await sendDepositReminder(quote, { baseUrl });
        // Stamped either way. A reminder the mail provider refused is a missing
        // reminder; retrying it every pass would be a loop, and the final one
        // still goes regardless.
        await supabase
          .from("pcd_quotes")
          .update({ deposit_reminded_at: now.toISOString() })
          .eq("id", quote.id);
        if (sent.ok) summary.first += 1;
        else summary.problems.push(`${quote.quote_number} first reminder: ${sent.error}`);
      } else if (!quote.deposit_reminded_at && finalIsDue) {
        // Stamped without sending, so it is not still pending tomorrow. Counted
        // separately, because a run that skips a lot of these is telling you the
        // sweep has not been running.
        await supabase
          .from("pcd_quotes")
          .update({ deposit_reminded_at: now.toISOString() })
          .eq("id", quote.id);
        summary.skippedFirst += 1;
      }

      if (finalIsDue) {
        const sent = await sendDepositFinalReminder(quote, { baseUrl });
        await supabase
          .from("pcd_quotes")
          .update({ deposit_final_reminded_at: now.toISOString() })
          .eq("id", quote.id);
        if (sent.ok) summary.final += 1;
        else summary.problems.push(`${quote.quote_number} final reminder: ${sent.error}`);
      }

      // Stamped separately from the customer's final reminder even though the
      // two go together, so one being refused cannot swallow the other.
      if (!quote.deposit_staff_notified_at && held_for >= FINAL_REMINDER_AFTER_MS) {
        const { count } = await supabase
          .from("pcd_quote_checkouts")
          .select("id", { count: "exact", head: true })
          .eq("quote_id", quote.id);

        const sent = await sendDepositUnpaidToSales(quote, { baseUrl, attempts: count || 1 });
        await supabase
          .from("pcd_quotes")
          .update({ deposit_staff_notified_at: now.toISOString() })
          .eq("id", quote.id);
        if (sent.ok) summary.sales += 1;
        else summary.problems.push(`${quote.quote_number} sales notice: ${sent.error}`);
      }
    } catch (error) {
      summary.problems.push(`${quote.quote_number}: ${error?.message || error}`);
    }
  }

  return summary;
}

/** Both halves, in the order that matters: settle the money before chasing it. */
export async function runDepositSweep(supabase, { now = new Date(), baseUrl = "" } = {}) {
  // RECONCILE FIRST, ALWAYS. Chasing before settling would email somebody a
  // demand for a deposit they paid twenty minutes ago.
  const reconciled = await reconcileOpenCheckouts(supabase, { now });
  const chased = await sendDepositChases(supabase, { now, baseUrl });
  return {
    ok: true,
    reconciled,
    chased,
    problems: [...reconciled.problems, ...chased.problems],
  };
}
