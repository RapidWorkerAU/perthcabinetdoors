import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runCalendarSync } from "../../../../lib/pcd-calendar-sync";

// Keeping the calendar subscription alive, and catching whatever the webhook
// missed.
//
// WHY IT EXISTS WHEN THERE IS ALREADY A WEBHOOK. Two reasons, and the first is
// not optional. Microsoft expires a calendar subscription after three days at
// most, and a lapsed subscription fails silently: no error, no notification,
// the calendar simply stops hearing about changes and everybody carries on
// believing it. This renews it well before it lapses.
//
// The second is that a notification can be lost. A deployment mid-flight, a
// cold start that times out, a pull that failed on an expired secret: each
// costs one change. A pass every few hours means the worst case is a few hours
// stale rather than permanently wrong.
//
// TWICE A DAY IS ENOUGH given the webhook does the real work: 22:00 and 06:00
// UTC, which are six in the morning and two in the afternoon in Perth, because
// Perth is UTC+8 all year with no daylight saving to drift against.
//
// WHO ACTUALLY CALLS IT. Two schedulers, on purpose.
//
//   .github/workflows/scheduled-sync.yml  both passes. Vercel's Hobby plan
//                                         refuses a cron that runs more than
//                                         once a day, and refuses the whole
//                                         DEPLOYMENT with it, so the real
//                                         schedule lives on GitHub where it
//                                         costs nothing.
//   vercel.json                           one daily pass, as a floor. GitHub
//                                         switches a scheduled workflow off on
//                                         a repo nobody has pushed to for 60
//                                         days, and a subscription that lapses
//                                         does so silently.
//
// Running twice is harmless. See the note below: a pass that overlaps another
// costs a few seconds and cannot lose a change.
//
// A RUN THAT IS CUT SHORT IS SAFE. The delta link only advances when Graph says
// a read finished, so a timeout mid-pull is a pause and not a hole.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel signs its cron requests with this. Anything that could reach the URL
// could otherwise make the calendar be re-read on demand, and while that is not
// destructive it is not something a stranger should be able to trigger.
function authorised(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, why: "CRON_SECRET is not set, so the job refuses to run." };
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`
    ? { ok: true }
    : { ok: false, why: "Wrong or missing cron secret." };
}

export async function GET(request) {
  const allowed = authorised(request);
  if (!allowed.ok) {
    // Logged, because a cron failing silently is exactly the sort of thing
    // nobody notices until the subscription has been dead for a fortnight.
    console.error(`[cron/calendar-sync] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const summary = await runCalendarSync(supabase);

    if (!summary.ok) {
      console.error(`[cron/calendar-sync] the calendar could not be reached: ${summary.error}`);
      return Response.json({ ok: false, ...summary }, { status: 502 });
    }

    // One line per run, so "is it running" is answerable without adding a table
    // for it.
    console.log(
      `[cron/calendar-sync] subscription ${summary.subscription?.action || "unknown"}, ` +
        `pulled ${summary.pulled?.updated || 0} updated and ${summary.pulled?.created || 0} new, ` +
        `pushed ${summary.pushed?.pushed || 0}` +
        (summary.capped ? ", STILL BEHIND: ran out of pages" : "") +
        (summary.pushed?.problems?.length ? `, problems: ${summary.pushed.problems.join("; ")}` : "")
    );

    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error(`[cron/calendar-sync] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "The calendar sync failed." }, { status: 500 });
  }
}
