import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { runMailSync } from "../../../../lib/pcd-mail-catchup";
import { runIntakeDrafts, runReplyDrafts } from "../../../../lib/pcd-alfred-drafts";

// ALFRED'S HOURLY PASS: READ THE MAILBOX, DRAFT REPLIES, THEN QUOTE REQUESTS
// AND ENQUIRIES.
//
// The mailbox read comes first, so a customer who wrote at 9:40 has a draft
// waiting by the 10 o'clock pass rather than the next morning. Then Alfred
// drafts replies to whatever is waiting on us, turns quote requests nobody has
// quoted into draft quotes, and drafts replies to new website enquiries.
// Nothing is sent: every draft waits on the Alfred page for a person.
//
// Called hourly through the working day by .github/workflows/scheduled-sync.yml
// (Vercel's Hobby plan only runs a cron once a day). Safe to run twice: the
// mail sync reads on from where it stopped, and a conversation already drafted
// is never drafted again.
//
// Switched off, it still reads the mailbox, which is harmless and keeps the
// board fresh, and drafts nothing.

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
    console.error(`[cron/alfred] refused: ${allowed.why}`);
    return Response.json({ ok: false, error: allowed.why }, { status: 401 });
  }
  try {
    const supabase = createSupabaseAdminClient();
    const mail = await runMailSync(supabase);
    if (!mail.ok) console.error(`[cron/alfred] the mailbox could not be read: ${mail.error}`);
    const summary = await runReplyDrafts(supabase);
    const intake = await runIntakeDrafts(supabase);
    console.log(
      "[cron/alfred] " +
        (!summary.enabled
          ? "switched off, nothing drafted"
          : `${summary.drafts} drafted, ${summary.questions} asked, ${summary.skipped} skipped, ${summary.withdrawn} withdrawn, US${summary.cost}`) +
        (intake.enabled ? `; ${intake.quotes} draft quotes, ${intake.drafts} enquiry replies, ${intake.questions} asked, US${intake.cost}` : "") +
        ([...summary.problems, ...intake.problems].length ? `, problems: ${[...summary.problems, ...intake.problems].join("; ")}` : "")
    );
    return Response.json({ mail: { ok: mail.ok }, ...summary, intake });
  } catch (error) {
    console.error(`[cron/alfred] failed: ${error?.message || error}`);
    return Response.json({ ok: false, error: error?.message || "Alfred's pass failed." }, { status: 500 });
  }
}
