import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { notificationIsOurs, pullCalendar } from "../../../../lib/pcd-calendar-sync";

// Microsoft telling us the calendar changed.
//
// WHY A WEBHOOK AND NOT A POLL. A calendar is moved on a phone, standing in
// somebody's kitchen, and then acted on within the minute. A poll fast enough
// to keep up would be rude to Microsoft and still not fast enough; this arrives
// within seconds of the change.
//
// THIS URL IS PUBLIC AND HAS TO BE. Microsoft will not send to anything it has
// to authenticate against. Two things make that safe. The notification carries
// a clientState secret that only our subscription knows, checked on every
// request. And the notification itself contains nothing worth having: it says
// only that something changed, so the calendar is re-read from Graph with our
// own credentials rather than trusting a word of what arrived.
//
// IT RUNS WITH THE SERVICE ROLE, because a change made in Outlook arrives with
// nobody signed in. The row level security policy on pcd_calendar_events is
// bypassed by design here, exactly as the mail webhook already does.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Microsoft checks the URL is really ours before it will create a subscription:
 * it sends a token and wants it echoed back as plain text, quickly. Anything
 * else and the subscription is refused.
 */
function validationResponse(request) {
  const token = new URL(request.url).searchParams.get("validationToken");
  if (!token) return null;
  return new Response(token, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request) {
  const validation = validationResponse(request);
  if (validation) return validation;

  let payload;
  try {
    payload = await request.json();
  } catch {
    // Not something we can act on, and not worth making Microsoft retry over.
    return new Response(null, { status: 202 });
  }

  const notifications = Array.isArray(payload?.value) ? payload.value : [];
  if (!notifications.length) return new Response(null, { status: 202 });

  try {
    const supabase = createSupabaseAdminClient();

    // Every notification in the batch has to carry our secret. One that does
    // not is either a stale subscription from an earlier deployment or somebody
    // guessing at the URL, and both are ignored in silence rather than
    // answered with an error that would tell them which.
    const checks = await Promise.all(notifications.map((item) => notificationIsOurs(supabase, item)));
    if (!checks.some(Boolean)) {
      console.warn("[graph/calendar-webhook] ignored a notification that did not carry our client state");
      return new Response(null, { status: 202 });
    }

    // The notification says WHAT changed but not what it changed to, so the
    // calendar is re-read either way. One delta read answers the whole batch,
    // which is why a burst of ten changes costs one request rather than ten.
    const result = await pullCalendar(supabase);

    if (!result.ok) {
      // Reported to the log and accepted anyway. Microsoft retries a failed
      // notification for hours and then drops the subscription, and a pull that
      // failed for a bad secret would fail every retry too. The cron picks this
      // up on its next run.
      console.error(`[graph/calendar-webhook] the calendar could not be read: ${result.error}`);
      return new Response(null, { status: 202 });
    }

    if (result.updated || result.created || result.cancelled) {
      console.log(
        `[graph/calendar-webhook] ${result.updated} updated, ${result.created} new from Outlook, ` +
          `${result.cancelled} cancelled${result.echoes ? `, ${result.echoes} of our own writes ignored` : ""}`
      );
    }

    return new Response(null, { status: 202 });
  } catch (error) {
    console.error(`[graph/calendar-webhook] failed: ${error?.message || error}`);
    // Still accepted. See above: a retry would take the same path and fail the
    // same way, and losing the subscription costs far more than losing one
    // notification the cron will catch up on.
    return new Response(null, { status: 202 });
  }
}

// Microsoft sends the validation handshake as a POST, but has historically used
// a GET for it as well. Answering both costs nothing and a refused handshake
// means the subscription is simply never created.
export async function GET(request) {
  return validationResponse(request) || new Response(null, { status: 405 });
}
