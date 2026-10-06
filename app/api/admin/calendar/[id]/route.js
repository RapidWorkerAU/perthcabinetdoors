import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { bookingSaveMessage } from "../../../../../lib/pcd-calendar";
import { cancelBooking, updateBooking } from "../../../../../lib/pcd-calendar-save";
import { siteUrl } from "../../../../../lib/pcd-stripe";

// Changing or cancelling one booking. The work is in lib/pcd-calendar-save.js,
// shared with Alfred, so a booking changes the same way whoever changes it.
//
// A production run is not here, and cannot be. Its dates live on the order and
// are changed on the order, which is what keeps the calendar and the order
// screen from ever showing different ends for the same job.

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { id } = await params;

  try {
    const payload = await request.json();
    const { event, sync, ask } = await updateBooking(context.supabase, id, payload, { baseUrl: siteUrl(request.url) });
    return Response.json({ ok: true, event, sync, ask });
  } catch (error) {
    const status = error?.status || 500;
    return Response.json({ ok: false, error: status === 500 ? bookingSaveMessage(error) : error.message }, { status });
  }
}

/**
 * Cancel a booking. The row is kept and marked cancelled rather than deleted:
 * a site measure that was booked and called off is a thing that happened.
 */
export async function DELETE(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { id } = await params;

  try {
    const { sync } = await cancelBooking(context.supabase, id);
    return Response.json({ ok: true, sync });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not cancel the booking." }, { status: 500 });
  }
}
