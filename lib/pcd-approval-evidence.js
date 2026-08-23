// WHAT, EXACTLY, DID THE CUSTOMER AGREE TO?
//
// The approval record was a typed name and a timestamp. That answers "did they
// approve" but not "approve WHAT", and those are different questions the moment
// anybody disagrees about it later.
//
// Three orders in July had their quotes edited after acceptance, and answering
// what the customer had actually agreed to took a database query, a timestamp
// comparison and a judgement call. This is so that never needs doing again.
//
// ── WHAT IS RECORDED ─────────────────────────────────────────────────────────
//
//   fingerprint   a short digest of the lines and totals as they stood at the
//                 moment of approval. Two documents produce the same digest only
//                 if they say the same thing, so a later version can be compared
//                 against what was agreed and shown to differ.
//
//   summary       the same facts in words, because a digest proves a mismatch
//                 and a person still has to be told what mismatched.
//
//   device        the browser and the address the response came from. Not proof
//                 of identity, and not treated as such, but it separates "the
//                 customer approved from their phone" from "somebody approved
//                 from our own office".
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
//
// It is not a signature and it does not pretend to be. It is a record that the
// thing approved was this thing, which is the part that was missing.

import { createHash } from "node:crypto";

function text(value) {
  return String(value ?? "").trim();
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

// Height before width, as everywhere else.
const LINE_FIELDS = [
  "product_type",
  "title",
  "product_name",
  "description",
  "material",
  "supplier_name",
  "thickness",
  "finish",
  "colour",
  "profile_type",
  "profile",
  "edge_mould",
  "height_mm",
  "width_mm",
  "qty",
];

/**
 * The canonical form of what a document says, as a string.
 *
 * Deliberately built from the SPECIFICATION and the money, and nothing else. A
 * status, a note, or the order the rows came back in must not change the digest,
 * or a document would appear to have changed when nothing a customer cares about
 * had. Lines are sorted so a reordered query is not a different quote.
 */
export function canonicalDocument({ lines = [], totals = {} } = {}) {
  const rows = (lines || [])
    .map((line) =>
      [
        ...LINE_FIELDS.map((field) => text(line[field])),
        money(line.unit_price_ex_gst),
        money(line.line_total_ex_gst ?? line.proposed_line_total_ex_gst),
      ].join("|")
    )
    .sort();

  const sums = [
    money(totals.subtotal_ex_gst),
    money(totals.gst_amount),
    money(totals.total_inc_gst),
  ].join("|");

  return `${rows.join("\n")}\n==\n${sums}`;
}

/**
 * A short digest of that. Twelve hex characters is plenty to tell two versions
 * of one quote apart, and short enough to read out over the phone.
 */
export function documentFingerprint(document) {
  return createHash("sha256").update(canonicalDocument(document)).digest("hex").slice(0, 12);
}

/**
 * The human-readable half. A digest proves a mismatch; this says what it was.
 */
export function approvalSummary({ lines = [], totals = {} } = {}) {
  const counted = (lines || []).length;
  return {
    line_count: counted,
    subtotal_ex_gst: money(totals.subtotal_ex_gst),
    gst_amount: money(totals.gst_amount),
    total_inc_gst: money(totals.total_inc_gst),
    // Enough to recognise the job without storing a second copy of every line.
    items: (lines || []).slice(0, 40).map((line) => ({
      item: text(line.title || line.product_name || line.product_type),
      spec: [text(line.material), text(line.thickness), text(line.colour), text(line.finish)].filter(Boolean).join(" - "),
      size: [line.height_mm, line.width_mm].every((value) => value)
        ? `${line.height_mm} x ${line.width_mm}mm`
        : "",
      qty: Number(line.qty || 1),
      total: money(line.line_total_ex_gst ?? line.proposed_line_total_ex_gst),
    })),
  };
}

/**
 * What we can tell about where the response came from.
 *
 * Read from headers, so all of it is supplied by the caller and none of it is
 * proof of anything on its own. Recorded because "approved from a phone in
 * Perth" and "approved from our own office" are worth being able to tell apart,
 * and because absence is itself informative.
 */
export function requestEvidence(request) {
  const headers = request?.headers;
  const get = (name) => (headers?.get ? text(headers.get(name)) : "");
  // Behind a proxy the client address is the first entry in the forwarded list.
  const forwarded = get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : get("x-real-ip") || null,
    user_agent: get("user-agent") || null,
    // Which of our own pages it came from, so a response posted from somewhere
    // that is not the approval page is visible as such.
    referer: get("referer") || null,
  };
}

/**
 * Everything to store against one approval or rejection.
 *
 * Returned as a single object so the two workflow routes cannot drift into
 * recording different things about the same kind of event.
 */
export function approvalEvidence({ request, lines, totals, accessCode = null } = {}) {
  const document = { lines, totals };
  return {
    document_fingerprint: documentFingerprint(document),
    document_summary: approvalSummary(document),
    // The code the customer actually used. After an override this is the dead
    // one, which is exactly the case worth being able to see.
    access_code_used: accessCode || null,
    ...requestEvidence(request),
    recorded_at: new Date().toISOString(),
  };
}

/**
 * Does the document still say what it said when it was approved?
 *
 * Returns null when there is nothing recorded to compare against, which is not
 * the same as matching and must not be shown as if it were.
 */
export function matchesApproved(evidence, currentDocument) {
  const recorded = evidence?.document_fingerprint;
  if (!recorded) return null;
  return recorded === documentFingerprint(currentDocument);
}
