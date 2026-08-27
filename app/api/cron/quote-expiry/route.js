import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runQuoteExpiry } from "../../../../lib/pcd-quote-expiry";
import { siteUrl } from "../../../../lib/pcd-stripe";

// THE END OF A QUOTE'S LIFE.
//
// WHY IT EXISTS. A quote that went out and was never answered used to sit at
// 'sent' forever, still openable and still approvable at a price we may no
// longer be able to build it for. Lead conversion counted it as a lost lead
// after thirty days, so the books said gone and the system said live.
//
// This closes the gap from both ends: the customer is told once, seven days
// before, and the quote is archived the day after its validity runs out. See
// lib/pcd-quote-expiry.js for the clock and for what it refuses to touch.
//
// TWICE A DAY IS ENOUGH, because everything here is timed in days rather than
// hours. 22:00 and 06:00 UTC, which are six in the morning and two in the
// afternoon in Perth, because Perth is UTC+8 all year with no daylight saving to
// drift against. The worst a missed pass costs is a quote archived half a day
// late, and the slack runs in the customer's favour.
//
// THE WEEKLY DIGEST RIDES ALONG. It is not its own schedule: the sweep claims it
// once every six days through pcd_job_stamps, so it goes out on whichever pass
// first finds it due. That means one place to fail rather than two, and no
// separate cron entry to forget about.
//
// WHO ACTUALLY CALLS IT. The same two schedulers as the other jobs.
//
//   .github/workflows/scheduled-sync.yml  both passes.
//   vercel.json                           one daily pass, as a floor, because
//                                         GitHub switches a scheduled workflow
//                                         off on a repo nobody has pushed to
//                                         for 60 days.
//
// RUNNING TWICE IS HARMLESS. Every reminder is stamped the moment it is sent,
// archiving is claimed on the status it expects so two passes cannot both take
// the same quote, and the digest is a compare and swap.

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
    console.error(`[cron/quote-expiry] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }

  try {
    const summary = await runQuoteExpiry(createSupabaseAdminClient(), {
      baseUrl: siteUrl(request.url),
    });

    // One line per run, so "is it running" is answerable without a table for it.
    console.log(
      `[cron/quote-expiry] ${summary.validDays} day validity, ` +
        `${summary.warned} reminder(s) sent, ${summary.archived} archived` +
        // Worth seeing. Quotes reaching the end without ever being warned means
        // they crossed both thresholds between two passes, which is the sweep
        // not having run rather than customers being slow.
        (summary.archivedUnwarned
          ? `, ${summary.archivedUnwarned} of them never warned, so this job has been missing passes`
          : "") +
        (summary.digest
          ? `, weekly digest ${summary.digest.sent ? "sent" : "FAILED"} covering ` +
            `${summary.digest.archived} archived and ${summary.digest.expiringSoon} expiring`
          : "") +
        (summary.problems.length ? `, problems: ${summary.problems.join("; ")}` : "")
    );

    return Response.json(summary);
  } catch (error) {
    console.error(`[cron/quote-expiry] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "The quote expiry sweep failed." }, { status: 500 });
  }
}
