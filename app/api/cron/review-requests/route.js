import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runReviewRequests } from "../../../../lib/pcd-review-request-run";
import { siteUrl } from "../../../../lib/pcd-stripe";

// THE GOOGLE REVIEW REQUEST, ONCE A DAY.
//
// Sends the thank you email to every finished, paid order whose wait is up.
// The rules are in lib/pcd-review-requests.js and the sending in
// lib/pcd-review-request-run.js.
//
// WHO CALLS IT.
//
//   vercel.json                           01:00 UTC, which is 9am in Perth.
//   .github/workflows/scheduled-sync.yml  both of its passes, as a backstop.
//                                         The 6am Perth pass sends nothing,
//                                         because the job only sends between
//                                         8am and 6pm Perth time; the 2pm pass
//                                         picks up anything the morning missed.
//
// RUNNING TWICE IS HARMLESS. Every send is claimed on the order before it is
// made, so two passes arriving together cannot both email the same customer.
//
// NOTHING IS SENT UNTIL IT IS SWITCHED ON in Settings > Business Defaults, and
// then only for orders finished after that moment.

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
    console.error(`[cron/review-requests] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }

  try {
    const summary = await runReviewRequests(createSupabaseAdminClient(), { baseUrl: siteUrl(request.url) });

    console.log(
      "[cron/review-requests] " +
        (!summary.enabled
          ? "switched off, nothing to do"
          : summary.outsideHours
            ? "outside sending hours in Perth, nothing sent this pass"
            : `${summary.sent} sent, ${summary.skipped} skipped, ${summary.waiting} still waiting`) +
        (summary.problems.length ? `, problems: ${summary.problems.join("; ")}` : "")
    );

    return Response.json(summary);
  } catch (error) {
    console.error(`[cron/review-requests] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "The review request job failed." }, { status: 500 });
  }
}
