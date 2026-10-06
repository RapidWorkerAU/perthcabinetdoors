import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runAlfredMorning } from "../../../../lib/pcd-alfred-morning";
import { siteUrl } from "../../../../lib/pcd-stripe";

// ALFRED'S MORNING RUN: ORDER UPDATES, THEN THE SUMMARY.
//
// 22:30 UTC, which is 6:30am in Perth every day of the year. Called by
// .github/workflows/alfred.yml only; it used to be in vercel.json as well, and
// the summary went out twice. A second call the same day does nothing: see the
// once a day check in lib/pcd-alfred-morning.js.
//
// See lib/pcd-alfred-morning.js. Nothing here emails a customer.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, why: "CRON_SECRET is not set, so the job refuses to run." };
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}` ? { ok: true } : { ok: false, why: "Wrong or missing cron secret." };
}

export async function GET(request) {
  const allowed = authorised(request);
  if (!allowed.ok) {
    console.error(`[cron/alfred-morning] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }
  try {
    const summary = await runAlfredMorning(createSupabaseAdminClient(), { baseUrl: siteUrl(request.url) });
    console.log(
      "[cron/alfred-morning] " +
        (!summary.enabled
          ? "switched off"
          : `${summary.drafts} updates drafted, ${summary.questions} asked, ${summary.withdrawn} withdrawn, summary ${summary.summarySent ? "sent" : "not sent"}, US$${summary.cost}`) +
        (summary.problems.length ? `, problems: ${summary.problems.join("; ")}` : "")
    );
    return Response.json(summary);
  } catch (error) {
    console.error(`[cron/alfred-morning] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "Alfred's morning run failed." }, { status: 500 });
  }
}
