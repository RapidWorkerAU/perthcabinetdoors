// THE HOURLY PASS, AND THE MORNING LIST.
//
// ── WHY HOURLY ───────────────────────────────────────────────────────────────
//
// Every other job here is timed in days, so once or twice a day is enough for
// them. This one is not: a booking at half past nine wants its ask at half past
// nine the day before, and a daily pass can only ever be right by accident. An
// hourly pass is never more than an hour late, which for a day of notice is
// close enough and is the coarsest schedule that can honestly claim "24 hours
// before".
//
// Vercel's Hobby plan refuses anything more often than daily, which is why
// .github/workflows/scheduled-sync.yml already exists as a second scheduler.
// The hourly schedule lives there and Vercel keeps a daily pass as a floor.
//
// ── RUNNING IT TWICE IS SAFE ─────────────────────────────────────────────────
//
// Every ask is claimed on the row before it is sent, with a conditional update
// that only succeeds from 'not_asked', so two passes arriving together produce
// one email. The morning list is claimed through pcd_job_stamps the same way
// the quote expiry digest is.

import {
  claimAsk,
  isDueToAsk,
  markAskFailed,
  markAsked,
  withinSendingHours,
} from "./pcd-booking-confirmations";
import {
  sendAskFailureToSales,
  sendBookingAsk,
  sendMorningChase,
  sendUnlinkedAskToSales,
} from "./pcd-booking-confirmation-emails";
import { perthDayOf, perthInstant } from "./pcd-calendar";

const EVENTS = "pcd_calendar_events";
const CHASE_JOB = "booking-confirmation-chase";

/** How many asks one pass will carry. A backlog only builds after an outage. */
const BATCH = 40;

/**
 * Ask about everything starting in the next 24 hours.
 *
 * QUIET HOURS ARE CHECKED HERE, once, rather than per booking. A pass that runs
 * at four in the morning does nothing and the seven o'clock one picks up
 * everything it left, which is what puts an overnight booking's ask at a
 * reasonable hour instead of at four.
 */
export async function runBookingAsks(supabase, { now = new Date(), baseUrl = "" } = {}) {
  const summary = { considered: 0, asked: 0, toSales: 0, failed: 0, quiet: false, problems: [] };

  if (!withinSendingHours(now)) {
    summary.quiet = true;
    return summary;
  }

  // The index this reads is on starts_at where confirm_state is not_asked, so
  // the window is applied in the database rather than by pulling the calendar.
  const horizon = new Date(now.getTime() + 25 * 3600000).toISOString();

  const { data, error } = await supabase
    .from(EVENTS)
    .select("*")
    .eq("confirm_state", "not_asked")
    .eq("status", "booked")
    .lte("starts_at", horizon)
    .gte("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    summary.problems.push(`Could not read the calendar: ${error.message}`);
    return summary;
  }

  for (const row of data || []) {
    if (!isDueToAsk(row, now)) continue;
    summary.considered += 1;

    const result = await askAbout(supabase, row, { baseUrl, now });
    if (result.asked) summary.asked += 1;
    if (result.toSales) summary.toSales += 1;
    if (result.failed) summary.failed += 1;
    if (result.problem) summary.problems.push(result.problem);
  }

  return summary;
}

/**
 * Ask about one booking, if nobody has already.
 *
 * ONE DEFINITION, TWO CALLERS. The hourly pass uses it, and so does saving a
 * booking that is already inside the window, see app/api/admin/calendar/route.js.
 * They share the claim on the row, so whichever arrives first sends and the
 * other finds nothing to do.
 *
 * Never throws. The booking is already saved by the time this runs.
 */
export async function askAbout(supabase, row, { baseUrl = "", now = new Date() } = {}) {
  const claimed = await claimAsk(supabase, row, { now });
  // Somebody else got there first. Correct, and not worth reporting.
  if (!claimed) return { skipped: true };

  try {
    if (claimed.customer_id) {
      const { data: customer } = await supabase
        .from("pcd_customers")
        .select("id, name, email, phone")
        .eq("id", claimed.customer_id)
        .maybeSingle();

      const sent = await sendBookingAsk(claimed, { customer, baseUrl });
      if (sent.ok) {
        await markAsked(supabase, claimed, customer?.email || "");
        return { asked: true };
      }

      await markAskFailed(supabase, claimed, sent.error);
      // The one internal email that does not wait for the morning list, because
      // it is the only one still actionable while there is a day to act in.
      await sendAskFailureToSales(claimed, { reason: sent.error, customer, baseUrl });
      return { failed: true, problem: `${claimed.title}: ${sent.error}` };
    }

    // Ours, with nobody on it. There is nobody to ask, so we are asked.
    const sent = await sendUnlinkedAskToSales(claimed, { baseUrl });
    if (sent.ok) {
      await markAsked(supabase, claimed, "sales@");
      return { toSales: true };
    }
    await markAskFailed(supabase, claimed, sent.error);
    return { failed: true, problem: `${claimed.title}: ${sent.error}` };
  } catch (thrown) {
    // One booking must never stop a pass, and must never fail a save. The row
    // is left saying the ask did not go, which is what the calendar reads back.
    const message = thrown?.message || "The ask could not be sent.";
    await markAskFailed(supabase, claimed, message);
    return { failed: true, problem: `${claimed.title}: ${message}` };
  }
}

/**
 * A booking saved with less than a day to go, asked about there and then.
 *
 * Returns a plain description rather than throwing, so the save reports what
 * happened without ever depending on it.
 */
export async function askOnSave(supabase, row, baseUrl) {
  try {
    const now = new Date();
    if (!isDueToAsk(row, now)) return { asked: false, reason: "not due yet" };
    if (!withinSendingHours(now)) return { asked: false, reason: "outside sending hours" };
    const result = await askAbout(supabase, row, { baseUrl, now });
    return { asked: Boolean(result.asked || result.toSales), ...result };
  } catch (thrown) {
    console.error(`[booking-confirm] could not ask on save: ${thrown?.message || thrown}`);
    return { asked: false, reason: thrown?.message || "The ask could not be sent." };
  }
}

/**
 * The morning list, once a day, at the first pass on or after 7am Perth.
 *
 * Claimed through pcd_job_stamps so two passes cannot both send it, and so it
 * needs no schedule of its own to forget about.
 */
export async function runMorningChase(supabase, { now = new Date(), baseUrl = "" } = {}) {
  const today = perthDayOf(now);
  const sevenAm = perthInstant(today, 7 * 60);
  if (!sevenAm || now < sevenAm) return { sent: false, reason: "before seven" };

  const claimed = await claimChase(supabase, now);
  if (!claimed) return { sent: false, reason: "already sent today" };

  const dayStart = perthInstant(today, 0);
  const dayEnd = perthInstant(today, 24 * 60);

  const { data, error } = await supabase
    .from(EVENTS)
    .select("*")
    .in("confirm_state", ["asked", "failed"])
    .eq("status", "booked")
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at", { ascending: true });

  if (error) return { sent: false, reason: error.message };

  const rows = data || [];
  const waiting = rows.filter((row) => row.confirm_state === "asked");
  const couldNotAsk = rows.filter((row) => row.confirm_state === "failed");

  const sent = await sendMorningChase({ waiting, couldNotAsk, baseUrl });
  return { sent: Boolean(sent.ok), waiting: waiting.length, couldNotAsk: couldNotAsk.length, skipped: sent.skipped };
}

/** Compare and swap on the stamp. Lifted from the quote expiry digest. */
async function claimChase(supabase, now) {
  const { data: existing, error } = await supabase
    .from("pcd_job_stamps")
    .select("last_run_at")
    .eq("job", CHASE_JOB)
    .maybeSingle();

  if (error) {
    console.error(`[booking-confirm] could not read the chase stamp: ${error.message}`);
    return false;
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from("pcd_job_stamps")
      .insert({ job: CHASE_JOB, last_run_at: now.toISOString() });
    return !insertError;
  }

  // Once per Perth day, not once per 24 hours, so it does not creep later.
  if (perthDayOf(existing.last_run_at) === perthDayOf(now)) return false;

  const { data: claimed, error: updateError } = await supabase
    .from("pcd_job_stamps")
    .update({ last_run_at: now.toISOString() })
    .eq("job", CHASE_JOB)
    .eq("last_run_at", existing.last_run_at)
    .select("job");

  return !updateError && Boolean(claimed?.length);
}
