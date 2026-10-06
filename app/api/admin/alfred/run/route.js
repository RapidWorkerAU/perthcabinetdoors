import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { runIntakeDrafts, runReplyDrafts } from "../../../../../lib/pcd-alfred-drafts";
import { runAlfredMorning } from "../../../../../lib/pcd-alfred-morning";

// The two "check now" buttons on the Alfred page: the same passes the schedule
// runs, on demand. The same switch and limits apply, so pressing one can never
// do more than the schedule would.
//
//   job "replies"  emails, quote requests and enquiries waiting on us (the
//                  hourly pass, without the mailbox read)
//   job "updates"  orders due an update (the morning pass, without the summary)

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));
  try {
    if (body.job === "updates") {
      return Response.json(await runAlfredMorning(context.supabase, { sendSummary: false }));
    }
    const replies = await runReplyDrafts(context.supabase);
    const intake = await runIntakeDrafts(context.supabase);
    return Response.json({
      ...replies,
      enabled: replies.enabled || intake.enabled,
      drafts: replies.drafts + intake.drafts,
      quotes: intake.quotes,
      questions: replies.questions + intake.questions,
      skipped: replies.skipped + intake.skipped,
      cost: Number((replies.cost + intake.cost).toFixed(4)),
      problems: [...replies.problems, ...intake.problems],
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Alfred's check failed." }, { status: 500 });
  }
}
