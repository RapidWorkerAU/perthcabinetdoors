import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runDepositSweep } from "../../../../lib/pcd-deposit-sweep";
import { siteUrl } from "../../../../lib/pcd-stripe";

// THE THIRD WAY A PAID DEPOSIT BECOMES AN ORDER, and the only one that catches
// a webhook which never arrived at all.
//
// WHY IT EXISTS. Approving a quote that needs a deposit now creates nothing
// until Stripe says the money landed. That removes the old problem of orders
// for work nobody paid for, and moves the danger to the opposite corner: the
// customer pays and we miss it. A lost webhook used to cost one payment record;
// now it would cost the whole order. So the webhook is not trusted to be the
// only teller. Every attempt we still think is open gets asked about directly.
//
// It also sends the chase: one reminder an hour in, a final one at twenty four
// hours, and a note to sales@ alongside the final one so the handover from
// machine to person happens in one go.
//
// TWICE A DAY IS ENOUGH given the webhook and the thank you page do the real
// work: 22:00 and 06:00 UTC, which are six in the morning and two in the
// afternoon in Perth, because Perth is UTC+8 all year with no daylight saving
// to drift against. It does mean the one hour reminder can land a few hours
// late, which for a nudge is fine and costs no new infrastructure.
//
// WHO ACTUALLY CALLS IT. The same two schedulers as the other jobs.
//
//   .github/workflows/scheduled-sync.yml  both passes. Vercel's Hobby plan
//                                         refuses a cron that runs more than
//                                         once a day, and refuses the whole
//                                         DEPLOYMENT with it.
//   vercel.json                           one daily pass, as a floor, because
//                                         GitHub switches a scheduled workflow
//                                         off on a repo nobody has pushed to
//                                         for 60 days.
//
// RUNNING TWICE IS HARMLESS. Finalising claims the quote conditionally, so two
// overlapping passes cannot both raise an order, and every reminder is stamped
// the moment it is sent rather than at the end of the pass.

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
    console.error(`[cron/deposit-sweep] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }

  try {
    const summary = await runDepositSweep(createSupabaseAdminClient(), {
      baseUrl: siteUrl(request.url),
    });

    // One line per run, so "is it running" is answerable without a table for it.
    console.log(
      `[cron/deposit-sweep] checked ${summary.reconciled.checked} open, ` +
        `finalised ${summary.reconciled.finalised}, expired ${summary.reconciled.expired}, ` +
        `reminders ${summary.chased.first} first and ${summary.chased.final} final, ` +
        // Worth seeing. A pass skipping first reminders means quotes are
        // arriving here already more than a day old, which is the sweep not
        // having run rather than customers being slow.
        (summary.chased.skippedFirst
          ? `skipped ${summary.chased.skippedFirst} first reminder(s) as already past 24h, `
          : "") +
        `sales notices ${summary.chased.sales}` +
        (summary.problems.length ? `, problems: ${summary.problems.join("; ")}` : "")
    );

    return Response.json(summary);
  } catch (error) {
    console.error(`[cron/deposit-sweep] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "The deposit sweep failed." }, { status: 500 });
  }
}
