// SENDING AN EMAIL, AND SAYING SO HONESTLY.
//
// ── THE FAULT THIS CLOSES ────────────────────────────────────────────────────
//
// Resend does not throw when it refuses a message. It answers
// { data: null, error: { message } }, and every send in this app was written
// like this:
//
//     await resend.emails.send({ ... });
//     emailSent = true;
//
// So a refused message, a domain that is not verified, an address that bounces
// at the gate, a rate limit, all came back as "sent". The screen said the quote
// had gone, the variation said it was with the customer, and nothing anywhere
// said otherwise. The first anybody knows is the customer saying they never got
// it, which is usually a week later and usually on the phone.
//
// ── WHAT THIS DOES ───────────────────────────────────────────────────────────
//
// One send, one honest answer. It never throws: the document has usually
// already been marked as sent by the time the email goes, and failing the whole
// request would leave the record and the screen disagreeing. The caller gets
// { ok, id, error } and passes the error on to the person who pressed the
// button, which is the only place it is any use.

/**
 * Send one email. Returns { ok, id, error } and never throws.
 *
 * @param {object} resend  a Resend client
 * @param {object} payload what resend.emails.send takes
 */
export async function sendEmail(resend, payload) {
  if (!resend) return { ok: false, id: null, error: "Email is not configured, so nothing was sent." };
  try {
    const sent = await resend.emails.send(payload);
    if (sent?.error) {
      // Named in the log as well as returned, because the message often says
      // exactly what is wrong with the address or the domain.
      console.error("[email] refused:", sent.error?.message || sent.error);
      return { ok: false, id: null, error: sent.error?.message || "The email provider refused the message." };
    }
    return { ok: true, id: sent?.data?.id || null, error: "" };
  } catch (thrown) {
    console.error("[email] could not be sent:", thrown?.message || thrown);
    return { ok: false, id: null, error: thrown?.message || "The email could not be sent." };
  }
}

/**
 * The words to put in front of somebody when a send failed.
 *
 * The document is saved and the link works, so this is "it did not go out",
 * not "it did not happen". Said that way round because the next thing they do
 * depends on which it is.
 */
export function sendFailureNotice(what, error) {
  return `${what} is saved, but the email did not go out: ${error || "the provider refused it"}. Send it again, or copy the link and send it yourself.`;
}
