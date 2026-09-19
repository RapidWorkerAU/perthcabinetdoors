// A SITE MEASURE BOOKED ON THE WEBSITE, FROM OUR SIDE.
//
// Two things happen to one after it is taken: somebody sets the hour and tells
// the customer, or it is called off.
//
// ── THE CANCELLATION OUTCOME IS NOT A CHOICE ─────────────────────────────────
//
// Outside the confirmation window the card is refunded; inside it the money
// becomes a credit. Decided by the clock in lib/pcd-cancellation-policy.js, not
// by whoever is on the phone, because a rule that bends for whoever asks
// loudest is not a rule and cannot be defended when somebody compares notes.
//
// An exception IS possible, and it is a separate, recorded act: `force` writes
// the override into the same row so an unusual answer is visible as one rather
// than being indistinguishable from the rule.

import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { cancelSiteMeasureBooking } from "../../../../../lib/pcd-site-measure-booking";
import { sendSiteMeasureTimeToCustomer } from "../../../../../lib/pcd-site-measure-emails";
import { logOrderActivity } from "../../../../../lib/pcd-activity-log";
import { minutesOfTime } from "../../../../../lib/pcd-booking-settings";

async function bookingIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const id = await bookingIdFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_site_measure_bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ ok: false, error: "Booking not found." }, { status: 404 });
    return Response.json({ ok: true, booking: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not read that booking." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await bookingIdFromParams(params);
    const payload = await request.json().catch(() => ({}));
    const action = String(payload.action || "").trim();

    if (action === "cancel") {
      const result = await cancelSiteMeasureBooking(context.supabase, {
        bookingId: id,
        reason: payload.reason,
        actor: context.user?.email || null,
        // Only ever set deliberately. Null means the clock decides.
        force: payload.force === "refunded" || payload.force === "credited" ? payload.force : null,
      });

      return Response.json({
        ok: true,
        outcome: result.outcome,
        message: result.already
          ? "That booking was already cancelled."
          : result.outcome === "refunded"
            ? "Cancelled and the fee refunded to their card."
            : result.outcome === "credited"
              ? "Cancelled. The fee is held as a credit on their customer record."
              : "Cancelled. Nothing had been charged.",
      });
    }

    if (action === "confirm_time") {
      const time = String(payload.time || "").slice(0, 5);
      const minutes = minutesOfTime(time);
      if (minutes === null) {
        return Response.json({ ok: false, error: "That is not a time." }, { status: 400 });
      }

      const { data: booking } = await context.supabase
        .from("pcd_site_measure_bookings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!booking) return Response.json({ ok: false, error: "Booking not found." }, { status: 404 });
      if (booking.status !== "booked") {
        return Response.json(
          { ok: false, error: "That booking is not live, so there is nobody to tell." },
          { status: 409 }
        );
      }

      const sent = await sendSiteMeasureTimeToCustomer({ booking, startMinutes: minutes });

      // STAMPED ONLY WHEN IT ACTUALLY WENT. "We told them" and "we tried to
      // tell them" need opposite responses from us, and a calendar that cannot
      // tell them apart sends somebody out to a customer expecting nobody.
      if (sent.ok) {
        await context.supabase
          .from("pcd_site_measure_bookings")
          .update({ time_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", id);

        if (booking.calendar_event_id) {
          await context.supabase
            .from("pcd_calendar_events")
            .update({
              notes: [booking.notes, `Time confirmed with the customer: ${time}`].filter(Boolean).join("\n"),
              updated_at: new Date().toISOString(),
            })
            .eq("id", booking.calendar_event_id);
        }
      }

      if (booking.customer_id) {
        await logOrderActivity(context.supabase, {
          customer_id: booking.customer_id,
          actor_type: "admin",
          action_type: sent.ok ? "site_measure_time_confirmed" : "site_measure_time_not_sent",
          title: sent.ok ? "Site measure time confirmed" : "Could not send the site measure time",
          description: `${booking.booking_date} at ${time}${sent.ok ? "" : `. ${sent.error}`}`,
        });
      }

      return Response.json({
        ok: true,
        sent: sent.ok,
        message: sent.ok
          ? `Time sent to ${booking.customer_email}.`
          : `The time was NOT sent: ${sent.error}. Tell them another way.`,
      });
    }

    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not change that booking." },
      { status: error?.status || 500 }
    );
  }
}
