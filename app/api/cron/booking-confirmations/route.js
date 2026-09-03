import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runBookingAsks, runMorningChase } from "../../../../lib/pcd-booking-confirmation-sweep";
import { siteUrl } from "../../../../lib/pcd-stripe";

// ASKING TOMORROW'S CUSTOMERS WHETHER TOMORROW STILL SUITS.
//
// WHY IT EXISTS. A booking on the calendar was our opinion of what was
// happening; nobody had ever asked the person we were driving to. See
// lib/pcd-booking-confirmations.js.
//
// HOURLY, AND WHY THAT IS NOT OVERKILL. Every other job here is timed in days,
// so once or twice a day suits them. A booking at half past nine wants its ask
// at half past nine the day before, and a daily pass can only be right by
// accident. Hourly is never more than an hour late.
//
// WHO ACTUALLY CALLS IT.
//
//   .github/workflows/scheduled-sync-hourly.yml  every hour, the real schedule.
//   vercel.json                                  once a day, as a floor,
//                                                because GitHub switches a
//                                                scheduled workflow off on a
//                                                repo nobody has pushed to for
//                                                60 days.
//
// RUNNING TWICE IS HARMLESS. Every ask is claimed on the row before it is sent,
// with an update that only succeeds from 'not_asked', so two passes arriving
// together produce one email. The morning list is a compare and swap on
// pcd_job_stamps.
//
// QUIET HOURS ARE THE PASS'S PROBLEM, NOT THE BOOKING'S. A pass outside 7am to
// 8pm Perth does nothing and returns, so an overnight booking's ask waits for
// the seven o'clock pass rather than landing at four in the morning.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, why: "CRON_SECRET is not set, so the job refuses to run." };
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}` ? { ok: true } : { ok: false, why: "Wrong or missing cron secret." };
}

export async function GET(request) {
  const allowed = authorised(request);
  if (!allowed.ok) {
    console.error(`[cron/booking-confirmations] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const baseUrl = siteUrl(request.url);

    const asks = await runBookingAsks(supabase, { baseUrl });
    // The morning list rides along rather than having a schedule of its own,
    // the same way the quote expiry digest does. One thing to fail, not two.
    const chase = await runMorningChase(supabase, { baseUrl });

    console.log(
      `[cron/booking-confirmations] ` +
        (asks.quiet
          ? "outside sending hours, nothing asked"
          : `${asks.considered} due, ${asks.asked} asked, ${asks.toSales} to sales@, ${asks.failed} failed`) +
        (chase.sent ? `, morning list sent covering ${chase.waiting} waiting and ${chase.couldNotAsk} not asked` : "") +
        (asks.problems.length ? `, problems: ${asks.problems.join("; ")}` : "")
    );

    return Response.json({ ok: true, asks, chase });
  } catch (error) {
    console.error(`[cron/booking-confirmations] failed: ${error?.message || error}`);
    return Response.json(
      { ok: false, error: error?.message || "The booking confirmation pass failed." },
      { status: 500 }
    );
  }
}
