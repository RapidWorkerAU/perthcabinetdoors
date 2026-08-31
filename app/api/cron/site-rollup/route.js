import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runSiteRollup } from "../../../../lib/pcd-site-rollup";

// FOLDING YESTERDAY'S PAGE VIEWS INTO A DAY, AND THROWING THE OLD ONES OUT.
//
// WHY IT EXISTS. The dashboard shows up to ninety days of visits. Reading tens
// of thousands of raw rows on every page load is not something a dashboard
// should do, so each finished day becomes two small rows and the dashboard
// reads those. The same pass prunes raw rows older than ninety days, which is
// the only thing stopping that table growing for ever.
//
// TODAY IS LEFT ALONE on purpose. A half day written into the row the dashboard
// reads would look like a real number and be wrong until midnight. The
// dashboard counts today off the raw table instead. See lib/pcd-site-stats.js.
//
// RUNNING IT TWICE IS HARMLESS. Every day is folded from scratch and written
// with an upsert, so a second pass produces the same rows. It deliberately
// redoes the last three finished days every time, because a dwell time is sent
// when somebody LEAVES a page and a beacon from a phone that went to sleep can
// land the next morning.
//
// WHO CALLS IT. The same two schedulers as the other jobs:
//
//   .github/workflows/scheduled-sync.yml  the late pass only.
//   vercel.json                           one daily pass, as a floor, because
//                                         GitHub switches a scheduled workflow
//                                         off on a repo nobody has pushed to
//                                         for 60 days.

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
    console.error(`[cron/site-rollup] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }

  try {
    const summary = await runSiteRollup(createSupabaseAdminClient());

    // One line per run, so "is it running" is answerable without a table for it.
    console.log(
      `[cron/site-rollup] ${summary.rolled} day(s) folded, ${summary.views} page view(s), ` +
        `${summary.pruned} raw row(s) pruned` +
        (summary.problems.length ? `, problems: ${summary.problems.join("; ")}` : "")
    );

    return Response.json(summary);
  } catch (error) {
    console.error(`[cron/site-rollup] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "The site roll up failed." }, { status: 500 });
  }
}
