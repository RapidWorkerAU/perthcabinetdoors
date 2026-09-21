// A HELD DAY BECOMING A REAL BOOKING, AND A REAL BOOKING BEING CALLED OFF.
//
// ── WHERE THIS RUNS ──────────────────────────────────────────────────────────
//
// completeSiteMeasureBooking is the webhook's work, and it is the moment a
// customer exists, a calendar event exists, and two emails go out. Everything
// before it is a hold nobody has paid for.
//
// It is written to be safe run twice, because Stripe delivers a webhook more
// than once whenever it feels like it. The booking is CLAIMED with a
// conditional update on 'holding', and only the call that wins that update does
// the work. A second delivery finds the row already booked and returns.
//
// ── CANCELLING IS DECIDED BY THE CLOCK ───────────────────────────────────────
//
// Not by whoever answers the phone. Outside the confirmation window the card is
// refunded; inside it the money becomes a customer credit. Both outcomes leave
// the customer holding the value of what they paid, which is what makes the
// rule defensible when somebody argues about it. See lib/pcd-cancellation-policy.js.

import { createRefund } from "./pcd-stripe";
import { upsertCustomerByEmail } from "./pcd-customer-utils";
import { closeCredit, createCredit } from "./pcd-customer-credits";
import { logOrderActivity } from "./pcd-activity-log";
import { cancellationOutcome } from "./pcd-cancellation-policy";
import { bookingInstants, getBookingSettings, usedByDay } from "./pcd-booking-store";
import { placesLeft } from "./pcd-booking-settings";
import {
  sendSiteMeasureBookedToCustomer,
  sendSiteMeasureBookedToSales,
  sendSiteMeasureCancelledToCustomer,
  dayWordsOf,
  windowWordsOf,
} from "./pcd-site-measure-emails";

/** The fee as money, for the one place here that has to say it in words. */
function formatFee(amount) {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/**
 * The fee has cleared. Turn the hold into a booking.
 *
 * Returns { ok, booking, alreadyDone } so the caller can tell a repeat delivery
 * from a first one without guessing.
 */
export async function completeSiteMeasureBooking(supabase, session, { baseUrl = "" } = {}) {
  const bookingId = session?.metadata?.booking_id;
  if (!bookingId) return { ok: false, error: "No booking on that session." };

  const { data: booking, error } = await supabase
    .from("pcd_site_measure_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status === "booked") return { ok: true, booking, alreadyDone: true };
  if (booking.status === "cancelled") return { ok: false, error: "That booking was cancelled." };

  const now = new Date().toISOString();

  // THE CLAIM. A webhook delivered twice cannot create two calendar events and
  // send two confirmations, because only one of these updates writes anything.
  // An expired hold is allowed through on purpose: they paid, so the day is
  // theirs even if the twenty minutes ran out while Stripe was thinking.
  const { data: claimed, error: claimError } = await supabase
    .from("pcd_site_measure_bookings")
    .update({
      status: "booked",
      fee_paid_at: now,
      hold_expires_at: null,
      stripe_payment_intent_id: session?.payment_intent || booking.stripe_payment_intent_id || null,
      updated_at: now,
    })
    .eq("id", bookingId)
    .in("status", ["holding", "expired"])
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    const { data: current } = await supabase
      .from("pcd_site_measure_bookings").select("*").eq("id", bookingId).maybeSingle();
    return { ok: true, booking: current || booking, alreadyDone: true };
  }

  // THE CUSTOMER EXISTS FROM HERE, and not before. A hold nobody paid leaves no
  // record behind, because the customers list is a list of people we have done
  // business with.
  let customer = null;
  try {
    customer = await upsertCustomerByEmail(
      supabase,
      {
        name: claimed.customer_name,
        email: claimed.customer_email,
        phone: claimed.customer_phone,
        site_street: claimed.site_street,
        site_suburb: claimed.site_suburb,
        site_postcode: claimed.site_postcode,
        site_address: claimed.site_address,
      },
      { source: "site_measure_booking", reference: claimed.id }
    );
  } catch (customerError) {
    // Said out loud and carried on. A booking that is paid for must reach the
    // calendar whether or not the customer record could be written, or a van
    // does not go out over a database error nobody saw.
    console.error("[site-measure] could not upsert the customer:", customerError?.message || customerError);
  }

  const { startsAt, endsAt } = bookingInstants(claimed);
  let calendarEventId = claimed.calendar_event_id || null;

  if (!calendarEventId && startsAt && endsAt) {
    const { data: event, error: eventError } = await supabase
      .from("pcd_calendar_events")
      .insert({
        kind: "measure",
        title: `Site measure, ${claimed.customer_name}`,
        customer_id: customer?.id || null,
        customer_name: claimed.customer_name,
        site_address: claimed.site_address,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        all_day: false,
        // The window, not a time, because a time has not been chosen yet. The
        // calendar shows the block and the person picks the hour inside it.
        notes: [
          `Booked on the website. Fee paid.`,
          claimed.customer_phone ? `Phone ${claimed.customer_phone}` : "",
          claimed.notes ? `They wrote: ${claimed.notes}` : "",
        ].filter(Boolean).join("\n"),
        status: "booked",
        source: "pcd",
      })
      .select("id")
      .single();
    if (eventError) {
      console.error("[site-measure] could not write the calendar event:", eventError.message);
    } else {
      calendarEventId = event.id;
    }
  }

  const { data: saved } = await supabase
    .from("pcd_site_measure_bookings")
    .update({ customer_id: customer?.id || null, calendar_event_id: calendarEventId, updated_at: now })
    .eq("id", bookingId)
    .select("*")
    .maybeSingle();

  const finished = saved || claimed;
  const settings = await getBookingSettings(supabase);
  const used = await usedByDay(supabase, { from: finished.booking_date, to: finished.booking_date });

  // THE CREDIT IS WRITTEN NOW, NOT WHEN SOMETHING GOES WRONG.
  //
  // We told them at the moment they paid that this comes off any order that
  // follows. That promise is kept by a credit existing from the moment the
  // money does, so it is sitting on their record ready to attach itself to the
  // first quote we write them.
  //
  // THE BUG THIS FIXES. The credit used to be created only when a booking was
  // CANCELLED inside the confirmation window, which is the one path nobody
  // takes. A customer who booked, paid, had their measure and got a quote had
  // no credit at all, so the whole "deducted from your order" promise did
  // nothing, silently, on every booking.
  //
  // Idempotent: one booking, one credit, guarded by a unique index. A webhook
  // delivered twice cannot mint a second hundred dollars.
  let credit = null;
  if (customer?.id) {
    try {
      credit = await createCredit(supabase, {
        customerId: customer.id,
        amount: finished.fee_amount,
        reason: "site_measure",
        paidOn: String(finished.fee_paid_at || now).slice(0, 10),
        bookingId: finished.id,
        notes: `Site measure fee paid for ${dayWordsOf(finished)}.`,
      });
    } catch (creditError) {
      // Said out loud rather than swallowed. The booking is real and paid for
      // either way, and a missing credit is visible on the customer record as
      // money we took with nothing held against it.
      console.error("[site-measure] could not write the customer credit:", creditError?.message || creditError);
    }
  }

  // AND IT GOES IN THE CUSTOMER'S OWN LOG.
  //
  // A calendar event is where the work is; the log is where somebody looks to
  // answer "what has happened with this customer". A hundred dollars arriving
  // belongs in both. Never throws: the money has landed and the day is booked.
  try {
    await logOrderActivity(supabase, {
      customer_id: customer?.id || null,
      actor_type: "customer",
      action_type: "site_measure_booked",
      title: "Site measure booked and paid for",
      description:
        `${dayWordsOf(finished)}, ${windowWordsOf(finished)}. ` +
        `Fee ${formatFee(finished.fee_amount)} paid${credit ? ", held as a credit against their next order" : ""}.`,
      metadata: {
        booking_id: finished.id,
        booking_date: finished.booking_date,
        fee_amount: finished.fee_amount,
        credit_id: credit?.id || null,
        site_address: finished.site_address,
        stripe_payment_intent_id: finished.stripe_payment_intent_id,
      },
      event_key: `site-measure:${finished.id}:booked`,
    });
  } catch (logError) {
    console.error("[site-measure] could not log the booking:", logError?.message || logError);
  }

  // Never throws. The money has arrived and the day is committed; an email that
  // will not send must not undo either.
  await sendSiteMeasureBookedToCustomer({
    booking: finished,
    confirmHours: settings.confirm_hours,
    baseUrl,
  });
  await sendSiteMeasureBookedToSales({
    booking: finished,
    confirmHours: settings.confirm_hours,
    placesLeft: placesLeft(settings, used[finished.booking_date] || 0),
    baseUrl,
  });

  return { ok: true, booking: finished, alreadyDone: false };
}

/**
 * Call a booking off.
 *
 * The outcome is worked out from the clock against the confirmation window, not
 * passed in, so nobody can pick the generous answer for one customer and the
 * mean one for the next. An override is possible and is a separate, recorded
 * act: see the refund path on a credit.
 *
 * Returns { outcome, credit, refundId }.
 */
export async function cancelSiteMeasureBooking(supabase, { bookingId, reason = "", actor = null, force = null } = {}) {
  const { data: booking, error } = await supabase
    .from("pcd_site_measure_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) {
    const missing = new Error("Booking not found.");
    missing.status = 404;
    throw missing;
  }
  if (booking.status === "cancelled") {
    return { outcome: booking.cancellation_outcome, credit: null, refundId: booking.stripe_refund_id, already: true };
  }

  const settings = await getBookingSettings(supabase);
  const { startsAt } = bookingInstants(booking);
  const paid = booking.status === "booked" && Number(booking.fee_amount) > 0;

  // force is the recorded exception: somebody rang, you said yes, and that
  // decision is written down rather than being indistinguishable from the rule.
  const outcome = !paid
    ? "unpaid"
    : force === "refunded" || force === "credited"
      ? force
      : cancellationOutcome({ bookingStartsAt: startsAt, confirmHours: settings.confirm_hours }) === "refund"
        ? "refunded"
        : "credited";

  const now = new Date().toISOString();
  let refundId = null;
  let credit = null;

  // THE CREDIT ALREADY EXISTS. It was written when the fee cleared, so neither
  // outcome creates one: a cancellation only decides whether they keep it.
  const { data: existingCredit } = await supabase
    .from("pcd_customer_credits")
    .select("*")
    .eq("site_measure_booking_id", booking.id)
    .maybeSingle();

  // REFUNDING MEANS THEY NO LONGER HOLD THE CREDIT, and it has to be gone
  // BEFORE the money moves. Refunding a customer whose credit is already spent
  // on an order would pay them the same hundred dollars twice, so that case is
  // refused rather than quietly doing both.
  if (outcome === "refunded" && existingCredit) {
    if (existingCredit.state === "spent") {
      const spent = new Error(
        "That credit has already come off an order, so refunding the fee would pay it back twice. " +
          "Raise a variation on the order instead."
      );
      spent.status = 409;
      throw spent;
    }
    if (existingCredit.state === "available" || existingCredit.state === "held") {
      await closeCredit(supabase, existingCredit.id, {
        outcome: "refunded",
        reason: `Site measure on ${dayWordsOf(booking)} cancelled outside the confirmation window, fee refunded.`,
        actor,
      });
    }
  }

  if (outcome === "refunded" && booking.stripe_payment_intent_id) {
    const refund = await createRefund({
      paymentIntentId: booking.stripe_payment_intent_id,
      amount: Number(booking.fee_amount) || 0,
      reason: "requested_by_customer",
      metadata: { flow: "site_measure_booking", booking_id: booking.id },
      idempotencyKey: `site-measure-refund-${booking.id}`,
    });
    refundId = refund?.id || null;
  }

  if (outcome === "credited") {
    // They keep it. Usually there is nothing to do, because the credit was
    // written the moment the fee cleared; this only mints one for a booking
    // taken before that was true.
    credit = existingCredit;
    if (!credit) {
      // NOWHERE TO PUT IT IS A REFUSAL, NOT A SHRUG.
      //
      // Without a customer record there is no account to hold a credit on, so
      // carrying on would take the day off them and keep the hundred dollars
      // with nothing anywhere saying we owe it. Refunding is the only honest
      // answer available, and the person cancelling is told to do that.
      if (!booking.customer_id) {
        const noCustomer = new Error(
          "That booking has no customer record, so there is nowhere to hold the credit. Refund it instead."
        );
        noCustomer.status = 409;
        throw noCustomer;
      }
      credit = await createCredit(supabase, {
        customerId: booking.customer_id,
        amount: booking.fee_amount,
        reason: "site_measure",
        paidOn: String(booking.fee_paid_at || now).slice(0, 10),
        bookingId: booking.id,
        notes: `Site measure on ${dayWordsOf(booking)} cancelled inside the confirmation window.`,
      });
    }
  }

  await supabase
    .from("pcd_site_measure_bookings")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancellation_outcome: outcome,
      cancellation_reason: String(reason || "").trim() || null,
      stripe_refund_id: refundId,
      updated_at: now,
    })
    .eq("id", bookingId);

  // The day goes back to the website the moment this row stops occupying it,
  // which the status change above has already done.
  if (booking.calendar_event_id) {
    await supabase
      .from("pcd_calendar_events")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", booking.calendar_event_id);
  }

  await sendSiteMeasureCancelledToCustomer({
    booking,
    outcome,
    confirmHours: settings.confirm_hours,
  });

  return { outcome, credit, refundId, already: false };
}
