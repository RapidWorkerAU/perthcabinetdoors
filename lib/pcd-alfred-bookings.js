// CALENDAR BOOKINGS THROUGH ALFRED: ADDING AND CHANGING, APPROVED BY NAME.
//
// ── THE RULE (Ashleigh, 2026-10-06) ──────────────────────────────────────────
//
// Alfred confirms until it is crystal clear what is wanted, and the booking is
// then exactly the one a person would have made on the calendar: the customer
// linked, the job linked, the address from the customer or the job, the title
// the calendar would give it, pushed to the sales mailbox calendar, written
// into the order's history, and the customer asked to confirm it the same way.
//
// So the card is the calendar's own booking form, built here from real records
// (the customer's actual jobs, the calendar's own kinds and durations), with
// Alfred's reading only pre-filling it. Nothing is guessed silently: a time is
// never assumed, and a measure, delivery or install needs a customer. Saving
// goes through lib/pcd-calendar-save.js, the same code the calendar page uses.
//
// Alfred may add a booking, or change one: move it, change its details, or
// mark it done. Cancelling stays on the calendar page.

import {
  ASKABLE_KINDS,
  BOOKING_KINDS,
  bookingFromRow,
  bookingKindLabel,
  bookingRowFromInput,
  DURATIONS,
  defaultMinutesFor,
  defaultTitle,
  formatMinutes,
  isDay,
} from "./pcd-calendar";
import { customerJobs } from "./pcd-calendar-jobs";
import { createBooking, updateBooking } from "./pcd-calendar-save";
import { logOrderActivity } from "./pcd-activity-log";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** The address a booking for this customer starts with, the way the booking form fills it. */
export function addressOfCustomer(customer) {
  if (!customer) return "";
  if (customer.site_address) return customer.site_address;
  return [customer.site_street, customer.site_suburb].filter(Boolean).join(", ");
}

/** "14:30" or "2:30pm" as minutes after midnight, or null. Pure. */
export function minutesFromTime(value) {
  const text = String(value || "").trim().toLowerCase();
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2] || 0);
  if (m[3] === "pm" && hours < 12) hours += 12;
  if (m[3] === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const jobLabel = (job) => `${job.kind === "order" ? "Order" : "Quote"} ${job.reference}${job.name ? `, ${job.name}` : ""} (${String(job.status).replace(/_/g, " ")})${job.becameOrder ? ", now an order" : ""}`;

const VERSION_FIELDS = ["kind", "title", "starts_at", "ends_at", "all_day", "customer_id", "order_id", "quote_id", "site_address", "notes", "status"];
/** What the booking held when it was reviewed, so a change made since is caught. */
export const bookingVersion = (row) => JSON.stringify(VERSION_FIELDS.map((k) => row?.[k] ?? null));

/**
 * The booking form, built from the database. The model's reading only
 * pre-fills it.
 *
 * @param proposal { action, bookingId, kind, customerId, jobKind, jobId, day, startTime, allDay, minutes, title, siteAddress, notes }
 */
export async function bookingCard(supabase, proposal = {}) {
  const action = proposal.action === "edit" ? "edit" : "add";
  let existing = null;
  if (action === "edit") {
    const { data } = await supabase.from("pcd_calendar_events").select("*").eq("id", proposal.bookingId).maybeSingle();
    if (!data) throw fail("That booking no longer exists.", 404);
    if (data.status === "cancelled") throw fail("That booking was cancelled. Book it again rather than changing it.");
    existing = data;
  }
  const was = existing ? bookingFromRow(existing) : null;

  const kind = BOOKING_KINDS.some((k) => k.value === proposal.kind) ? proposal.kind : was?.kind || "";
  const customerId = proposal.customerId || was?.customerId || null;
  const { data: customer } = customerId
    ? await supabase.from("pcd_customers").select("id, name, email, site_address, site_street, site_suburb").eq("id", customerId).maybeSingle()
    : { data: null };
  if (customerId && !customer) throw fail("That customer is no longer there.");
  const jobs = customer ? await customerJobs(supabase, customer.id) : [];

  // The job: Alfred's pick if it is one of this customer's, otherwise what the
  // booking already had.
  const picked = jobs.find((j) => j.id === proposal.jobId && (!proposal.jobKind || j.kind === proposal.jobKind));
  const orderId = picked ? (picked.kind === "order" ? picked.id : null) : was?.orderId || null;
  const quoteId = picked ? (picked.kind === "quote" ? picked.id : null) : was?.quoteId || null;
  const job = jobs.find((j) => j.id === (orderId || quoteId));

  const allDay = typeof proposal.allDay === "boolean" && proposal.allDay ? true : was ? was.allDay : false;
  const startMinutes = allDay ? 0 : minutesFromTime(proposal.startTime) ?? (was && !was.allDay ? was.startMinutes : null);
  const minutes = DURATIONS.some((d) => d.minutes === Number(proposal.minutes)) ? Number(proposal.minutes) : was?.minutes || (kind ? defaultMinutesFor(kind) : 60);
  const customerName = customer?.name || was?.customerName || "";

  return {
    action,
    bookingId: existing?.id || null,
    kinds: BOOKING_KINDS.map(({ value, label }) => ({ value, label })),
    durations: DURATIONS,
    customer: customer ? { id: customer.id, name: customer.name || "", email: customer.email || "" } : null,
    jobs: jobs.map((j) => ({ kind: j.kind, id: j.id, label: jobLabel(j), siteAddress: j.siteAddress || "" })),
    version: existing ? bookingVersion(existing) : null,
    draft: {
      kind,
      customerId: customer?.id || null,
      customerName,
      orderId,
      quoteId,
      day: isDay(proposal.day) ? String(proposal.day).slice(0, 10) : was?.day || "",
      startMinutes,
      allDay,
      minutes,
      title: String(proposal.title || "").trim() || (was ? was.title : kind ? defaultTitle(kind, customerName) : ""),
      siteAddress: String(proposal.siteAddress || "").trim() || was?.siteAddress || addressOfCustomer(customer) || job?.siteAddress || "",
      notes: String(proposal.notes || "").trim() || was?.notes || "",
      status: was?.status === "done" || proposal.status === "done" ? "done" : "booked",
      addToOutlook: existing ? existing.sync_state !== "skipped" : true,
    },
  };
}

/** What is still not clear enough to book. Pure. */
export function bookingGaps(draft = {}) {
  const gaps = [];
  if (!BOOKING_KINDS.some((k) => k.value === draft.kind)) gaps.push("Pick what kind of booking it is.");
  if (ASKABLE_KINDS.has(draft.kind) && !draft.customerId) {
    const what = bookingKindLabel(draft.kind).toLowerCase();
    gaps.push(`${/^[aeiou]/.test(what) ? "An" : "A"} ${what} needs a customer.`);
  }
  if (!isDay(draft.day)) gaps.push("Pick the day.");
  if (!draft.allDay && (draft.startMinutes === null || draft.startMinutes === undefined || draft.startMinutes === "")) gaps.push("Pick the time, or make it all day.");
  return gaps;
}

const shownDay = (day) => (isDay(day) ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "");
const shownWhen = (d) => (d.allDay ? `${shownDay(d.day)}, all day` : `${shownDay(d.day)}, ${formatMinutes(d.startMinutes)} to ${formatMinutes(Number(d.startMinutes) + Number(d.minutes))}`);

/** The form's answers as the calendar's own booking input. */
function asInput(draft) {
  return {
    kind: draft.kind,
    title: draft.title,
    day: draft.day,
    startMinutes: Number(draft.startMinutes) || 0,
    minutes: Number(draft.minutes) || defaultMinutesFor(draft.kind),
    allDay: Boolean(draft.allDay),
    customerId: draft.customerId || null,
    customerName: draft.customerName || "",
    orderId: draft.orderId || null,
    quoteId: draft.quoteId || null,
    siteAddress: draft.siteAddress || "",
    notes: draft.notes || "",
    status: draft.status === "done" ? "done" : "booked",
    addToOutlook: draft.addToOutlook !== false,
  };
}

/**
 * Exactly what will be booked or changed, in words, with what else is on that
 * day. Nothing is saved.
 */
export async function previewBooking(supabase, card, draft) {
  const gaps = bookingGaps(draft);
  if (gaps.length) throw fail(gaps[0]);
  const { row, error } = bookingRowFromInput(asInput(draft));
  if (error) throw fail(error);

  // The links must still be this customer's: the job list is read again.
  if (draft.customerId) {
    const { data: customer } = await supabase.from("pcd_customers").select("id, name").eq("id", draft.customerId).maybeSingle();
    if (!customer) throw fail("That customer is no longer there.");
    const jobs = await customerJobs(supabase, draft.customerId);
    const jobId = draft.orderId || draft.quoteId;
    if (jobId && !jobs.some((j) => j.id === jobId)) throw fail("That job is not one of this customer's. Pick the job again.");
  } else if (draft.orderId || draft.quoteId) {
    throw fail("A job can only be linked once the customer is.");
  }

  const jobs = draft.customerId ? await customerJobs(supabase, draft.customerId) : [];
  const job = jobs.find((j) => j.id === (draft.orderId || draft.quoteId));
  const now = {
    Kind: bookingKindLabel(draft.kind),
    When: shownWhen(draft),
    Customer: draft.customerName || "None",
    Job: job ? jobLabel(job) : "None",
    Title: row.title,
    Address: row.site_address || "None",
    Notes: row.notes || "None",
    Status: row.status === "done" ? "Done" : "Booked",
    "Mailbox calendar": row.sync_state === "skipped" ? "Not added" : "Added",
  };

  let rows;
  let existing = null;
  if (card.action === "edit") {
    const { data } = await supabase.from("pcd_calendar_events").select("*").eq("id", card.bookingId).maybeSingle();
    if (!data) throw fail("That booking no longer exists.", 404);
    existing = data;
    const was = bookingFromRow(data);
    const wasJob = jobs.find((j) => j.id === (was.orderId || was.quoteId));
    const before = {
      Kind: bookingKindLabel(was.kind),
      When: shownWhen(was),
      Customer: was.customerName || "None",
      Job: wasJob ? jobLabel(wasJob) : was.orderId || was.quoteId ? "A job" : "None",
      Title: was.title,
      Address: was.siteAddress || "None",
      Notes: was.notes || "None",
      Status: was.status === "done" ? "Done" : "Booked",
      "Mailbox calendar": data.sync_state === "skipped" ? "Not added" : "Added",
    };
    rows = Object.keys(now)
      .filter((k) => before[k] !== now[k])
      .map((k) => ({ label: k, from: before[k], to: now[k] }));
  } else {
    rows = Object.entries(now).map(([label, value]) => ({ label, from: "", to: value }));
  }

  // What else is on that day. Figures, never a verdict about whether it fits.
  const { data: sameDay } = await supabase
    .from("pcd_calendar_events")
    .select("id, kind, title, starts_at, ends_at, all_day")
    .neq("status", "cancelled")
    .gte("starts_at", `${draft.day}T00:00:00+08:00`)
    .lte("starts_at", `${draft.day}T23:59:59+08:00`)
    .order("starts_at", { ascending: true });
  const others = (sameDay || []).filter((b) => b.id !== card.bookingId).map(bookingFromRow);
  const notes = [
    others.length
      ? `Also that day: ${others.map((b) => `${b.title}, ${b.allDay ? "all day" : `${formatMinutes(b.startMinutes)} to ${formatMinutes(b.startMinutes + b.minutes)}`}`).join("; ")}.`
      : "Nothing else is booked that day.",
    row.sync_state === "skipped" ? "It stays off the sales mailbox calendar." : "It goes into the sales mailbox calendar.",
    ...(ASKABLE_KINDS.has(draft.kind) && row.status === "booked" ? ["The customer is asked to confirm it, the same as a booking made on the calendar."] : []),
    ...(row.order_id ? ["It is written into the order's history."] : []),
  ];

  return {
    rows,
    notes,
    nothing: card.action === "edit" && !rows.length,
    summary: card.action === "edit" ? `Change ${existing?.title || "the booking"}.` : `Book ${row.title}, ${shownWhen(draft)}.`,
  };
}

/**
 * Book or change it, as a person approving it by name. Checked again; a
 * booking that changed since it was reviewed is not saved.
 */
export async function applyBooking(supabase, card, draft, { approvedBy, baseUrl = "" } = {}) {
  if (!String(approvedBy || "").trim()) throw fail("Choose who is approving first.");
  const preview = await previewBooking(supabase, card, draft);
  if (preview.nothing) return { ok: true, summary: "Nothing needed changing." };

  let result;
  if (card.action === "edit") {
    const { data: current } = await supabase.from("pcd_calendar_events").select("*").eq("id", card.bookingId).maybeSingle();
    if (!current || bookingVersion(current) !== card.version) {
      throw fail("That booking changed since you reviewed this, so nothing was saved. Review it again.", 409);
    }
    result = await updateBooking(supabase, card.bookingId, asInput(draft), { baseUrl, actorType: "alfred", approvedBy });
  } else {
    result = await createBooking(supabase, asInput(draft), { baseUrl, actorType: "alfred", approvedBy });
  }

  const event = result.event;
  await logOrderActivity(supabase, {
    order_id: event.order_id || null,
    quote_id: event.quote_id || null,
    customer_id: event.customer_id || null,
    actor_type: "alfred",
    action_type: card.action === "edit" ? "alfred_booking_changed" : "alfred_booking_added",
    title: card.action === "edit" ? "Booking changed through Alfred" : "Booking added through Alfred",
    description: `${preview.summary} Approved by ${approvedBy}.`,
    metadata: { booking_id: event.id, approved_by: approvedBy },
  });
  return {
    ok: true,
    bookingId: event.id,
    summary: preview.summary,
    synced: Boolean(result.sync?.ok || result.sync?.skipped),
    asked: Boolean(result.ask?.asked),
  };
}
