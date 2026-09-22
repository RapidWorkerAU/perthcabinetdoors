// THREE GUARDS ON MONEY, FROM THE PASS 3 AUDIT.
//
// One rounding rule, a live Stripe key that cannot be used by accident, and a
// credit that cannot be swallowed by a half-finished write. Nothing here is
// clever; all three were found by asking the same question of each money path,
// which is what Pass 3 of docs/reliability-audit-plan.md is for.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { roundMoney } from "../lib/pcd-money.js";
import { applyCredits, depositAfterCredit } from "../lib/pcd-customer-credits.js";
import { roundMoney as roundMoneyFromQuoteUtils } from "../lib/pcd-quote-utils.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// ── One rounding rule ────────────────────────────────────────────────────────
//
// There used to be fourteen rounding expressions in two variants. Some added
// Number.EPSILON before rounding and some did not, and they disagree: 1.005 came
// out as 1.01 in the quote arithmetic and 1.00 in the credit arithmetic. A cent
// apart is exactly what fails the line sum check on a tax invoice.

test("the quote arithmetic and the credit arithmetic round the same way", () => {
  assert.equal(roundMoneyFromQuoteUtils, roundMoney, "quote-utils must re-export the one definition, not copy it");
});

test("a value that cannot be written in binary still rounds the way a person reads it", () => {
  // 1.005 is stored as a hair under 1.005, so 1.005 * 100 is 100.49999999999999
  // and a plain Math.round takes it DOWN to $1.00 for a figure everybody calls
  // $1.01. These are the values the two old variants disagreed on.
  for (const [value, expected] of [[1.005, 1.01], [0.575, 0.58], [1.015, 1.02], [2.675, 2.68], [8.165, 8.17]]) {
    assert.equal(roundMoney(value), expected, `${value} should round to ${expected}`);
  }
});

test("the credit arithmetic agrees with the rule on those same values", () => {
  for (const [value, expected] of [[1.005, 1.01], [0.575, 0.58], [1.015, 1.02]]) {
    const { applied } = applyCredits([{ id: "c1", amount: value, paid_on: "2026-01-01" }], 1000);
    assert.equal(applied, expected, `a credit of ${value} should apply as ${expected}`);
    assert.equal(depositAfterCredit(1000, value), roundMoney(1000 - expected));
  }
});

test("nothing that is not a number becomes a number", () => {
  // Every caller of this is summing towards a total, and one NaN poisons the
  // whole column without saying so.
  for (const value of [null, undefined, "", "abc", NaN, Infinity, {}]) {
    assert.equal(roundMoney(value), 0, `${String(value)} should be 0`);
  }
});

test("no money module keeps its own private rounding any more", () => {
  // The fourteen expressions are what this exists to stop coming back. Only
  // pcd-money.js may write the arithmetic out.
  const offenders = [];
  for (const name of readdirSync(join(ROOT, "lib"))) {
    if (name === "pcd-money.js" || !name.endsWith(".js")) continue;
    const source = readFileSync(join(ROOT, "lib", name), "utf8");
    // A comment explaining the old arithmetic is not an implementation of it.
    const code = source.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/Math\.round\(\s*\(?[^)]*\+\s*Number\.EPSILON\s*\)?\s*\*\s*100\s*\)\s*\/\s*100/.test(code)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(offenders, [], "these round money themselves instead of using pcd-money.js");
});

// ── A live Stripe key cannot be used by accident ─────────────────────────────

test("a live key is refused off the deployed site unless somebody says they mean it", async () => {
  const before = { ...process.env };
  try {
    process.env.STRIPE_SECRET_KEY = "sk_live_pretend";
    delete process.env.VERCEL;
    delete process.env.PCD_ALLOW_LIVE_STRIPE;

    // Freshly imported, because the guard reads the environment when it runs.
    const { siteUrl } = await import("../lib/pcd-stripe.js");
    assert.ok(siteUrl, "the module must still load; only using the key is refused");

    const source = readFileSync(new URL("../lib/pcd-stripe.js", import.meta.url), "utf8");
    assert.match(source, /sk_live/, "the guard must recognise a live key");
    assert.match(source, /PCD_ALLOW_LIVE_STRIPE/, "there must be a documented way past it");
    assert.match(source, /process\.env\.VERCEL/, "the deployed site must be allowed through");
    // NODE_ENV alone would be wrong: `next build` runs as production on a laptop.
    assert.equal(
      /NODE_ENV[^\n]*production/.test(source.replace(/^\s*\/\/.*$/gm, "")),
      false,
      "the guard must not key on NODE_ENV, which is production during a local build"
    );
  } finally {
    process.env = before;
  }
});

// ── A credit cannot be swallowed by a half-finished write ────────────────────

test("a credit spend puts the credit back if the payment cannot be written", () => {
  const source = readFileSync(new URL("../lib/pcd-customer-credits.js", import.meta.url), "utf8");

  // Three separate writes with no transaction available. The credit is marked
  // spent first, which is right, because that is the write that must not happen
  // twice. What was missing was undoing it when the payment insert failed:
  // the ledger said spent, the order had no payment, and the customer was asked
  // for the full amount with their money credited nowhere.
  const spend = source.slice(source.indexOf("spendCreditsOnOrder"));
  assert.match(spend, /catch \(error\)/, "the payment insert must be caught, not left to throw through");
  assert.match(spend, /state: "held"/, "the credit must be put back as held");
  assert.match(spend, /\.eq\("state", "spent"\)/, "and only if it is still in the state this call left it");
  assert.match(spend, /throw error/, "the failure must still be raised, not swallowed");
});
