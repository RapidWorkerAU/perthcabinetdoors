// Reading the mailbox until it is actually caught up.
//
// Shared by the button on the New senders tab and by the nightly job, because
// two copies of this loop would drift and only one of them would be the one
// that runs while nobody is watching.
//
// WHY IT LOOPS. A single pass is capped so a mailbox with years in it cannot
// turn one request into an unbounded run. But a capped pass leaves the mailbox
// ahead of us, and the failure this replaced was the system believing it was up
// to date when it was not. So it runs again while there is more.
//
// WHY LOOPING IS SAFE. Every pass reads OLDEST FIRST from where the last one
// stopped (see fetchMailboxMessages). Passes only ever move forward, and none
// can step over anything. That also means a run that is cut short, by a timeout
// or a deploy or anything else, is a pause rather than a hole: the next one
// picks up exactly where it stopped.

import { syncMailbox, FIRST_RUN_DAYS } from "./pcd-desk-sync";

const PASSES = 12;
const OVERLAP_MS = 5 * 60 * 1000;

const EMPTY = {
  scanned: 0, added: 0, tickets: 0, customers: 0, attachments: 0,
  skipped: 0, ignored: 0, awaiting: 0, alreadyHeld: 0,
};

function add(total, run) {
  if (!total) return { ...run };
  const merged = { ...run, problems: [...(total.problems || []), ...(run.problems || [])] };
  for (const key of Object.keys(EMPTY)) merged[key] = (total[key] || 0) + (run[key] || 0);
  return merged;
}

/**
 * @param supabase          a service-role client
 * @param firstRunDays      how far back to read when there is nothing on file yet
 * @param catchUpDays       reach back PAST the cursor, for mail an older version
 *                          of the sync skipped. 0 for an ordinary run.
 */
export async function runMailSync(supabase, { firstRunDays = FIRST_RUN_DAYS, catchUpDays = 0, limit = 200 } = {}) {
  // A catch up carries its own cursor. Everything it is recovering is OLDER
  // than the newest row on file, so resuming from that row would snap the
  // window back to today and leave the gap exactly where it was.
  let resumeFrom = catchUpDays
    ? new Date(Date.now() - catchUpDays * 24 * 3600 * 1000).toISOString()
    : null;

  let summary = null;
  let passes = 0;

  for (let pass = 0; pass < PASSES; pass += 1) {
    const run = await syncMailbox(supabase, { firstRunDays, limit, since: resumeFrom });
    passes += 1;
    if (!run.ok) return { ...run, passes };

    summary = add(summary, run);

    if (catchUpDays) {
      if (!run.newestSeen) break;
      const next = new Date(new Date(run.newestSeen).getTime() - OVERLAP_MS).toISOString();
      // The window is not moving. Running again would read the same page for
      // ever, so stop rather than spin.
      if (resumeFrom && next <= resumeFrom) break;
      resumeFrom = next;
    }

    if (!run.capped) break;
  }

  // `capped` on the way out means the LAST pass still had more to read, so we
  // ran out of passes rather than out of mail. Saying so is the whole point.
  return { ...summary, passes };
}
