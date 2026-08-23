// WHAT, EXACTLY, DID THE CUSTOMER AGREE TO?
//
// The approval record was a typed name and a timestamp. That answers "did they
// approve" but not "approve WHAT", and those become different questions the
// moment anybody disagrees.
//
// Three orders in July had their quotes edited after acceptance. Working out
// what had actually been agreed took a database query, a timestamp comparison
// and a judgement call, and the answer was never certain. This is so it never
// needs doing again.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  approvalEvidence,
  approvalSummary,
  canonicalDocument,
  documentFingerprint,
  matchesApproved,
  requestEvidence,
} from "../lib/pcd-approval-evidence.js";

function doc(overrides = {}) {
  return {
    lines: [
      { title: "Door", material: "Decorative Board", thickness: "18mm", colour: "Amaro", height_mm: 720, width_mm: 397, qty: 2, line_total_ex_gst: 200 },
      { title: "Panel", material: "Decorative Board", thickness: "18mm", colour: "Amaro", height_mm: 720, width_mm: 560, qty: 1, line_total_ex_gst: 100 },
    ],
    totals: { subtotal_ex_gst: 300, gst_amount: 30, total_inc_gst: 330 },
    ...overrides,
  };
}

// ── the fingerprint ────────────────────────────────────────────────────────

test("the same document always fingerprints the same", () => {
  assert.equal(documentFingerprint(doc()), documentFingerprint(doc()));
});

test("a changed colour changes the fingerprint", () => {
  const after = doc();
  after.lines[0].colour = "Greige";
  assert.notEqual(documentFingerprint(doc()), documentFingerprint(after), "this is the July fault, made detectable");
});

test("a changed price changes the fingerprint", () => {
  const after = doc({ totals: { subtotal_ex_gst: 400, gst_amount: 40, total_inc_gst: 440 } });
  assert.notEqual(documentFingerprint(doc()), documentFingerprint(after));
});

test("a changed size or quantity changes the fingerprint", () => {
  const resized = doc();
  resized.lines[0].height_mm = 800;
  assert.notEqual(documentFingerprint(doc()), documentFingerprint(resized));

  const requantified = doc();
  requantified.lines[0].qty = 3;
  assert.notEqual(documentFingerprint(doc()), documentFingerprint(requantified));
});

test("an added or removed line changes the fingerprint", () => {
  const fewer = doc();
  fewer.lines.pop();
  assert.notEqual(documentFingerprint(doc()), documentFingerprint(fewer));
});

// The rows come back in whatever order the database felt like. A reordered
// query is the same quote and must not look like a different one, or the
// evidence would cry wolf on every approval.
test("the same lines in a different order fingerprint the same", () => {
  const reordered = doc();
  reordered.lines.reverse();
  assert.equal(documentFingerprint(doc()), documentFingerprint(reordered));
});

// Only what the customer is agreeing to. A status or an internal note moving
// must not read as the specification having changed.
test("things the customer is not agreeing to do not change the fingerprint", () => {
  const noisy = doc();
  noisy.lines[0].status = "Not Ordered";
  noisy.lines[0].notes = "Ring the customer about delivery";
  noisy.lines[0].id = "a-different-row-id";
  assert.equal(documentFingerprint(doc()), documentFingerprint(noisy));
});

test("the canonical form separates the lines from the totals", () => {
  assert.match(canonicalDocument(doc()), /\n==\n/, "so a line that looks like a total cannot be confused for one");
});

// ── the readable half ──────────────────────────────────────────────────────
//
// A digest proves a mismatch. A person still has to be told what mismatched.

test("the summary carries enough to recognise the job", () => {
  const summary = approvalSummary(doc());
  assert.equal(summary.line_count, 2);
  assert.equal(summary.total_inc_gst, 330);
  assert.equal(summary.items[0].item, "Door");
  assert.match(summary.items[0].spec, /Decorative Board/);
  assert.equal(summary.items[0].size, "720 x 397mm", "height before width, as everywhere");
});

// ── where it came from ─────────────────────────────────────────────────────

test("the device record is read from the request, and absence is not invented", () => {
  const headers = new Map([
    ["x-forwarded-for", "203.0.113.7, 10.0.0.1"],
    ["user-agent", "Mozilla/5.0 (iPhone)"],
  ]);
  const evidence = requestEvidence({ headers: { get: (name) => headers.get(name) || "" } });
  assert.equal(evidence.ip, "203.0.113.7", "behind a proxy the client is the first entry");
  assert.match(evidence.user_agent, /iPhone/);
  assert.equal(evidence.referer, null, "a header that is not there is null, not an empty string pretending");
});

test("a request with no headers at all does not throw", () => {
  const evidence = requestEvidence(undefined);
  assert.equal(evidence.ip, null);
  assert.equal(evidence.user_agent, null);
});

// ── the whole record ───────────────────────────────────────────────────────

test("an approval records what was agreed, which code was used, and from where", () => {
  const evidence = approvalEvidence({
    request: { headers: { get: (name) => (name === "user-agent" ? "Mozilla/5.0" : "") } },
    lines: doc().lines,
    totals: doc().totals,
    accessCode: "A1B2C3D4",
  });
  assert.equal(evidence.document_fingerprint, documentFingerprint(doc()));
  assert.equal(evidence.access_code_used, "A1B2C3D4", "after an override this is the dead code, which is the point");
  assert.equal(evidence.document_summary.total_inc_gst, 330);
  assert.ok(evidence.recorded_at, "and when");
});

// ── the question it exists to answer ───────────────────────────────────────

test("a later version can be shown to differ from what was approved", () => {
  const evidence = approvalEvidence({ lines: doc().lines, totals: doc().totals });
  assert.equal(matchesApproved(evidence, doc()), true, "unchanged is unchanged");

  const edited = doc();
  edited.lines[0].colour = "Greige";
  assert.equal(matchesApproved(evidence, edited), false, "the exact July question, answered in one call");
});

// Nothing recorded is not the same as matching, and must never be shown as if
// it were. Every response before this existed falls in here.
test("an approval with no evidence returns unknown, not a match", () => {
  assert.equal(matchesApproved({}, doc()), null);
  assert.equal(matchesApproved(null, doc()), null);
});

// ── the routes record it ───────────────────────────────────────────────────

test("both approval routes record the evidence and survive without the column", () => {
  [
    ["the quote approval", new URL("../app/api/quote-workflow/action/route.js", import.meta.url)],
    ["the variation approval", new URL("../app/api/variation-workflow/action/route.js", import.meta.url)],
  ].forEach(([label, url]) => {
    const source = readFileSync(url, "utf8");
    assert.match(source, /approvalEvidence\(/, `${label} does not record what was agreed`);
    assert.match(
      source,
      /202608221200_pcd_approval_evidence\.sql/,
      `${label} must name the migration when it cannot record it`
    );
    assert.match(
      source,
      /insert\(row\)|insert\(actionRow\)/,
      `${label} must still record the response if the evidence column is missing: a customer's answer cannot fail on a migration`
    );
  });
});

// The fingerprint is of the LINES. Loading the quote without them would digest
// the totals alone, and two quotes with the same total but different work would
// look identical.
test("the quote approval loads the lines it fingerprints", () => {
  const source = readFileSync(new URL("../app/api/quote-workflow/action/route.js", import.meta.url), "utf8");
  assert.match(source, /select\("\*, pcd_quote_line_items\(\*\)"\)/);
});
