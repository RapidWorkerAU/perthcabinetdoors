// THE PAYMENT LINK PAGE'S OWN READ AND ITS PAY BUTTON.
//
// A site measure booked by hand on the calendar is sent a link with a code.
// GET says what the page shows; POST saves the details (when we asked for them)
// and opens a Stripe page. The webhook then completes it exactly as it does a
// website booking. See lib/pcd-site-measure-payment-link.js.
//
// EVERY QUERY IS SCOPED BY THE CODE, and what is returned is a description for
// the page, never the row: no internal notes, nothing about anybody else.
//
// The website's own live switch does not apply here. That switch is about
// taking new bookings online; this one was taken by a person on the phone.

import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { rateLimit, tooManyAttempts } from "../../../../../lib/pcd-rate-limit";
import { returnOrigin } from "../../../../../lib/pcd-stripe";
import { getBookingSettings, measureRoomOptions } from "../../../../../lib/pcd-booking-store";
import { bookingWhen } from "../../../../../lib/pcd-booking-confirmations";
import { cancellationSummary } from "../../../../../lib/pcd-cancellation-policy";
import { momentWords } from "../../../../../lib/pcd-site-measure-payment-link";
import {
  bookingForLink,
  linkState,
  startLinkCheckout,
} from "../../../../../lib/pcd-site-measure-payment-link-store";
import { isJobType, normalizeMeasureRooms } from "../../../../../lib/pcd-site-measure-scope";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (value) => String(value ?? "").trim();

function bad(message, status = 400, extra = {}) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

function viewOf(booking, event, settings, state, rooms) {
  const when = event ? bookingWhen(event) : null;
  return {
    state: state.state,
    closesWords: momentWords(state.closesAt),
    dayWords: when?.dayLong || "",
    timeWords: when?.timeRange || "",
    needDetails: Boolean(booking.details_requested),
    fee: Number(booking.fee_amount) || 0,
    cancellation: cancellationSummary({ fee: booking.fee_amount, confirmHours: settings.confirm_hours }),
    rooms,
    details: {
      name: booking.customer_name || "",
      email: booking.customer_email || "",
      phone: booking.customer_phone || "",
      street: booking.site_street || "",
      suburb: booking.site_suburb || "",
      postcode: booking.site_postcode || "",
      address: booking.site_address || event?.site_address || "",
      rooms: normalizeMeasureRooms(booking.measure_rooms),
      jobType: booking.job_type || "",
      notes: booking.notes || "",
    },
  };
}

export async function GET(request) {
  try {
    const limited = await rateLimit(request, "lookup");
    if (!limited.allowed) return tooManyAttempts(limited.retryAfterSeconds);

    const code = text(new URL(request.url).searchParams.get("code"));
    if (!code) return bad("This link is missing its code. Please use the link in your email.");

    const supabase = createSupabaseAdminClient();
    const { booking, event } = await bookingForLink(supabase, code);
    if (!booking) return bad("We could not find that booking. The link may be out of date.", 404);

    const settings = await getBookingSettings(supabase);
    const state = linkState(booking, event, settings);
    const rooms = await measureRoomOptions(supabase);
    return Response.json({ ok: true, booking: viewOf(booking, event, settings, state, rooms) });
  } catch (error) {
    return bad(error?.message || "We could not load this booking.", 500);
  }
}

export async function POST(request) {
  try {
    const limited = await rateLimit(request, "respond");
    if (!limited.allowed) return tooManyAttempts(limited.retryAfterSeconds);

    const payload = await request.json().catch(() => ({}));
    const code = text(payload.code);
    if (!code) return bad("This link is missing its code. Please use the link in your email.");

    const supabase = createSupabaseAdminClient();
    const { booking, event } = await bookingForLink(supabase, code);
    if (!booking) return bad("We could not find that booking. The link may be out of date.", 404);

    const settings = await getBookingSettings(supabase);
    const state = linkState(booking, event, settings);
    if (state.state === "paid") return bad("This site measure is already paid for.", 409);
    if (state.state === "cancelled") return bad("This booking has been cancelled.", 409);
    if (state.state !== "open") {
      return bad("This link has closed, so the booking can no longer be confirmed online. Please call us.", 409);
    }

    let current = booking;
    if (booking.details_requested) {
      const name = text(payload.name);
      const email = text(payload.email).toLowerCase();
      const phone = text(payload.phone);
      const street = text(payload.street);
      const suburb = text(payload.suburb);
      const postcode = text(payload.postcode);
      const rooms = normalizeMeasureRooms(payload.rooms, await measureRoomOptions(supabase));
      const jobType = text(payload.jobType);

      const missing = [];
      if (!name) missing.push("your name");
      if (!email) missing.push("an email address");
      if (!phone) missing.push("a phone number");
      if (!street) missing.push("a street address");
      if (!suburb) missing.push("a suburb");
      if (!postcode) missing.push("a postcode");
      if (!rooms.length) missing.push("the rooms you would like measured");
      if (!isJobType(jobType)) missing.push("what kind of job it is");
      if (missing.length) return bad(`We still need ${missing.join(", ")}.`);
      if (!EMAIL_RE.test(email)) return bad("That email address does not look right.");

      const { data, error } = await supabase
        .from("pcd_site_measure_bookings")
        .update({
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          site_street: street,
          site_suburb: suburb,
          site_postcode: postcode,
          site_address: [street, suburb, postcode].filter(Boolean).join(", "),
          measure_rooms: rooms,
          job_type: jobType,
          notes: text(payload.notes).slice(0, 2000) || null,
          details_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("status", "awaiting_payment")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return bad("This booking changed while you were filling it in. Please refresh the page.", 409);
      current = data;
    }

    const origin = returnOrigin(request);
    const session = await startLinkCheckout(supabase, current, {
      successUrl: `${origin}/book-a-site-measure/booked?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/book-a-site-measure/pay?code=${encodeURIComponent(code)}`,
      closesAt: state.closesAt,
    });
    return Response.json({ ok: true, checkoutUrl: session.url });
  } catch (error) {
    return bad(error?.message || "We could not open the payment page. Nothing has been charged.", 500);
  }
}
