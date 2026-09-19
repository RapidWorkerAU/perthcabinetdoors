// THE THANK YOU PAGE'S OWN READ, AND ITS SAFETY NET.
//
// ── WHY THIS DOES WORK AND NOT JUST A LOOKUP ─────────────────────────────────
//
// The webhook is what turns a paid hold into a booking, and it usually arrives
// first. Usually is not always: a slow webhook means a customer who has just
// paid lands on a page that cannot find their booking, and the only thing worse
// than no confirmation is a confirmation page saying we have no record of you.
//
// So this asks Stripe directly whether the session is paid, and if it is, runs
// the same completion the webhook runs. Both are safe to run twice, because the
// booking is claimed with a conditional update, so whichever gets there first
// does the work and the other finds it done. The same shape the deposit gate
// already uses for exactly this reason.
//
// It returns only what a confirmation page should say. Not the customer's
// phone number, not the internal notes, and nothing about anybody else's day.

import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { retrieveCheckoutSession, returnOrigin } from "../../../../../lib/pcd-stripe";
import { completeSiteMeasureBooking } from "../../../../../lib/pcd-site-measure-booking";
import { getBookingSettings } from "../../../../../lib/pcd-booking-store";
import { dayWordsOf, windowWordsOf } from "../../../../../lib/pcd-site-measure-emails";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = String(searchParams.get("session_id") || "").trim();
    if (!sessionId) {
      return Response.json({ ok: false, error: "Missing booking reference." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    let session = null;
    try {
      session = await retrieveCheckoutSession(sessionId);
    } catch (stripeError) {
      // Stripe being unreachable must not lose the confirmation. If the webhook
      // has already done its work the booking is there to be read, so this falls
      // through to the lookup below rather than failing.
      console.error("[site-measure] could not read the checkout session:", stripeError?.message || stripeError);
    }

    const paid = session?.payment_status === "paid";
    if (paid) {
      await completeSiteMeasureBooking(supabase, session, { baseUrl: returnOrigin(request) });
    }

    const { data: booking } = await supabase
      .from("pcd_site_measure_bookings")
      .select("id, status, booking_date, window_from, window_to, customer_name, customer_email, site_address, fee_amount")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    if (!booking) {
      return Response.json(
        {
          ok: false,
          error:
            "We cannot find that booking yet. If your payment went through you will have an email from us; if it did not, nothing has been charged.",
        },
        { status: 404 }
      );
    }

    const settings = await getBookingSettings(supabase);

    return Response.json({
      ok: true,
      booked: booking.status === "booked",
      booking: {
        dayWords: dayWordsOf(booking),
        windowWords: windowWordsOf(booking),
        address: booking.site_address,
        name: booking.customer_name,
        email: booking.customer_email,
        fee: Number(booking.fee_amount) || 0,
      },
      confirmHours: settings.confirm_hours,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load that booking." },
      { status: 500 }
    );
  }
}
