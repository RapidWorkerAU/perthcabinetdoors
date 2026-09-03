// The sales mailbox calendar, through Microsoft Graph.
//
// WHY THIS IS SHORT. The hard part was done for mail: pcd-graph-mail.js already
// holds the app registration, the token and the mailbox address, and this uses
// all three. The only thing Microsoft needs beyond what it has already been
// granted is the Calendars.ReadWrite application permission, on the same API
// permissions page as Mail.Read, with the same admin consent.
//
// WHAT MAKES IT TWO WAY.
//
//   OUT is a plain write. A booking saved on the site is created in the mailbox
//   calendar and its Outlook id is stored on our row. That id is what makes
//   every later change an update rather than a second copy of the same visit.
//
//   IN is a subscription. Microsoft is asked once to tell us when anything in
//   that calendar changes, and posts to our webhook within seconds. A poll
//   would have to be either slow enough to be useless or frequent enough to be
//   rude, and the nightly mail cron is far too slow for a calendar somebody is
//   moving on their phone.
//
// THE ECHO IS THE THING TO GET RIGHT. Our own write comes straight back as a
// notification. Every event carries a changeKey that Microsoft changes on every
// edit, so the change key we stored on the way out is compared with the one
// that comes back: same key, nothing happened that we did not do ourselves.
//
// Nothing here runs at import time. A missing secret must never break a build
// or take down a page; it only means the calendar does not sync, and
// calendarStatus() is what the page uses to say so plainly.

import { getGraphToken, graphConfig, isGraphConfigured } from "./pcd-graph-mail";
import { PERTH_TZ, perthDayOf, perthMinutesOf } from "./pcd-calendar";

const GRAPH = "https://graph.microsoft.com/v1.0";

// Microsoft caps an event subscription at 4230 minutes, just under three days.
// Renewing at two thirds of that leaves a full day of slack for a cron that
// misses a run.
export const SUBSCRIPTION_MINUTES = 4230;
export const RENEW_WHEN_UNDER_MINUTES = 1440;

// How wide a window the calendar reads and keeps in step. Reaching further back
// than this is possible but pointless: a measure from last winter is history,
// not schedule.
export const SYNC_WINDOW_BACK_DAYS = 30;
export const SYNC_WINDOW_FORWARD_DAYS = 180;

// What we put on every event we create, so an event of ours is recognisable in
// Outlook at a glance and, more importantly, so a pull can tell the difference
// between an appointment somebody typed into Outlook and one of our own.
export const PCD_CATEGORY = "PCD job calendar";

// The customer's answer, shown on the event as a category so it colours the
// block in the calendar grid. See categoriesFor for why this is not a prefix on
// the subject, which is the obvious idea and the broken one.
export const CONFIRMED_CATEGORY = "Confirmed";
export const DECLINED_CATEGORY = "Declined";

function mailbox() {
  const address = graphConfig().mailbox;
  if (!address) throw new Error("MS_MAILBOX is not set, so there is no calendar to sync with.");
  return address;
}

function userPath(suffix = "") {
  return `/users/${encodeURIComponent(mailbox())}${suffix}`;
}

// ── Talking to Graph ────────────────────────────────────────────────────────

async function graphFetch(path, { method = "GET", body, headers = {}, retried = false } = {}) {
  const token = await getGraphToken({ force: retried });
  const url = path.startsWith("http") ? path : `${GRAPH}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // The cached token went stale mid-run. One retry with a fresh one, exactly as
  // the mail side does.
  if (response.status === 401 && !retried) {
    return graphFetch(path, { method, body, headers, retried: true });
  }

  if (response.status === 204) return null;
  if (!response.ok) throw new Error(await describeCalendarError(response));
  return response.json().catch(() => null);
}

async function describeCalendarError(response) {
  const payload = await response.json().catch(() => ({}));
  const code = payload?.error?.code || "";
  const message = payload?.error?.message || response.statusText;

  if (response.status === 403 || /Access(Denied|IsDenied)|ErrorAccessDenied/i.test(code)) {
    return (
      "Microsoft refused the calendar. The usual cause is that Calendars.ReadWrite was added under " +
      "Delegated instead of Application permissions, or admin consent has not been granted for it. " +
      "Both are on the same API permissions page as the mail permission."
    );
  }
  if (response.status === 404 || /ResourceNotFound|ErrorItemNotFound/i.test(code)) {
    return `Microsoft has no calendar item there. It may have been deleted in Outlook. (${message})`;
  }
  if (/ErrorInvalidIdMalformed/i.test(code)) {
    return "That Outlook event id is not one Microsoft recognises. The event was probably deleted and recreated.";
  }
  return `Microsoft Graph said: ${message}`;
}

/**
 * Is the calendar reachable right now, and if not, what would fix it.
 *
 * Kept separate from graphStatus() in pcd-graph-mail.js on purpose: mail can be
 * working perfectly while the calendar permission is still missing, and a page
 * that reports one as the other sends somebody looking in the wrong place.
 */
export async function calendarStatus() {
  if (!isGraphConfigured()) {
    return {
      configured: false,
      ok: false,
      error: "Microsoft is not connected yet. MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MS_MAILBOX are all needed.",
    };
  }
  try {
    const calendar = await graphFetch(userPath("/calendar?$select=id,name,owner"));
    return {
      configured: true,
      ok: true,
      error: "",
      calendarId: calendar?.id || "",
      calendarName: calendar?.name || "Calendar",
      mailbox: graphConfig().mailbox,
    };
  } catch (error) {
    return { configured: true, ok: false, error: error?.message || "Could not reach the calendar.", mailbox: graphConfig().mailbox };
  }
}

// ── Our booking as an Outlook event ─────────────────────────────────────────

/**
 * The wall clock time in Perth, in the shape Graph wants it.
 *
 * Sent as a local time with the zone named rather than as UTC, because Outlook
 * shows an event in the zone it was created in, and a measure at half past nine
 * has to read as half past nine on the phone standing in the customer's kitchen.
 */
function perthDateTime(instant) {
  const day = perthDayOf(instant);
  const minutes = perthMinutesOf(instant);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return { dateTime: `${day}T${hh}:${mm}:00`, timeZone: PERTH_TZ };
}

/** Everything worth knowing about a booking, written for a phone screen. */
function eventBodyText(row) {
  return [
    row.customer_name ? `Customer: ${row.customer_name}` : "",
    row.site_address ? `Address: ${row.site_address}` : "",
    contactLine(row),
    row.notes ? `\n${row.notes}` : "",
    confirmationBlock(row),
    "\nBooked on the PCD job calendar.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Who to ask for on the day, and on what number. */
function contactLine(row) {
  const parts = [row.contact_name || "", row.contact_mobile || ""].filter(Boolean);
  return parts.length ? `Contact: ${parts.join(", ")}` : "";
}

/**
 * What the customer said, written onto the event.
 *
 * SAFE TO PUT IN THE BODY, unlike the subject. An edit made in Outlook is read
 * back by rowFromEvent, which takes bodyPreview into notes only when a row is
 * being CREATED from an event we have never seen. An event of ours already has
 * a row, and the inbound update in pcd-calendar-sync.js does not touch notes,
 * so this cannot loop back into the booking and be re-appended next push.
 */
function confirmationBlock(row) {
  if (row.confirm_state !== "confirmed" && row.confirm_state !== "declined") return "";
  const who = row.confirm_answered_by ? `${row.confirm_answered_by}, ` : "";
  const when = row.confirm_answered_at
    ? new Date(row.confirm_answered_at).toLocaleString("en-AU", { timeZone: PERTH_TZ })
    : "";
  return [
    "",
    row.confirm_state === "confirmed" ? "CONFIRMED BY THE CUSTOMER" : "DECLINED BY THE CUSTOMER",
    `${who}${when}`.trim(),
    row.confirm_notes ? `They said: ${row.confirm_notes}` : "No note left.",
  ].join("\n");
}

/**
 * The categories this event carries.
 *
 * THE ANSWER IS A CATEGORY AND NEVER A SUBJECT PREFIX. An edit made in Outlook
 * writes the subject straight back onto our row, see rowFromEvent and the
 * inbound branch of pullCalendar. A "Confirmed: " prefix would therefore be
 * baked into the stored title the first time somebody nudged the event, and
 * prefixed AGAIN on the next push, growing every time. Categories are read back
 * only to decide whether an event is ours, never into a stored field, so they
 * cannot compound. They also colour the block in the calendar grid, which is
 * what makes a week answerable at a glance on a phone.
 */
function categoriesFor(row) {
  if (row.confirm_state === "confirmed") return [PCD_CATEGORY, CONFIRMED_CATEGORY];
  if (row.confirm_state === "declined") return [PCD_CATEGORY, DECLINED_CATEGORY];
  return [PCD_CATEGORY];
}

export function eventFromRow(row) {
  const event = {
    subject: row.title,
    body: { contentType: "text", content: eventBodyText(row) },
    start: perthDateTime(row.starts_at),
    end: perthDateTime(row.ends_at),
    isAllDay: Boolean(row.all_day),
    categories: categoriesFor(row),
    // Nobody is invited by default. A customer gets an invitation only when
    // somebody asks for one, because an accidental invitation to a job that
    // then moves is worse than no invitation at all.
    isReminderOn: true,
    reminderMinutesBeforeStart: row.kind === "measure" ? 60 : 30,
  };

  if (row.site_address) event.location = { displayName: row.site_address };

  // An all day event in Graph runs midnight to midnight and its end is
  // exclusive, so a one day booking ends on the following day.
  if (row.all_day) {
    const startDay = perthDayOf(row.starts_at);
    const endDay = perthDayOf(row.ends_at);
    event.start = { dateTime: `${startDay}T00:00:00`, timeZone: PERTH_TZ };
    event.end = { dateTime: `${endDay > startDay ? endDay : nextDay(startDay)}T00:00:00`, timeZone: PERTH_TZ };
  }

  return event;
}

function nextDay(day) {
  const date = new Date(`${day}T00:00:00Z`);
  return new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
}

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Create the event for a booking.
 *
 * transactionId is our own row id. Microsoft treats a repeat of the same
 * transaction id within a few days as the same request, so a retry after a
 * timeout that actually succeeded does not leave two identical measures in the
 * calendar. It is the one duplicate this design cannot otherwise rule out.
 */
export async function createEvent(row) {
  const created = await graphFetch(userPath("/calendar/events"), {
    method: "POST",
    body: { ...eventFromRow(row), transactionId: String(row.id).slice(0, 256) },
  });
  return { id: created?.id || "", changeKey: created?.changeKey || "" };
}

export async function updateEvent(graphEventId, row) {
  const updated = await graphFetch(userPath(`/events/${encodeURIComponent(graphEventId)}`), {
    method: "PATCH",
    body: eventFromRow(row),
  });
  return { id: updated?.id || graphEventId, changeKey: updated?.changeKey || "" };
}

/**
 * Remove the event.
 *
 * An event already gone is a success, not a failure: cancelling a booking twice,
 * or cancelling one somebody already deleted in Outlook, should leave the same
 * end state and say nothing alarming about it.
 */
export async function deleteEvent(graphEventId) {
  try {
    await graphFetch(userPath(`/events/${encodeURIComponent(graphEventId)}`), { method: "DELETE" });
    return { ok: true, alreadyGone: false };
  } catch (error) {
    if (/no calendar item there|not one Microsoft recognises/i.test(error?.message || "")) {
      return { ok: true, alreadyGone: true };
    }
    throw error;
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

// NO $select ON THE DELTA QUERY, deliberately. A delta link carries the shape
// of the request that made it, so narrowing the fields here would have to be
// right first time and forever: a field added later would come back empty on
// every existing link until somebody worked out why. This calendar holds tens
// of events, not thousands, and the whole event is a few hundred bytes.

/**
 * What changed in the calendar since last time.
 *
 * calendarView rather than events, because calendarView expands a recurring
 * series into the occurrences that actually sit on days, and an Outlook user
 * who sets up a weekly supplier run expects to see it every week rather than
 * once. The delta link Graph hands back is stored and used as the whole request
 * next time, which is why the window is only named on a first read.
 */
export async function fetchCalendarChanges({ deltaLink = "", from = null, to = null, maxPages = 20 } = {}) {
  let next = deltaLink;

  if (!next) {
    const params = new URLSearchParams();
    params.set("startDateTime", (from ? new Date(from) : daysFromNow(-SYNC_WINDOW_BACK_DAYS)).toISOString());
    params.set("endDateTime", (to ? new Date(to) : daysFromNow(SYNC_WINDOW_FORWARD_DAYS)).toISOString());
    next = userPath(`/calendarView/delta?${params.toString()}`);
  }

  const events = [];
  const removed = [];
  let newDeltaLink = "";
  let pages = 0;

  while (next && pages < maxPages) {
    // A delta page is capped by Graph at 50 or so whatever we ask for; the
    // header is a request, not a promise, and the loop below is what actually
    // gets everything.
    const payload = await graphFetch(next, {
      headers: { Prefer: 'odata.maxpagesize=50, outlook.timezone="Australia/Perth"' },
    });
    pages += 1;

    for (const item of payload?.value || []) {
      if (item["@removed"]) removed.push(item.id);
      else events.push(item);
    }

    if (payload?.["@odata.deltaLink"]) {
      newDeltaLink = payload["@odata.deltaLink"];
      break;
    }
    next = payload?.["@odata.nextLink"] || "";
  }

  return {
    events,
    removed,
    deltaLink: newDeltaLink,
    // A read that ran out of pages is a pause, not a hole: the next one carries
    // on from the nextLink window. Said out loud so a caller can come back
    // rather than assume it is up to date.
    capped: Boolean(next) && !newDeltaLink,
  };
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 86400000);
}

/** A Graph event in the shape pcd_calendar_events stores. */
export function rowFromEvent(event) {
  if (!event?.id) return null;
  return {
    graph_event_id: event.id,
    graph_change_key: event.changeKey || null,
    title: String(event.subject || "").trim() || "Appointment",
    starts_at: graphInstant(event.start),
    ends_at: graphInstant(event.end),
    all_day: Boolean(event.isAllDay),
    site_address: event.location?.displayName || null,
    notes: String(event.bodyPreview || "").trim() || null,
    cancelled: Boolean(event.isCancelled),
    // Ours or theirs. An event we created carries our category, and that is
    // what stops a pull from turning our own bookings into second copies with
    // the customer link stripped off.
    isOurs: (event.categories || []).includes(PCD_CATEGORY),
  };
}

/**
 * Graph hands back a local time and the zone it is in, with no offset on the
 * string itself. Reading it as UTC would put every Perth booking eight hours
 * out, which is the sort of bug that looks like it works until somebody books
 * something before eight in the morning.
 */
function graphInstant(slot) {
  if (!slot?.dateTime) return null;
  const zone = slot.timeZone || "UTC";
  const raw = String(slot.dateTime).replace(/Z$/, "").slice(0, 19);

  if (/^utc$/i.test(zone)) return new Date(`${raw}Z`).toISOString();
  // Perth is UTC+8 with no daylight saving, so the offset is a constant.
  if (zone === PERTH_TZ || /W\. Australia/i.test(zone)) {
    return new Date(`${raw}+08:00`).toISOString();
  }
  // Any other zone is one Outlook chose for an event somebody made elsewhere.
  // Reading it as UTC is the honest fallback and the error is bounded, where a
  // guess at the offset would not be.
  return new Date(`${raw}Z`).toISOString();
}

// ── The subscription ────────────────────────────────────────────────────────

function notificationUrl() {
  // The same setting Stripe already uses for its return URLs, see
  // lib/pcd-stripe.js. Adding a second one for the same fact is how the two
  // end up disagreeing after a domain change.
  const base = String(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. Microsoft needs a public https address to send calendar changes to, " +
        "so the two way sync cannot be switched on without it."
    );
  }
  if (base.startsWith("http://")) {
    throw new Error(
      `Microsoft will only send calendar changes to an https address, and NEXT_PUBLIC_SITE_URL is ${base}. ` +
        "Bookings made here still reach Outlook; changes made in Outlook will not come back until this is a public https address."
    );
  }
  return `${base}/api/graph/calendar-webhook`;
}

function expiryStamp(minutes = SUBSCRIPTION_MINUTES) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

/**
 * Ask Microsoft to tell us when the calendar changes.
 *
 * clientState is a secret we choose and Microsoft repeats back on every
 * notification. The webhook is a public URL by necessity, and this is what
 * makes a notification that did not come from our subscription ignorable.
 */
export async function createSubscription(clientState) {
  const created = await graphFetch("/subscriptions", {
    method: "POST",
    body: {
      changeType: "created,updated,deleted",
      notificationUrl: notificationUrl(),
      // The address is NOT url encoded here. This is a resource path Microsoft
      // parses, not a URL it fetches, and an encoded @ is rejected.
      resource: `users/${mailbox()}/calendar/events`,
      expirationDateTime: expiryStamp(),
      clientState,
    },
  });
  return {
    id: created?.id || "",
    expiresAt: created?.expirationDateTime || expiryStamp(),
  };
}

export async function renewSubscription(subscriptionId) {
  const renewed = await graphFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: { expirationDateTime: expiryStamp() },
  });
  return { id: renewed?.id || subscriptionId, expiresAt: renewed?.expirationDateTime || expiryStamp() };
}

export async function deleteSubscription(subscriptionId) {
  try {
    await graphFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
  } catch {
    // A subscription that has already lapsed cannot be deleted and does not
    // need to be. Nothing here is worth failing a request over.
  }
}

