// A FAILED EMAIL MUST NOT TELL A CUSTOMER THEIR MESSAGE WAS LOST.
//
// ── WHAT WAS HAPPENING ──────────────────────────────────────────────────────
//
// All three of our public forms did the same thing: save the record, then send
// the emails, and throw if a send came back with an error. The throw became a
// 500, and the form said "Could not send". But the record was already saved.
//
// So the customer was told their enquiry or quote request had failed when we
// had it. They send it again, or they give up and ring somebody else. The worst
// version of it needed nothing to be wrong at all: the business notification
// went out fine and only the customer's own confirmation copy bounced, and we
// still told them the whole thing had failed.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
// Once the record is saved, the customer is done. The row in pcd_quote_requests
// or pcd_enquiries is the system of record, and it shows on the admin screens
// whether or not any email went anywhere. Email is how we find out quickly, not
// how we find out at all.
//
// So a send that fails is recorded and reported to us, and the customer is told
// the truth, which is that we have it.
//
// This is deliberately NOT a retry. A bounced address will bounce again, and a
// customer waiting on a spinner is the thing we are trying to avoid.

/**
 * Run a send and turn any failure into a description of it.
 *
 * Takes both shapes of failure: a thrown error, and Resend's `{ error }` in an
 * otherwise successful promise. Missing either one is how a silent failure gets
 * through.
 */
export async function attemptSend(label, send) {
  try {
    const result = await send();
    const message = result?.error?.message || (result?.error ? String(result.error) : "");
    if (message) return { label, ok: false, error: message };
    return { label, ok: true };
  } catch (thrown) {
    return { label, ok: false, error: thrown?.message || "Send failed." };
  }
}

/**
 * Log what did not go out, loudly enough to find in the platform logs.
 *
 * Called for its effect, and returns the failures so a route can pass them back
 * as information rather than as an error.
 */
export function reportSendFailures(context, results) {
  const failures = (results || []).filter((result) => result && !result.ok);
  failures.forEach((failure) => {
    // console.error, not a thrown value: this is something WE have to chase, and
    // it must not travel back to the person who filled the form in.
    console.error(`[pcd-notify] ${context}: ${failure.label} email did not send. ${failure.error}`);
  });
  return failures;
}

/**
 * What to tell the caller alongside ok: true.
 *
 * The customer's own copy failing is worth saying on screen, because they will
 * be watching their inbox for it and its absence would otherwise look like we
 * ignored them. Our own notification failing is not their problem and is not
 * mentioned: the record is on the admin screen either way.
 */
export function customerNoticeFor(failures, { customerLabel = "customer" } = {}) {
  const customerFailed = (failures || []).some((failure) => failure.label === customerLabel);
  if (!customerFailed) return "";
  return "We could not send your confirmation email, but we have your details and will be in touch.";
}
