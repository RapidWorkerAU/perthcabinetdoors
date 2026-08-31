// TURNING AN ADDRESS INTO SOMETHING THAT CANNOT BE TURNED BACK.
//
// Its own file because it imports node:crypto, and lib/pcd-site-tracking.js is
// pulled into the public site's browser bundle. One node import there would
// break the build for every visitor.
//
// ── WHAT THIS BUYS ──────────────────────────────────────────────────────────
//
// The visitor's address never reaches the database. What is stored is a hash of
// the address and the browser, mixed with a salt that CHANGES EVERY DAY. So:
//
//   * two visits from the same person on the same day match, which is what
//     makes a unique visitor count possible at all;
//   * the same person tomorrow is a completely different hash, so nothing in
//     this app can follow anybody from one day to the next;
//   * nothing is written to the visitor's machine, which is what keeps this out
//     of cookie banner territory.
//
// It is not anonymity against somebody holding the secret who is willing to
// hash every address in Perth against a known browser string. It is not meant
// to be. It is meant to make casual identification impossible and deliberate
// identification pointless, which for counting visits is the whole job.
//
// ── THE SALT ────────────────────────────────────────────────────────────────
//
// SITE_TRACKING_SALT in the environment, any long random string. If it is not
// set the hash still rotates daily and still never stores an address, but it
// becomes guessable by somebody who knows the date and the address, so the
// route says so in the log once rather than failing. A tracking script must
// never be the reason the website stops working.

import { createHash } from "node:crypto";

/** The salt for one Perth day. */
export function saltForDay(day, secret) {
  return createHash("sha256").update(`${secret || "pcd"}|${day}`).digest("hex");
}

/**
 * The stored identity for one visitor on one day.
 *
 * Truncated to 32 characters: still far more than enough to keep a day's worth
 * of Perth visitors apart, and a reminder in the table that this is a label
 * rather than a record of anything.
 */
export function visitorHash({ ip, userAgent, day, secret }) {
  const salt = saltForDay(day, secret);
  return createHash("sha256")
    .update(`${salt}|${String(ip || "")}|${String(userAgent || "")}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * The visitor's address out of the proxy headers, or "" when there is not one.
 *
 * x-forwarded-for is a chain, and the client is the FIRST entry. Taking the
 * last would hash Vercel's own edge address and put every visitor in the
 * country under one identity.
 */
export function clientIp(headers) {
  const forwarded = headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "";
}
