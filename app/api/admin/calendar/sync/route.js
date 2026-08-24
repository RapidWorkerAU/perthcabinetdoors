import { requireAdminApiContext } from "@/lib/admin-api";
import { calendarStatus } from "@/lib/pcd-graph-calendar";
import { readSyncState, runCalendarSync } from "@/lib/pcd-calendar-sync";

// Checking on the calendar sync, and making it run now.
//
// GET reports whether it could. POST does the work. Both behind the admin
// guard: this reads and writes a mailbox calendar, which is not something an
// unauthenticated caller gets to trigger.
//
// The sync is written to be safe to call repeatedly, so the button, the cron
// and an impatient second click all do the right thing. See pcd-calendar-sync.js.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How healthy the link to the mailbox calendar is, in the words a person reads. */
export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const [status, state] = await Promise.all([calendarStatus(), readSyncState(context.supabase)]);

    // Anything the site thinks is in Outlook but has not managed to put there.
    // Counted rather than listed, because the number is what says whether to
    // worry and the bookings themselves are already on the calendar.
    const { count: waiting } = await context.supabase
      .from("pcd_calendar_events")
      .select("id", { count: "exact", head: true })
      .in("sync_state", ["pending", "failed"])
      .neq("status", "cancelled");

    return Response.json({
      ok: true,
      calendar: status,
      subscribed: Boolean(state.subscription_id),
      subscriptionExpiresAt: state.subscription_expires_at,
      lastPullAt: state.last_pull_at,
      lastPushAt: state.last_push_at,
      lastError: state.last_error,
      waiting: waiting || 0,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not check the calendar sync." }, { status: 500 });
  }
}

export async function POST() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const summary = await runCalendarSync(context.supabase);
    if (!summary.ok) {
      // Not a server fault. The calendar is unreachable and the message names
      // which of the usual causes it is, so 409 rather than 500.
      return Response.json({ ok: false, ...summary }, { status: 409 });
    }
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "The calendar sync failed." }, { status: 500 });
  }
}
