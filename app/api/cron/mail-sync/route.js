import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runMailSync } from "../../../../lib/pcd-mail-catchup";

// The nightly mailbox read.
//
// WHY IT EXISTS. The sync only ever ran when somebody pressed "Check mailbox",
// so the board was exactly as fresh as the last time a person thought to press
// it. A board nobody can trust to be current is not a board, it is a guess.
//
// SIX IN THE MORNING, PERTH. Schedules are UTC, and Perth is UTC+8 with no
// daylight saving at all, so 22:00 UTC is 06:00 the next morning in Perth every
// day of the year. Nothing to adjust twice a year and nothing to drift.
// See vercel.json.
//
// A RUN THAT IS CUT SHORT IS SAFE. Every pass reads oldest first from where the
// last one stopped, so a timeout mid-run is a pause, not a hole: tomorrow's run
// carries on from exactly where this one reached.

export const dynamic = "force-dynamic";
// Long enough to catch up on a normal night's mail. If it does run out of time,
// see above: nothing is lost.
export const maxDuration = 60;

// Vercel signs its cron requests with this. Anything that can reach the URL
// could otherwise make the mailbox be read on demand, and while that is not
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
    // Logged, because a cron failing silently every night at six is exactly the
    // sort of thing nobody notices for a month.
    console.error(`[cron/mail-sync] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const summary = await runMailSync(supabase);

    if (!summary.ok) {
      console.error(`[cron/mail-sync] the mailbox could not be read: ${summary.error}`);
      return Response.json({ ok: false, ...summary }, { status: 502 });
    }

    // One line in the log per night, so "is it running" is answerable without
    // adding a table for it.
    console.log(
      `[cron/mail-sync] ${summary.passes} pass${summary.passes === 1 ? "" : "es"}, ` +
        `${summary.scanned} scanned, ${summary.added} filed, ${summary.awaiting} waiting on a decision` +
        (summary.capped ? ", STILL BEHIND: ran out of passes" : "") +
        (summary.problems?.length ? `, problems: ${summary.problems.join("; ")}` : "")
    );

    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error(`[cron/mail-sync] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "The mail sync failed." }, { status: 500 });
  }
}
