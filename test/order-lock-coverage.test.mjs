// EVERY WAY OF CHANGING COMMITTED WORK HAS TO ASK WHETHER IT IS ALLOWED.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Found in the Pass 4 audit, 22 September 2026. The quote side of this rule is
// protected properly: test/quote-lock-coverage.test.mjs walks every route under
// app/api, finds everything that writes a quote line, and fails if one of them
// skips the lock. A new route is caught on the day it is written.
//
// The order and variation side had no such walk. test/document-lock.test.mjs
// names three variation routes by hand and checks those three. A fourth route
// writing variation lines or order line specs would have been caught by nothing,
// and the rule that agreed work only changes through a variation was being held
// up by the fact that nobody had happened to write one.
//
// This is the missing half. It is a source walk on purpose, and that is the
// right tool: the question is whether any route was MISSED, which no amount of
// running one route can answer.
//
// ── WHAT AN EXEMPTION MEANS ──────────────────────────────────────────────────
//
// Every exemption below was opened and read during that audit, and each says
// why. They fall into two kinds: routes where the write IS the state change the
// lock is about, and routes that only touch how a job is progressing rather than
// what was agreed.
//
// Adding to this list is a deliberate act with a reason to write down. If you
// are here because a new route failed this test, the question to answer first is
// not "how do I add it to the list" but "can this change what the customer
// agreed to". If it can, it needs the lock, not an exemption.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ORDERS = join(ROOT, "app", "api", "admin", "orders");

/** A write to anything the lock is meant to protect. */
const WRITES = /\.from\("(pcd_order_line_items|pcd_order_variation_lines|pcd_order_variations|pcd_orders)"\)[\s\S]{0,300}?\.(insert|update|delete|upsert)\(/;

/** Any of the ways a route can ask. */
const ASKS = /assertOpenForEditing|assertSendable|editability\(|isOpen\(|lockError\(/;

const EXEMPT = {
  // ── The write IS the state change the lock is about ────────────────────────
  "[id]/archive/route.js":
    "Archiving is itself a change of lock state. Asking the lock for permission to change the lock is circular.",
  "[id]/variations/route.js":
    "Creating a variation. A variation exists BECAUSE the order is locked; refusing to make one on a locked order would remove the only way forward.",
  // Sending a variation is deliberately NOT listed. It uses assertSendable,
  // which is the lock's own rule for that move, so it asks and needs no excuse.
  // It was listed here in the first draft of this file and the staleness check
  // below caught it, which is the check earning its place on day one.
  "[id]/variations/[variationId]/approve-override/route.js":
    "The override is the sanctioned way past the lock, with a reason recorded and a new access code issued. See the override tests in document-lock.",

  // ── Not what was agreed, only how it is going ──────────────────────────────
  "[id]/items/[itemId]/route.js":
    "Production tracking only: status, production stage, supplier reference, ordered and ETA dates, board flags and notes. No size, board, profile or price. A locked order still has to be moved through the workshop.",
  "[id]/route.js":
    "Contact details, the site address, the deposit fields and the order status. None of it changes what is being made or what the lines come to.",
  "[id]/cutting-plan/route.js":
    "Cutting plan settings on the order. It decides how the boards are cut, not what was agreed to be made.",
  "[id]/tax-invoice/send/route.js":
    "Records that an invoice was sent. It writes when, not what.",
};

function routeFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, found);
    else if (entry.name === "route.js" || entry.name === "route.ts") found.push(full);
  }
  return found;
}

const writers = routeFiles(ORDERS)
  .map((file) => ({ file, key: file.slice(ORDERS.length + 1).split(/[\\/]/).join("/"), source: readFileSync(file, "utf8") }))
  .filter((route) => WRITES.test(route.source));

test("the walk finds the routes it is supposed to be checking", () => {
  // Without this, a change to the pattern above could quietly make this whole
  // file pass by finding nothing at all.
  assert.ok(writers.length >= 10, `expected to find the order routes that write, found ${writers.length}`);
});

test("every order route that writes committed work asks the lock", () => {
  const skipped = writers
    .filter((route) => !ASKS.test(route.source))
    .filter((route) => !(route.key in EXEMPT))
    .map((route) => route.key);

  assert.deepEqual(
    skipped,
    [],
    "these write to an order or variation table without asking whether it is allowed. If the route can change " +
      "what the customer agreed to, call assertOpenForEditing. If it genuinely cannot, add it to EXEMPT with the " +
      "reason, the way the others are"
  );
});

test("no exemption is left behind pointing at a route that has gone or changed", () => {
  const stale = Object.keys(EXEMPT).filter((key) => {
    const route = writers.find((candidate) => candidate.key === key);
    // Gone, renamed, or it now asks the lock anyway and does not need excusing.
    return !route || ASKS.test(route.source);
  });

  assert.deepEqual(
    stale,
    [],
    "these exemptions no longer describe a route that skips the lock. An exemption nobody checks is how the list " +
      "stops meaning anything"
  );
});

test("every exemption says why, in words somebody can disagree with", () => {
  for (const [key, reason] of Object.entries(EXEMPT)) {
    assert.ok(reason.length > 40, `${key} needs a real reason, not a note`);
  }
});
