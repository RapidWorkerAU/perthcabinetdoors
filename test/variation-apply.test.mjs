// A VARIATION THE CUSTOMER AGREED TO HAS TO REACH THE ORDER.
//
// Approving is two steps: record the answer, then write the variation onto the
// order and move its totals. The second can fail on its own, and when it did
// the whole request answered with an error while the status was already
// "approved". The variation sat there, the order kept its old figures, nothing
// retried it and nothing said so. The balance owing was short by exactly the
// amount the customer had just agreed to.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ACTION = read("app/api/variation-workflow/action/route.js");
const VARIATIONS = read("lib/pcd-order-variations.js");
const APPLY_ROUTE = read("app/api/admin/orders/[id]/variations/[variationId]/apply/route.js");
const ORDER_PAGE = read("app/admin/orders/[id]/OrderDetail.js");

test("a failure to apply does not throw away the customer's answer", () => {
  assert.ok(ACTION.includes("await applyAcceptedVariation(supabase, variation.id"), "it still applies");
  assert.ok(ACTION.includes("catch (applyError)"), "and survives that failing");
  assert.ok(ACTION.includes('return Response.json({ ok: true, applied: false })'),
    "the customer is told their answer is in, because it is");
});

test("a failure is recorded where somebody will see it", () => {
  assert.ok(ACTION.includes("apply_error:"), "on the variation");
  assert.ok(ACTION.includes('action_type: "variation_apply_failed"'), "and in the order's history");
  assert.match(ACTION, /The order still shows the old figures/);
});

test("applying clears the failure it is fixing", () => {
  assert.ok(
    VARIATIONS.includes('.update({ status: "applied", applied_at: now, apply_error: null })'),
    "a variation that just applied is not one that failed to"
  );
});

test("the ones that never landed can be found", () => {
  assert.ok(VARIATIONS.includes("export async function unappliedVariations("), "there is a way to list them");
  assert.ok(VARIATIONS.includes('.eq("status", "approved")'),
    "approved is by definition one of them: applied ones say applied");
});

test("there is a way to finish one by hand", () => {
  assert.ok(APPLY_ROUTE.includes("applyAcceptedVariation("), "it uses the same function, not a second version");
  assert.match(APPLY_ROUTE, /alreadyApplied/, "pressing it twice is safe");
  assert.match(APPLY_ROUTE, /Only a variation the customer has approved/, "and it refuses anything else");
});

test("the order page says when its own totals are wrong", () => {
  assert.match(ORDER_PAGE, /was approved but has not been added to this order/);
  assert.match(ORDER_PAGE, /Add it to the order/, "with the way to fix it right there");
  assert.ok(ORDER_PAGE.includes("variation.apply_error"), "and says why it stopped, when it knows");
});

// ── the email that never went ──────────────────────────────────────────────

test("a refused email is never reported as sent", () => {
  const send = read("lib/pcd-send-email.js");
  assert.match(send, /if \(sent\?\.error\)/, "Resend answers a refusal rather than throwing it");
  assert.match(send, /return \{ ok: false/);

  const variationSend = read("app/api/admin/orders/[id]/variations/[variationId]/send/route.js");
  assert.ok(variationSend.includes("emailSent = sent.ok"), "the variation reports what happened");
  assert.ok(variationSend.includes("emailError"), "and why, when it did not");

  const quoteSend = read("app/api/admin/quotes/[id]/send/route.js");
  assert.ok(quoteSend.includes("emailSent = sent.ok"), "so does the quote");
});
