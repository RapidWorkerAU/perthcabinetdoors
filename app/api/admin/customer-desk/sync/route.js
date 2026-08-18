import { requireAdminApiContext } from "@/lib/admin-api";
import { graphStatus } from "@/lib/pcd-graph-mail";
import { syncMailbox, FIRST_RUN_DAYS } from "@/lib/pcd-desk-sync";
import { listPendingSenders } from "@/lib/pcd-mail-senders";

// Reading the mailbox and filing what is new.
//
// POST does the work, GET reports whether it could. Both are behind the admin
// guard: this reads a mailbox, so it is not something an unauthenticated caller
// gets to trigger.
//
// The sync is written to be safe to call repeatedly, so a button, a schedule
// and an impatient second click all do the right thing. See pcd-desk-sync.js.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Is the mailbox reachable, and who is waiting to be decided about. */
export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const [status, pending] = await Promise.all([
      graphStatus(),
      listPendingSenders(context.supabase),
    ]);
    return Response.json({ ok: true, mailbox: status, pendingSenders: pending });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not check the mailbox." }, { status: 500 });
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json().catch(() => ({}));
  // Only ever widened deliberately, and only on a first run when there is
  // nothing yet to resume from. A number typed by mistake cannot drag years of
  // mail in: the window is ignored entirely once any message has been filed.
  const firstRunDays = Math.min(Math.max(Number(body.firstRunDays) || FIRST_RUN_DAYS, 1), 365);

  try {
    const summary = await syncMailbox(context.supabase, { firstRunDays, limit: 50 });
    if (!summary.ok) {
      // Not a server fault. The mailbox is unreachable and the message says
      // which of the three usual causes it is, so 409 rather than 500.
      return Response.json({ ok: false, ...summary }, { status: 409 });
    }
    const pendingSenders = await listPendingSenders(context.supabase);
    return Response.json({ ok: true, ...summary, pendingSenders });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "The mail sync failed." }, { status: 500 });
  }
}
