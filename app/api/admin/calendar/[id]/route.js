import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { bookingRowFromInput } from "../../../../../lib/pcd-calendar";
import { pushBooking } from "../../../../../lib/pcd-calendar-sync";

// Changing or cancelling one booking.
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
    const { data: existing, error: readError } = await context.supabase
      .from("pcd_calendar_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) return Response.json({ ok: false, error: "That booking no longer exists." }, { status: 404 });

    const payload = await request.json();

    // What the form sends back is the whole booking, not a patch of fields, so
    // it goes through the same validation as a new one. Anything not sent falls
    // back to what is already stored rather than being wiped.
    const { row, error: invalid } = bookingRowFromInput({
      kind: payload.kind ?? existing.kind,
      title: payload.title ?? existing.title,
      day: payload.day,
      startMinutes: payload.startMinutes,
      minutes: payload.minutes,
      allDay: payload.allDay ?? existing.all_day,
      customerId: payload.customerId ?? existing.customer_id,
      customerName: payload.customerName ?? existing.customer_name,
      orderId: payload.orderId ?? existing.order_id,
      quoteId: payload.quoteId ?? existing.quote_id,
      quoteRequestId: payload.quoteRequestId ?? existing.quote_request_id,
      siteAddress: payload.siteAddress ?? existing.site_address,
      notes: payload.notes ?? existing.notes,
      status: payload.status ?? existing.status,
      // A booking already in Outlook stays in Outlook unless somebody says
      // otherwise, so an edit never quietly takes it off the mailbox calendar.
      addToOutlook: payload.addToOutlook ?? existing.sync_state !== "skipped",
    });
    if (invalid) return Response.json({ ok: false, error: invalid }, { status: 400 });

    // An event that came from Outlook keeps its source. Editing it here still
    // pushes the change back, because it has an Outlook id to push against.
    const { data, error } = await context.supabase
      .from("pcd_calendar_events")
      .update({ ...row, sync_state: row.sync_state === "skipped" ? "skipped" : "pending" })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    const sync = await pushBooking(context.supabase, data);

    const { data: fresh } = await context.supabase
      .from("pcd_calendar_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return Response.json({ ok: true, event: fresh || data, sync });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update the booking." }, { status: 500 });
  }
}

/**
 * Cancel a booking.
 *
 * The row is kept and marked cancelled rather than deleted. A site measure that
 * was booked and called off is a thing that happened, and a row that vanishes
 * takes the reason with it. The Outlook event IS removed, because a cancelled
 * visit still sitting in the calendar is how somebody drives to Sorrento for
 * nothing.
 */
export async function DELETE(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { id } = await params;

  try {
    const { data, error } = await context.supabase
      .from("pcd_calendar_events")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    const sync = await pushBooking(context.supabase, data);
    return Response.json({ ok: true, sync });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not cancel the booking." }, { status: 500 });
  }
}
