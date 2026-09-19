// WHAT THE PUBLIC BOOKING PAGE IS ALLOWED TO KNOW.
//
// Days, their windows, how many places are left on each, the fee and the
// confirmation window. Not the postcode list, not the live flag's reasoning,
// and nothing about who else is booked. publicBookingView decides the shape so
// a second route cannot leak a different one.
//
// Never cached. A day that filled up thirty seconds ago must not still be on
// offer, and the whole point of the count is that it is current.

import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { bookableRange, publicBookingView } from "../../../../../lib/pcd-booking-settings";
import { getBookingSettings, usedByDay } from "../../../../../lib/pcd-booking-store";
import { perthToday } from "../../../../../lib/pcd-calendar";
import { cancellationRules, cancellationSummary } from "../../../../../lib/pcd-cancellation-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const settings = await getBookingSettings(supabase);
    const today = perthToday();

    // A page that is not live gets the flag and nothing else. No availability,
    // no fee, no days: there is nothing to show and nothing worth leaking about
    // a page that has not been turned on.
    if (!settings.is_live) {
      return Response.json({ ok: true, live: false });
    }

    const { earliest, latest } = bookableRange(settings, today);
    const used = await usedByDay(supabase, { from: earliest, to: latest });
    const view = publicBookingView(settings, { today, usedByDay: used });

    return Response.json({
      ok: true,
      live: true,
      ...view,
      // The cancellation rule travels with the availability, so the page never
      // has to know the confirm window means two things. See
      // lib/pcd-cancellation-policy.js.
      cancellation: {
        summary: cancellationSummary({ fee: view.fee, confirmHours: view.confirmHours }),
        rules: cancellationRules({ fee: view.fee, confirmHours: view.confirmHours }),
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load availability." },
      { status: 500 }
    );
  }
}
