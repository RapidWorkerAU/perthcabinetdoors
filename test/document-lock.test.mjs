// A DOCUMENT WITH A CUSTOMER MUST NOT CHANGE UNDER THEM.
//
// Sending changed nothing about editability. A quote was sealed only once it
// became an order, and a variation's "finalised" list left out sent and viewed
// entirely. So on both sides a customer could approve a version that had been
// edited since they read it, and nothing recorded that it had moved.
//
// The rule now: draft and rejected are open, sent and viewed are sealed, and
// anything the customer has answered is permanent. Sealed is not a dead end,
// because a customer who never got the email can neither approve nor reject:
// an admin can pull it back, and doing so kills the link they were sent.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertOpenForEditing,
  editability,
  isOpen,
  lockError,
  assertSendable,
  overrideWarning,
  pullBackToDraftPatch,
} from "../lib/pcd-document-lock.js";

// ── the states ─────────────────────────────────────────────────────────────

test("draft and rejected are open on both kinds", () => {
  ["quote", "variation"].forEach((kind) => {
    assert.equal(editability(kind, "draft"), "open");
    assert.equal(editability(kind, "rejected"), "open", "the customer said no, so there is nothing of theirs to protect");
    assert.equal(isOpen(kind, "draft"), true);
  });
});

test("sent and viewed are sealed on both kinds", () => {
  ["quote", "variation"].forEach((kind) => {
    assert.equal(editability(kind, "sent"), "sealed");
    assert.equal(editability(kind, "viewed"), "sealed", "opening it does not make it editable again");
  });
});

test("what the customer has answered is permanent", () => {
  assert.equal(editability("quote", "approved"), "permanent");
  assert.equal(editability("variation", "approved"), "permanent");
  assert.equal(editability("variation", "approved_pending_payment"), "permanent");
  assert.equal(editability("variation", "applied"), "permanent", "the order has already been rewritten");
});

// A status nobody anticipated must not be a way past the rule. Defaulting to
// open would mean any future status silently reopened the door.
test("an unrecognised status is sealed, never open", () => {
  assert.equal(editability("quote", "awaiting_something_new"), "sealed");
  assert.equal(editability("variation", ""), "open", "blank means a fresh draft");
  assert.equal(editability("quote", "SENT"), "sealed", "case must not matter");
});

// ── the refusal ────────────────────────────────────────────────────────────

test("a sealed document offers the override, a permanent one does not", () => {
  const sealed = lockError("quote", "sent");
  assert.equal(sealed.status, 409, "a rule, not a crash");
  assert.equal(sealed.canOverride, true);
  assert.match(sealed.message, /admin override/i);
  assert.match(sealed.message, /cancels the link/i, "it has to say what the override costs");

  const permanent = lockError("variation", "applied");
  assert.equal(permanent.canOverride, false, "offering an override here would mean un-making agreed work");
  assert.match(permanent.message, /another variation/i, "and it has to say what to do instead");
});

test("an open document produces no error at all", () => {
  assert.equal(lockError("quote", "draft"), null);
  assert.doesNotThrow(() => assertOpenForEditing("variation", "draft"));
  assert.throws(() => assertOpenForEditing("variation", "sent"));
});

test("an unknown kind is a programming error, not a silent pass", () => {
  assert.throws(() => editability("invoice", "draft"), /Unknown document kind/);
});

// ── the override ───────────────────────────────────────────────────────────
//
// The whole safety of this is the new access code. Without it the customer keeps
// a working link to a document being edited, which is the exact fault.

test("pulling back to draft issues a new code and clears the sent state", () => {
  const patch = pullBackToDraftPatch("quote", "NEWCODE1");
  assert.equal(patch.status, "draft");
  assert.equal(patch.access_code, "NEWCODE1", "the old link has to stop resolving");
  assert.equal(patch.sent_at, null, "it is no longer awaiting a response");
  assert.equal(patch.viewed_at, null);
  assert.equal(patch.rejected_at, null);
});

test("an override with no new code is refused outright", () => {
  assert.throws(
    () => pullBackToDraftPatch("quote", ""),
    /new access code/i,
    "without this the customer keeps a live link to a document being edited"
  );
  assert.throws(() => pullBackToDraftPatch("variation", null));
});

// ── the warning ────────────────────────────────────────────────────────────

test("the modal spells out every consequence before anybody presses it", () => {
  const warning = overrideWarning("quote", { documentNumber: "PCD-Q-2026-0ED040", sentAt: "2026-08-20T04:00:00Z" });
  const all = warning.consequences.join(" ");
  assert.match(all, /stop working/i, "the customer's link dies");
  assert.match(all, /draft/i, "it goes back to draft");
  assert.match(all, /send it again/i, "and has to be re-sent");
  assert.match(all, /recorded/i, "and it is on the record");
  assert.match(warning.lede, /PCD-Q-2026-0ED040/, "it has to name the document");
  assert.equal(warning.reasonRequired, true, "an override with no reason recorded is the silent edit this stops");
});

test("the warning still works with nothing but a kind", () => {
  const warning = overrideWarning("variation");
  assert.ok(warning.lede.includes("variation"));
  assert.ok(warning.consequences.length >= 3);
});

// ── the routes actually use it ─────────────────────────────────────────────

const VARIATION_LINES = readFileSync(
  new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/route.js", import.meta.url),
  "utf8"
);
const VARIATION_LINE = readFileSync(
  new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js", import.meta.url),
  "utf8"
);
const VARIATION = readFileSync(
  new URL("../app/api/admin/orders/[id]/variations/[variationId]/route.js", import.meta.url),
  "utf8"
);

test("every variation edit route asks the shared rule", () => {
  [
    ["adding a line", VARIATION_LINES],
    ["editing a line", VARIATION_LINE],
    ["editing the variation", VARIATION],
  ].forEach(([label, source]) => {
    assert.match(
      source,
      /assertOpenForEditing|lockError/,
      `${label} does not check whether the variation is sitting with a customer`
    );
    assert.doesNotMatch(
      source,
      /isVariationFinal\(/,
      `${label} still uses the old rule, which treated a sent variation as editable`
    );
  });
});

test("both override routes demand a reason and issue a new code", () => {
  [
    ["the quote override", new URL("../app/api/admin/quotes/[id]/override/route.js", import.meta.url)],
    [
      "the variation override",
      new URL("../app/api/admin/orders/[id]/variations/[variationId]/override/route.js", import.meta.url),
    ],
  ].forEach(([label, url]) => {
    const source = readFileSync(url, "utf8");
    assert.match(source, /if \(!reason\)/, `${label} must refuse without a reason`);
    assert.match(source, /pullBackToDraftPatch/, `${label} must kill the customer's link`);
    assert.match(source, /makeAccessCode\(\)/, `${label} must issue a new code`);
    assert.match(source, /logOrderActivity/, `${label} must leave a record`);
    assert.match(source, /actor_email/, `${label} must record who did it`);
    assert.match(source, /state === "permanent"/, `${label} must refuse once the customer has answered`);
  });
});

// ── sending, which is a separate question to editing ───────────────────────
//
// Both send routes wrote status "sent" unconditionally. So re-sending an
// approved quote reverted it to awaiting a response, stranding the approval in
// the history against a quote that no longer read as approved. On a variation it
// was worse: an applied variation had already rewritten the order, and sending
// it again put it back in front of the customer as though it were still pending.

test("re-sending a draft, sent or viewed document is ordinary", () => {
  ["draft", "sent", "viewed", "rejected"].forEach((status) => {
    assert.doesNotThrow(() => assertSendable("quote", status), `a ${status} quote must be sendable`);
    assert.doesNotThrow(() => assertSendable("variation", status));
  });
});

test("a document the customer has answered cannot be sent again", () => {
  assert.throws(
    () => assertSendable("quote", "approved"),
    (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /already been responded to/i);
      assert.match(error.message, /raise a variation/i, "and it has to say what to do instead");
      return true;
    }
  );
  assert.throws(() => assertSendable("variation", "applied"), /already been responded to/i);
  assert.throws(() => assertSendable("variation", "approved_pending_payment"));
});

test("both send routes ask before writing a sent status", () => {
  [
    ["the quote send", new URL("../app/api/admin/quotes/[id]/send/route.js", import.meta.url)],
    [
      "the variation send",
      new URL("../app/api/admin/orders/[id]/variations/[variationId]/send/route.js", import.meta.url),
    ],
  ].forEach(([label, url]) => {
    const source = readFileSync(url, "utf8");
    assert.match(source, /assertSendable\(/, `${label} can still reopen a document the customer has answered`);
    assert.match(
      source,
      /status:\s*error\?\.status\s*\|\|\s*500/,
      `${label} must return the refusal as a 409, not as an unexplained failure`
    );
  });
});

// The override cannot reach into the customer's inbox. The link dies, the
// attachment does not, so the person pressing it has to be told to ring them.
test("the override warning admits it cannot recall the old PDF", () => {
  const warning = overrideWarning("quote", { documentNumber: "PCD-Q-1" });
  assert.match(warning.consequences.join(" "), /still have the PDF/i);
});
