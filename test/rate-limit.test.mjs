// GUESSING AT AN ACCESS CODE HAS TO COST SOMETHING.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Found in the Pass 2 audit, 22 September 2026. There was no rate limiting
// anywhere in this application, and every page a customer opens is reached with
// an access code and nothing else.
//
// The code itself was never the weak part: eight hex characters from
// randomBytes is 4,294,967,296 of them. The weak part was that nothing stopped
// anybody asking over and over. With N live quotes the expected number of
// guesses to land on one is about 4.29 billion divided by N, and at a few
// hundred requests a second that is hours rather than years.
//
// And a guessed code does more than read. The approve route takes a code and an
// action, and on approval raises a real order and emails the customer to say
// they approved it.
//
// See lib/pcd-rate-limit.js and supabase/202609221000_pcd_rate_limits.sql.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { callerKey, RATE_LIMITS, tooManyAttempts } from "../lib/pcd-rate-limit.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const headers = (values) => ({ get: (name) => values[name.toLowerCase()] ?? null });

// ── Who is asking ────────────────────────────────────────────────────────────

test("the caller is read from the left-most forwarded address", () => {
  // Vercel appends as a request passes through proxies, so the caller is first
  // and everything after it is infrastructure. Reading the last one would count
  // every visitor as the same proxy and limit the whole site at once.
  assert.equal(callerKey({ headers: headers({ "x-forwarded-for": "203.0.113.4, 10.0.0.1, 10.0.0.2" }) }), "203.0.113.4");
});

test("a caller with no forwarded address still gets a key", () => {
  // A key of "unknown" groups every unidentifiable caller together, which is
  // stricter than letting them through unlimited and is the right way round.
  assert.equal(callerKey({ headers: headers({}) }), "unknown");
  assert.equal(callerKey({}), "unknown");
  assert.equal(callerKey({ headers: headers({ "x-real-ip": "203.0.113.9" }) }), "203.0.113.9");
});

// ── The allowances ───────────────────────────────────────────────────────────

test("reading is allowed far more often than answering", () => {
  // A customer reads their quote repeatedly and answers it once. Somebody
  // guessing has to do both, and the answer is the expensive one to get wrong,
  // because it raises an order.
  assert.ok(RATE_LIMITS.lookup.attempts > RATE_LIMITS.respond.attempts);
});

test("the allowances leave a real customer alone", () => {
  // The whole risk of this change is locking somebody out of their own quote,
  // which would be a worse fault than the one it fixes. A customer opening
  // their quote a dozen times in ten minutes is unusual but not suspicious.
  assert.ok(RATE_LIMITS.lookup.attempts >= 30, "a customer refreshing must never meet the limit");
  assert.ok(RATE_LIMITS.respond.attempts >= 5, "a customer retrying a failed approval must not be locked out");
  for (const limit of Object.values(RATE_LIMITS)) {
    assert.ok(limit.windowSeconds > 0 && limit.windowSeconds <= 3600, "a window longer than an hour punishes too long");
  }
});

// ── The refusal ──────────────────────────────────────────────────────────────

test("the refusal says nothing about what was being guessed at", () => {
  const response = tooManyAttempts(120);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "120");
});

test("the refusal always carries a Retry-After somebody can act on", () => {
  // Zero or nothing would tell a browser it may retry immediately.
  assert.equal(tooManyAttempts(0).headers.get("Retry-After"), "60");
  assert.equal(tooManyAttempts().headers.get("Retry-After"), "60");
});

// ── Every route that takes a code has to be counted ──────────────────────────
//
// A source check, and the right tool for it: the question is whether any route
// was MISSED, which no amount of running one route can answer. This is the same
// shape as quote-lock-coverage, and for the same reason.

test("every public route that takes an access code is rate limited", () => {
  const publicRoutes = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.js" || entry.name === "route.ts") publicRoutes.push(full);
    }
  };
  walk(join(ROOT, "app", "api"));

  const missing = [];
  for (const route of publicRoutes) {
    const relative = route.slice(ROOT.length).replace(/\\/g, "/");
    // Admin routes are behind a session, and the cron routes behind a secret.
    if (relative.includes("/api/admin/") || relative.includes("/api/cron/")) continue;

    const source = readFileSync(route, "utf8");
    // Does it look up something by a code the caller supplied?
    const takesACode =
      /searchParams\.get\("code"\)/.test(source) ||
      /payload\.code/.test(source) ||
      /\beq\("access_code"/.test(source);
    if (!takesACode) continue;

    if (!/rateLimit\(/.test(source)) missing.push(relative);
  }

  assert.deepEqual(missing, [], "these take an access code and nothing counts the attempts");
});

test("the rate limit table migration exists and is not indexed by a guessable id", () => {
  const sql = readFileSync(join(ROOT, "supabase", "202609221000_pcd_rate_limits.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.pcd_rate_limits/);
  // Row level security on, because nobody signed in has any business reading
  // how close anybody else is to a limit.
  assert.match(sql, /enable row level security/);
});
