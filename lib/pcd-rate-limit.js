// HOW MANY TIMES ONE CALLER MAY ASK.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Found in the Pass 2 audit, 22 September 2026: there was no rate limiting
// anywhere in the application. The pages a customer opens are reached with an
// access code and nothing else, and while the code is a good one (eight hex
// characters from randomBytes, 4.29 billion of them, unique column), nothing
// stopped anybody guessing at it as fast as they liked.
//
// A guessed code is worse than a read. The approve route takes a code and an
// action, and on approval raises a real order and emails the customer to say
// they approved it.
//
// See supabase/202609221000_pcd_rate_limits.sql for the table and for why the
// count lives in the database rather than in a module variable.
//
// ── WHAT HAPPENS WHEN THE LIMITER ITSELF CANNOT WORK ─────────────────────────
//
// It lets the request through, and says so loudly in the log.
//
// That is a deliberate and uncomfortable choice, so it is worth being plain
// about both halves. Failing closed would mean that a database hiccup, or this
// project's own migration not having been run yet, would stop every customer
// opening their own quote. Failing open means the protection is quietly absent
// until somebody notices. The log line is what stops it being quiet, and it is
// written in the same shape as the one in pcd-business-defaults.js, which
// exists for exactly the same reason.
//
// If you are reading this because you saw that line in the log: run the
// migration. Until you do, there is no rate limiting.

import { createSupabaseAdminClient } from "./supabase/admin";

const TABLE = "pcd_rate_limits";

/**
 * The limits, in one place so they can be read together rather than found.
 *
 * These are generous on purpose. A real customer opens their quote, reads it,
 * refreshes once or twice, comes back tomorrow and approves it: single figures.
 * An attacker needs millions. The gap between those two is enormous, so the
 * limit sits where no genuine visitor will ever meet it. Locking somebody out
 * of their own quote would be a worse fault than the one this fixes.
 */
export const RATE_LIMITS = {
  // Reading something by access code. Covers the quote, the variation, the
  // saved design and the request list.
  lookup: { attempts: 60, windowSeconds: 600 },
  // Answering: approving or rejecting. Far rarer, and far more expensive when
  // it is not the real customer doing it.
  respond: { attempts: 10, windowSeconds: 600 },
};

/**
 * Who is asking.
 *
 * Vercel puts the caller's address in x-forwarded-for, left-most entry. There
 * is no pretending this is an identity: an address can be shared by a whole
 * office and changed by anybody with a proxy. It does not need to be an
 * identity. It needs to make a million guesses cost a million addresses.
 */
export function callerKey(request) {
  const forwarded = String(request?.headers?.get?.("x-forwarded-for") || "");
  const first = forwarded.split(",")[0].trim();
  return first || String(request?.headers?.get?.("x-real-ip") || "").trim() || "unknown";
}

/**
 * Count this attempt, and say whether it is allowed.
 *
 * Returns { allowed, remaining, retryAfterSeconds }. Never throws: a limiter
 * that can take a page down is a worse problem than the one it solves.
 */
export async function rateLimit(request, name, { key } = {}) {
  const limit = RATE_LIMITS[name];
  if (!limit) throw new Error(`No rate limit called ${name}`);

  const bucket = `${name}:${key || callerKey(request)}`;
  const windowMs = limit.windowSeconds * 1000;
  // Windows are fixed rather than sliding: every caller's window starts on the
  // same boundary, so two requests a second apart cannot land in two different
  // windows and both count as the first.
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();

  try {
    const supabase = createSupabaseAdminClient();

    // Everything older than the current window, for this caller only. Keeps the
    // table small without a scheduled job to forget about.
    await supabase.from(TABLE).delete().eq("bucket", bucket).lt("window_start", windowStart);

    const { data: existing, error: readError } = await supabase
      .from(TABLE)
      .select("attempts")
      .eq("bucket", bucket)
      .eq("window_start", windowStart)
      .maybeSingle();
    if (readError) throw readError;

    const attempts = Number(existing?.attempts || 0) + 1;

    const { error: writeError } = await supabase
      .from(TABLE)
      .upsert({ bucket, window_start: windowStart, attempts, updated_at: new Date().toISOString() }, { onConflict: "bucket,window_start" });
    if (writeError) throw writeError;

    const allowed = attempts <= limit.attempts;
    return {
      allowed,
      remaining: Math.max(0, limit.attempts - attempts),
      retryAfterSeconds: allowed ? 0 : Math.ceil((new Date(windowStart).getTime() + windowMs - Date.now()) / 1000),
    };
  } catch (error) {
    console.error(
      `[rate-limit] Could not count attempts for ${bucket}; the request was ALLOWED and there is currently ` +
        "no rate limiting on this route. Run supabase/202609221000_pcd_rate_limits.sql if you have not.",
      error?.message || error
    );
    return { allowed: true, remaining: limit.attempts, retryAfterSeconds: 0 };
  }
}

/**
 * The refusal, worded for whoever reads it.
 *
 * Says nothing about what was being guessed at, because the only person who
 * learns anything from a detailed refusal here is somebody who should not.
 */
export function tooManyAttempts(retryAfterSeconds) {
  return Response.json(
    {
      ok: false,
      error: "Too many attempts. Please wait a few minutes and try again, or contact us and we will help.",
    },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSeconds || 60)) } }
  );
}
