// TAKING A SITE MEASURE BOOKING OFF THE WEBSITE.
//
// ── THE ORDER OF OPERATIONS IS THE FEATURE ───────────────────────────────────
//
// The day is claimed BEFORE the payment page is opened, not after. Two people
// can reach the last slot in the same second, and counting in the browser or
// counting and then writing both hand the day to both of them. So:
//
//   1. check the day, write the hold, check again and withdraw if it lost
//   2. open Stripe against the row that now exists
//   3. the webhook turns a paid hold into a booking and a calendar event
//
// Done the other way round you take $100 for a day that filled up while the
// customer was typing their card number, and then you have to ring somebody and
// give it back. See lib/pcd-booking-store.js.
//
// ── NO CUSTOMER RECORD IS CREATED HERE ───────────────────────────────────────
//
// Deliberately. A hold that is never paid would otherwise leave a customer
// behind for somebody who never became one, and the customers list is a list of
// people we have done business with. The upsert happens in the webhook, when
// their money has actually arrived.

import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { createCheckoutSession, returnOrigin } from "../../../../../lib/pcd-stripe";
import { dayState, postcodeAllowed, windowForDay } from "../../../../../lib/pcd-booking-settings";
import { getBookingSettings, holdDay, usedByDay } from "../../../../../lib/pcd-booking-store";
import { perthToday } from "../../../../../lib/pcd-calendar";

export const dynamic = "force-dynamic";

const text = (value) => String(value ?? "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request) {
  try {
    const supabase = createSupabaseAdminClient();
    const settings = await getBookingSettings(supabase);

    if (!settings.is_live) {
      return Response.json(
        { ok: false, error: "Online booking is not open at the moment. Please get in touch and we will find you a day." },
        { status: 409 }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const day = text(payload.day).slice(0, 10);
    const name = text(payload.name);
    const email = text(payload.email).toLowerCase();
    const phone = text(payload.phone);
    const street = text(payload.street);
    const suburb = text(payload.suburb);
    const postcode = text(payload.postcode);

    // EVERY FIELD NAMED ON ITS OWN. A single "please fill in the form" makes
    // somebody hunt for what they missed, on a page where the next step is
    // paying us.
    const missing = [];
    if (!name) missing.push("your name");
    if (!email) missing.push("an email address");
    if (!phone) missing.push("a phone number");
    if (!street) missing.push("a street address");
    if (!suburb) missing.push("a suburb");
    if (!postcode) missing.push("a postcode");
    if (missing.length) {
      return Response.json({ ok: false, error: `We still need ${missing.join(", ")}.` }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return Response.json({ ok: false, error: "That email address does not look right." }, { status: 400 });
    }

    // Told BEFORE they reach a payment page, never after. Somebody outside the
    // area finding out at the receipt is a refund and a phone call.
    if (!postcodeAllowed(settings, postcode)) {
      return Response.json(
        {
          ok: false,
          field: "postcode",
          error:
            "We do not get out to that postcode for site measures. Send us your sizes instead and we will quote from those.",
        },
        { status: 422 }
      );
    }

    if (!windowForDay(settings, day)) {
      return Response.json({ ok: false, error: "We are not out on that day. Please pick another." }, { status: 422 });
    }
    const used = await usedByDay(supabase, { from: day, to: day });
    const state = dayState(settings, day, { today: perthToday(), used: used[day] || 0 });
    if (state !== "free") {
      return Response.json(
        {
          ok: false,
          field: "day",
          error: state === "full"
            ? "That day filled up. Please pick another."
            : "That day is not available. Please pick another.",
        },
        { status: 409 }
      );
    }

    const held = await holdDay(supabase, settings, {
      day,
      customer: {
        name, email, phone, street, suburb, postcode,
        address: [street, suburb, postcode].filter(Boolean).join(", "),
        notes: text(payload.notes) || null,
      },
    });
    if (!held.ok) {
      return Response.json({ ok: false, field: "day", error: held.error }, { status: 409 });
    }

    const booking = held.booking;
    const baseUrl = returnOrigin(request);

    try {
      const session = await createCheckoutSession({
        amount: booking.fee_amount,
        currency: "AUD",
        customerEmail: email,
        description: `Site measure booking fee, ${day}`,
        successUrl: `${baseUrl}/book-a-site-measure/booked?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/book-a-site-measure?cancelled=1`,
        metadata: {
          flow: "site_measure_booking",
          booking_id: booking.id,
          booking_date: day,
        },
      });

      await supabase
        .from("pcd_site_measure_bookings")
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      return Response.json({ ok: true, bookingId: booking.id, checkoutUrl: session.url });
    } catch (stripeError) {
      // THE HOLD GOES BACK IMMEDIATELY. A payment page that could not be opened
      // must not leave a day off the website for twenty minutes over a fault
      // that was ours.
      await supabase
        .from("pcd_site_measure_bookings")
        .update({ status: "expired", hold_expires_at: null, updated_at: new Date().toISOString() })
        .eq("id", booking.id)
        .eq("status", "holding");
      throw stripeError;
    }
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not start this booking. Nothing has been charged." },
      { status: 500 }
    );
  }
}
