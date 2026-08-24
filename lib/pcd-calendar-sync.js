// Keeping the calendar and the sales mailbox in step.
//
// TWO DIRECTIONS, ONE RULE EACH.
//
//   OUT. A booking saved here is written to the mailbox calendar and its
//   Outlook id is stored on the row. Every later change is a PATCH against that
//   id, so moving a measure moves the one event rather than adding another.
//
//   IN. Microsoft tells us when anything in that calendar changes and we re-read
//   what moved. An event that is ours updates the row it belongs to. An event
//   that is not ours becomes a row of its own, so an appointment typed straight
//   into Outlook still shows on the calendar and the day reads honestly.
//
// THE ECHO. Our own write comes straight back as a notification, and if that
// were treated as a change from Outlook the two sides would take turns updating
// each other forever. Every Graph event carries a changeKey that Microsoft
// changes on every edit; the key we stored on the way out is compared with the
// one that comes back, and a match means nothing happened that we did not do.
//
// RUNNING IT TWICE IS SAFE, and deliberately so. graph_event_id is unique, so
// the same event read twice is refused by the database rather than filed twice,
// exactly as provider_event_id already does for mail. A pull that runs out of
// pages is a pause and not a hole: the delta link is only advanced when Graph
// says there is nothing further.

import { randomBytes } from "crypto";
import {
  RENEW_WHEN_UNDER_MINUTES,
  calendarStatus,
  createEvent,
  createSubscription,
  deleteEvent,
  deleteSubscription,
  fetchCalendarChanges,
  renewSubscription,
  rowFromEvent,
  updateEvent,
} from "./pcd-graph-calendar";

const STATE_ID = "sales-calendar";
const EVENTS = "pcd_calendar_events";
const STATE = "pcd_calendar_sync_state";

// How many bookings one push pass will carry. A backlog only builds when
// Microsoft has been unreachable, and a pass that clears twenty of them and
// comes straight back is friendlier to a serverless timeout than one that tries
// to clear four hundred and gets killed halfway.
const PUSH_BATCH = 25;

// ── The one state row ───────────────────────────────────────────────────────

export async function readSyncState(supabase) {
  const { data, error } = await supabase.from(STATE).select("*").eq("id", STATE_ID).maybeSingle();
  if (error) throw new Error(error.message);
  // The migration inserts this row, but a database restored from before it, or
  // a row deleted by hand, should not take the calendar down.
  if (!data) {
    const { data: created, error: createError } = await supabase
      .from(STATE)
      .insert({ id: STATE_ID })
      .select("*")
      .single();
    if (createError) throw new Error(createError.message);
    return created;
  }
  return data;
}

export async function writeSyncState(supabase, patch) {
  const { error } = await supabase.from(STATE).update(patch).eq("id", STATE_ID);
  if (error) throw new Error(error.message);
}

// ── Out: our bookings into Outlook ──────────────────────────────────────────

/**
 * Put one booking in the mailbox calendar, or bring the existing event into
 * line with it.
 *
 * Never throws. A booking that could not reach Microsoft is still a booking:
 * the row is already saved, the failure is written onto it, and the calendar
 * says so plainly rather than pretending the visit is in Outlook when it is not.
 */
export async function pushBooking(supabase, row) {
  if (!row?.id) return { ok: false, error: "No booking to push." };

  // A decision, not a failure. Somebody chose to keep this one off the mailbox
  // calendar, so it is left exactly where it is.
  if (row.sync_state === "skipped") return { ok: true, skipped: true };

  // An event that came FROM Outlook is never pushed back to Outlook. This is
  // the other half of what stops a change bouncing between the two sides.
  if (row.source === "outlook" && !row.graph_event_id) return { ok: true, skipped: true };

  try {
    const cancelled = row.status === "cancelled";

    if (cancelled && row.graph_event_id) {
      await deleteEvent(row.graph_event_id);
      await supabase
        .from(EVENTS)
        .update({ graph_event_id: null, graph_change_key: null, sync_state: "synced", sync_error: null, synced_at: nowStamp() })
        .eq("id", row.id);
      return { ok: true, removed: true };
    }
    if (cancelled) {
      await supabase.from(EVENTS).update({ sync_state: "synced", sync_error: null, synced_at: nowStamp() }).eq("id", row.id);
      return { ok: true, removed: true };
    }

    const result = row.graph_event_id
      ? await updateEvent(row.graph_event_id, row)
      : await createEvent(row);

    await supabase
      .from(EVENTS)
      .update({
        graph_event_id: result.id || row.graph_event_id || null,
        graph_change_key: result.changeKey || null,
        sync_state: "synced",
        sync_error: null,
        synced_at: nowStamp(),
      })
      .eq("id", row.id);

    return { ok: true, graphEventId: result.id };
  } catch (error) {
    const message = error?.message || "Could not reach the mailbox calendar.";
    await supabase.from(EVENTS).update({ sync_state: "failed", sync_error: message }).eq("id", row.id);
    return { ok: false, error: message };
  }
}

/**
 * Take another run at everything still owed to Microsoft.
 *
 * Oldest first, so a booking that has been waiting since the secret expired
 * goes before one made a minute ago.
 */
export async function pushPending(supabase, { limit = PUSH_BATCH } = {}) {
  // NOT filtered by source. It used to skip everything that came from Outlook,
  // which was right while those rows were read only and became wrong the moment
  // they could be claimed: an edit to one that failed on the first attempt would
  // never have been tried again. What must not be pushed is decided by
  // pushBooking, in one place, and it is narrower than "came from Outlook": a
  // row whose Outlook event has been deleted, so we do not recreate it.
  const { data, error } = await supabase
    .from(EVENTS)
    .select("*")
    .in("sync_state", ["pending", "failed"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = data || [];
  let pushed = 0;
  const problems = [];

  for (const row of rows) {
    const result = await pushBooking(supabase, row);
    if (result.ok && !result.skipped) pushed += 1;
    if (!result.ok) problems.push(`${row.title}: ${result.error}`);
  }

  return { attempted: rows.length, pushed, problems, capped: rows.length === limit };
}

// ── In: Outlook changes into the calendar ───────────────────────────────────

/**
 * Read what changed in the mailbox calendar and bring our rows into line.
 *
 * The delta link is only replaced when Graph says a read finished. Advancing it
 * on a capped read would skip everything between where the read stopped and
 * where the link points, permanently and silently, which is exactly the bug
 * that cost the mail sync 359 messages. See fetchMailboxMessages.
 */
export async function pullCalendar(supabase, { reset = false } = {}) {
  const state = await readSyncState(supabase);

  let changes;
  try {
    changes = await fetchCalendarChanges({ deltaLink: reset ? "" : state.delta_link || "" });
  } catch (error) {
    // A delta link goes stale if it is left unused for long enough, and Graph
    // says so with a 410. Starting the window again is the documented recovery
    // and costs one wider read.
    if (/resync|410|expired/i.test(error?.message || "") && !reset) {
      return pullCalendar(supabase, { reset: true });
    }
    const message = error?.message || "Could not read the mailbox calendar.";
    await writeSyncState(supabase, { last_error: message });
    return { ok: false, error: message };
  }

  const seen = { updated: 0, created: 0, cancelled: 0, echoes: 0 };

  for (const event of changes.events) {
    const incoming = rowFromEvent(event);
    if (!incoming?.graph_event_id || !incoming.starts_at || !incoming.ends_at) continue;

    const { data: existing } = await supabase
      .from(EVENTS)
      .select("id, graph_change_key, source, status, kind, title, customer_id")
      .eq("graph_event_id", incoming.graph_event_id)
      .maybeSingle();

    // Our own write coming back. Nothing to do, and saying so is worth more
    // than counting it as a change.
    if (existing && existing.graph_change_key && existing.graph_change_key === incoming.graph_change_key) {
      seen.echoes += 1;
      continue;
    }

    if (incoming.cancelled) {
      if (existing) {
        await supabase.from(EVENTS).update({ status: "cancelled", sync_state: "synced", synced_at: nowStamp() }).eq("id", existing.id);
        seen.cancelled += 1;
      }
      continue;
    }

    if (existing) {
      // Times, title, place and notes come from Outlook. What the booking is
      // FOR does not: the customer, the order it belongs to and the kind of
      // visit were decided here and are not in an Outlook event to be read back.
      await supabase
        .from(EVENTS)
        .update({
          title: incoming.title,
          starts_at: incoming.starts_at,
          ends_at: incoming.ends_at,
          all_day: incoming.all_day,
          site_address: incoming.site_address,
          graph_change_key: incoming.graph_change_key,
          status: "booked",
          sync_state: "synced",
          sync_error: null,
          synced_at: nowStamp(),
        })
        .eq("id", existing.id);
      seen.updated += 1;
      continue;
    }

    // Nothing here matches it, so somebody made this in Outlook. It comes in as
    // its own row with no customer and no job attached, because guessing which
    // customer an appointment called "site visit 3pm" is about would be worse
    // than leaving it plainly unattached for a person to link.
    const { error: insertError } = await supabase.from(EVENTS).insert({
      kind: "other",
      title: incoming.title,
      starts_at: incoming.starts_at,
      ends_at: incoming.ends_at,
      all_day: incoming.all_day,
      site_address: incoming.site_address,
      notes: incoming.notes,
      source: "outlook",
      graph_event_id: incoming.graph_event_id,
      graph_change_key: incoming.graph_change_key,
      sync_state: "synced",
      synced_at: nowStamp(),
    });
    // A duplicate here is the unique index doing its job on two notifications
    // that arrived at once, and is not a problem worth reporting.
    if (!insertError) seen.created += 1;
  }

  for (const removedId of changes.removed) {
    const { data: existing } = await supabase
      .from(EVENTS)
      .select("id")
      .eq("graph_event_id", removedId)
      .maybeSingle();
    if (!existing) continue;
    // Kept rather than deleted. A site measure that was cancelled is a thing
    // that happened, and a row that vanishes takes the reason with it.
    await supabase
      .from(EVENTS)
      .update({ status: "cancelled", graph_event_id: null, sync_state: "synced", synced_at: nowStamp() })
      .eq("id", existing.id);
    seen.cancelled += 1;
  }

  await writeSyncState(supabase, {
    // Only when the read actually finished. See the note above.
    ...(changes.deltaLink ? { delta_link: changes.deltaLink } : {}),
    last_pull_at: nowStamp(),
    last_error: null,
  });

  return { ok: true, ...seen, capped: changes.capped };
}

// ── The subscription ────────────────────────────────────────────────────────

/**
 * Make sure Microsoft is still going to tell us about changes.
 *
 * Called by the cron and by the manual sync. Renewing early rather than at the
 * last moment means a cron that misses a run does not cost us the subscription,
 * and a lapsed one is simply replaced.
 */
export async function ensureSubscription(supabase, { force = false } = {}) {
  const state = await readSyncState(supabase);

  const expiresAt = state.subscription_expires_at ? new Date(state.subscription_expires_at).getTime() : 0;
  const minutesLeft = expiresAt ? (expiresAt - Date.now()) / 60000 : 0;

  if (!force && state.subscription_id && minutesLeft > RENEW_WHEN_UNDER_MINUTES) {
    return { ok: true, action: "none", expiresAt: state.subscription_expires_at };
  }

  // Still alive but running down. A renewal is one call and keeps the delta
  // link, where a replacement would mean a fresh subscription id for no gain.
  if (!force && state.subscription_id && minutesLeft > 0) {
    try {
      const renewed = await renewSubscription(state.subscription_id);
      await writeSyncState(supabase, { subscription_expires_at: renewed.expiresAt, last_error: null });
      return { ok: true, action: "renewed", expiresAt: renewed.expiresAt };
    } catch {
      // Fall through and make a new one. A renewal that fails usually means
      // Microsoft has already dropped it.
    }
  }

  if (state.subscription_id) await deleteSubscription(state.subscription_id);

  try {
    const clientState = randomBytes(24).toString("hex");
    const created = await createSubscription(clientState);
    await writeSyncState(supabase, {
      subscription_id: created.id,
      subscription_expires_at: created.expiresAt,
      client_state: clientState,
      last_error: null,
    });
    return { ok: true, action: "created", expiresAt: created.expiresAt };
  } catch (error) {
    const message = error?.message || "Could not subscribe to calendar changes.";
    await writeSyncState(supabase, { subscription_id: null, subscription_expires_at: null, last_error: message });
    return { ok: false, action: "failed", error: message };
  }
}

/** Is a notification really from our subscription. */
export async function notificationIsOurs(supabase, notification) {
  const state = await readSyncState(supabase);
  if (!state.client_state) return false;
  return String(notification?.clientState || "") === state.client_state;
}

// ── The whole pass ──────────────────────────────────────────────────────────

/**
 * One full sync: make sure we are subscribed, take back what changed in
 * Outlook, then push anything still owed.
 *
 * The order matters. Pulling first means a booking edited in Outlook while the
 * site was offline is taken in before we push our version of it over the top.
 *
 * Used by the cron, by the manual button on the calendar and by the webhook, so
 * there is one definition of what a sync is rather than three that drift.
 */
export async function runCalendarSync(supabase, { subscribe = true } = {}) {
  const status = await calendarStatus();
  if (!status.ok) {
    await writeSyncState(supabase, { last_error: status.error });
    return { ok: false, error: status.error, configured: status.configured };
  }

  const subscription = subscribe ? await ensureSubscription(supabase) : { ok: true, action: "none" };
  const pulled = await pullCalendar(supabase);
  const pushed = await pushPending(supabase);

  await writeSyncState(supabase, { last_push_at: nowStamp() });

  return {
    ok: true,
    subscription,
    pulled,
    pushed,
    // Said out loud so a caller knows to come straight back rather than assume
    // everything is in step.
    capped: Boolean(pulled.capped || pushed.capped),
  };
}

function nowStamp() {
  return new Date().toISOString();
}
