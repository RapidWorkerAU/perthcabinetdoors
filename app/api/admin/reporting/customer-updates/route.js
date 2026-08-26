import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { loadCustomerUpdates } from "../../../../../lib/pcd-weekly-updates";

// The weekly customer update report.
//
// Read only. Nothing here sends anything: these emails are triggered by a
// person reading this and pressing the button, which is the whole point of the
// report existing rather than a cron doing it.

export const dynamic = "force-dynamic";

/** Perth, so "this week" means the week the workshop had. */
function perthToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function backFrom(day, days) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const url = new URL(request.url);
    const today = perthToday();

    let from = url.searchParams.get("from") || backFrom(today, 7);
    let to = url.searchParams.get("to") || today;

    // A bad date would otherwise reach the query as a string and come back as a
    // confusing empty report rather than a wrong input.
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) {
      return Response.json({ ok: false, error: "Give the dates as YYYY-MM-DD." }, { status: 400 });
    }
    // Reversed rather than refused. Somebody picking the end date first is not
    // making a mistake worth an error message.
    if (from > to) [from, to] = [to, from];

    const report = await loadCustomerUpdates(context.supabase, { from, to });
    return Response.json({ ok: true, ...report });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not build the update report." },
      { status: 500 }
    );
  }
}
