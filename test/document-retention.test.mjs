// KEEP WHAT WE SENT, SHOW ONLY WHAT IS CURRENT.
//
// Re-sending a quote deleted the previously generated PDF and its file, so
// exactly one ever existed: the latest. There was no way to show what the
// customer had originally been given.
//
// The deletion was there for a good reason. Several PDFs in the customer's
// attachment list with no way to tell which is live is how somebody works from
// old figures. So a superseded copy is now MARKED rather than removed: kept as
// our record, hidden from theirs.
//
// This matters more since the admin override, which makes pulling a sent quote
// back a normal action. Every override used to destroy the record of what had
// already gone out.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ATTACHMENT = readFileSync(new URL("../lib/pcd-quote-pdf-attachment.js", import.meta.url), "utf8");
const CUSTOMER_VIEW = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
const MIGRATION = readFileSync(
  new URL("../supabase/202608221000_pcd_quote_attachment_superseded.sql", import.meta.url),
  "utf8"
);

test("a replaced PDF is marked, not deleted", () => {
  assert.match(ATTACHMENT, /supersedePreviousQuotePdf/, "the previous copy has to be kept");
  assert.match(ATTACHMENT, /superseded_at/, "and marked so the customer's list can hide it");
});

// The delete still exists, but only on the path taken when the column is not
// there yet. A customer's quote must not fail to send over a migration.
test("the old deleting behaviour survives only as a fallback, and says so", () => {
  assert.match(ATTACHMENT, /removePreviousQuotePdfLegacy/, "kept for a database without the column");
  assert.match(
    ATTACHMENT,
    /202608221000_pcd_quote_attachment_superseded\.sql/,
    "and it has to name the migration that stops it happening"
  );
  const legacyAt = ATTACHMENT.indexOf("async function removePreviousQuotePdfLegacy");
  const supersedeAt = ATTACHMENT.indexOf("async function supersedePreviousQuotePdf");
  assert.ok(supersedeAt >= 0 && legacyAt > supersedeAt, "superseding is the main path, not the fallback");
});

// Storage removal is the irreversible half. It must appear only in the legacy
// path, because a file that has been deleted cannot be produced later.
test("the file itself is only ever removed on the legacy path", () => {
  const legacy = ATTACHMENT.slice(ATTACHMENT.indexOf("async function removePreviousQuotePdfLegacy"));
  const main = ATTACHMENT.slice(
    ATTACHMENT.indexOf("async function supersedePreviousQuotePdf"),
    ATTACHMENT.indexOf("async function removePreviousQuotePdfLegacy")
  );
  assert.match(legacy, /storage[\s\S]{0,60}\.remove\(/, "the legacy path is the one that deletes");
  assert.doesNotMatch(main, /\.remove\(/, "the current path must never delete a file we sent a customer");
});

test("the customer only ever sees the current PDF", () => {
  assert.match(
    CUSTOMER_VIEW,
    /filter\(\(attachment\) => !attachment\.superseded_at\)/,
    "two PDFs with no way to tell which is live is how somebody works from old figures"
  );
});

test("the migration keeps the file and explains why nothing is backfilled", () => {
  assert.match(MIGRATION, /add column if not exists superseded_at/i);
  assert.match(MIGRATION, /superseded_by/i, "the chain of what was sent has to be walkable in order");
  assert.doesNotMatch(MIGRATION, /delete\s+from/i, "a migration about keeping records must not delete any");
  assert.match(MIGRATION, /Nothing to backfill/i, "and it has to say why the history starts here");
});
