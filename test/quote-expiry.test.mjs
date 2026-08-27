// THE 30 DAY QUOTE CLOCK.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   THE CLOCK AND THE REPORT AGREE. The job that archives a quote and the report
//   that calls it a lost lead count the same days. If they ever drift, a quote
//   gets archived while the report still shows it live, or reported lost while
//   its link still works.
//
//   DAY 30 IS STILL A DAY. The terms say valid FOR thirty days.
//
//   IT NEVER TOUCHES AN ANSWERED QUOTE. Approved, awaiting a deposit, rejected,
//   a draft, one already archived and one that became an order are all invisible
//   to it. awaiting_deposit matters most: those people said yes and the deposit
//   sweep is already writing to them.
//
//   ONE EMAIL, EVER, PER SEND. Stamped the moment it goes, so a pass that dies
//   halfway resumes rather than repeating. Cleared on a re-send, so a re-sent
//   quote is warned about the version the customer is actually holding.
//
//   AN EXPIRED QUOTE STILL COUNTS AS A LOST LEAD. Archiving it must not hide it
//   from lead conversion, or the rate that report exists to correct climbs
//   straight back to 100%.
//
//   THE EMAIL IS NOT A CHASE. It has to say, in as many words, that doing
//   nothing is a complete answer.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ageInDays,
  daysUntilExpiry,
  expiresAt,
  expiryState,
  FALLBACK_VALID_DAYS,
  WARN_DAYS_BEFORE_EXPIRY,
} from "../lib/pcd-quote-clock.js";
import { claimJobRun, runQuoteExpirySweep, gatherExpiryDigest } from "../lib/pcd-quote-expiry.js";
import { leadConversion, outcomeOf } from "../lib/pcd-lead-conversion.js";
import { customerQuoteExpiryHtml, salesQuoteExpiryDigestHtml } from "../lib/pcd-email-templates.js";
import { quoteArchivePatch, quoteRestorePatch, ARCHIVED_EXPIRED, ARCHIVED_MANUAL } from "../lib/pcd-archive.js";

const NOW = new Date("2026-08-26T02:00:00Z");
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const VALID = 30;

// ── the clock ────────────────────────────────────────────────────────────────

test("the reminder falls on day 23 of a 30 day quote", () => {
  assert.equal(FALLBACK_VALID_DAYS - WARN_DAYS_BEFORE_EXPIRY, 23);
  const opts = { validDays: VALID, now: NOW };
  assert.equal(expiryState({ status: "sent", sent_at: daysAgo(22) }, opts), "waiting");
  assert.equal(expiryState({ status: "sent", sent_at: daysAgo(23) }, opts), "warn");
});

test("day 30 is still a day, and day 31 is over", () => {
  const opts = { validDays: VALID, now: NOW };
  // The terms say valid FOR thirty days, so the thirtieth is one of them.
  assert.equal(expiryState({ status: "viewed", sent_at: daysAgo(30) }, opts), "warn");
  assert.equal(expiryState({ status: "viewed", sent_at: daysAgo(31) }, opts), "expire");
});

test("a quote already told is not told again", () => {
  const quote = { status: "sent", sent_at: daysAgo(25), expiry_warned_at: daysAgo(2) };
  assert.equal(expiryState(quote, { validDays: VALID, now: NOW }), "warned");
});

test("it never touches a quote the customer has answered", () => {
  const opts = { validDays: VALID, now: NOW };
  for (const status of ["approved", "rejected", "draft", "archived"]) {
    assert.equal(
      expiryState({ status, sent_at: daysAgo(60) }, opts),
      "out_of_scope",
      `${status} must be left alone`
    );
  }
  // The one that would do real damage. They said yes and are part way through
  // paying; the deposit sweep is already chasing them.
  assert.equal(expiryState({ status: "awaiting_deposit", sent_at: daysAgo(60) }, opts), "out_of_scope");
});

test("a quote that became an order is not ours to put away", () => {
  const quote = { status: "sent", sent_at: daysAgo(60), order_id: "order-1" };
  assert.equal(expiryState(quote, { validDays: VALID, now: NOW }), "out_of_scope");
});

test("a quote with no sent date has no clock", () => {
  assert.equal(expiryState({ status: "sent", sent_at: null }, { validDays: VALID, now: NOW }), "out_of_scope");
  assert.equal(ageInDays(null, NOW), null);
  assert.equal(daysUntilExpiry(null, VALID, NOW), null);
});

test("the expiry date is the sent date plus its validity", () => {
  const sent = "2026-08-05T02:00:00.000Z";
  assert.equal(expiresAt(sent, 30).toISOString(), "2026-09-04T02:00:00.000Z");
  // And what the customer is told is counted, not assumed to be seven.
  assert.equal(daysUntilExpiry(daysAgo(23), VALID, NOW), 7);
  assert.equal(daysUntilExpiry(daysAgo(27), VALID, NOW), 3);
});

test("changing the validity moves the whole clock with it", () => {
  // The reminder is always seven days out, whatever the setting says.
  const opts = { validDays: 14, now: NOW };
  assert.equal(expiryState({ status: "sent", sent_at: daysAgo(6) }, opts), "waiting");
  assert.equal(expiryState({ status: "sent", sent_at: daysAgo(7) }, opts), "warn");
  assert.equal(expiryState({ status: "sent", sent_at: daysAgo(15) }, opts), "expire");
});

// ── the clock and the report count the same days ─────────────────────────────

test("the sweep and lead conversion never disagree about a day", () => {
  for (let age = 0; age <= 60; age += 1) {
    const quote = { status: "sent", sent_at: daysAgo(age) };
    const expired = expiryState(quote, { validDays: VALID, now: NOW }) === "expire";
    const lapsed = outcomeOf(quote, { validDays: VALID, now: NOW }) === "lapsed";
    assert.equal(expired, lapsed, `day ${age}: the job says expired=${expired}, the report says lapsed=${lapsed}`);
  }
});

// ── archiving keeps the lead ────────────────────────────────────────────────

test("a quote archived because it expired is still a lost lead", () => {
  const quote = { status: "archived", archived_reason: ARCHIVED_EXPIRED, sent_at: daysAgo(40) };
  assert.equal(outcomeOf(quote, { validDays: VALID, now: NOW }), "lapsed");
});

test("a quote somebody filed away by hand is still out of the numbers", () => {
  const quote = { status: "archived", archived_reason: ARCHIVED_MANUAL, sent_at: daysAgo(40) };
  assert.equal(outcomeOf(quote, { validDays: VALID, now: NOW }), "filed");
  // And an archived row with no reason at all, from before any of this existed.
  assert.equal(outcomeOf({ status: "archived", sent_at: daysAgo(40) }, { validDays: VALID, now: NOW }), "filed");
});

test("archiving the whole book does not walk the conversion rate back to 100%", () => {
  // Two won, one declined, two the customer went quiet on. 40% either way.
  const live = [
    { id: "1", status: "approved", sent_at: daysAgo(50), total_inc_gst: 1000 },
    { id: "2", status: "approved", sent_at: daysAgo(45), total_inc_gst: 1000 },
    { id: "3", status: "rejected", sent_at: daysAgo(40), total_inc_gst: 1000 },
    { id: "4", status: "sent", sent_at: daysAgo(40), total_inc_gst: 1000 },
    { id: "5", status: "viewed", sent_at: daysAgo(35), total_inc_gst: 1000 },
  ];
  const before = leadConversion({ quotes: live }, { now: NOW, validDays: VALID });

  // The same book after the sweep has been round: the two silent ones closed.
  const after = leadConversion(
    {
      quotes: live.map((quote) =>
        ["4", "5"].includes(quote.id)
          ? { ...quote, status: "archived", archived_reason: ARCHIVED_EXPIRED }
          : quote
      ),
    },
    { now: NOW, validDays: VALID }
  );

  assert.equal(before.decided.rateByCount, 40);
  assert.equal(after.decided.rateByCount, 40, "archiving a lapsed quote must not flatter the rate");
  assert.equal(after.buckets.lapsed.count, 2);
  assert.equal(after.expiry.archivedOnExpiry, 2);
  assert.equal(after.expiry.archivedOnExpiryValue, 2000);
});

test("the report surfaces the ones still worth a phone call", () => {
  const report = leadConversion(
    {
      quotes: [
        { id: "a", status: "sent", sent_at: daysAgo(29), total_inc_gst: 500 },
        { id: "b", status: "viewed", sent_at: daysAgo(24), total_inc_gst: 900 },
        { id: "c", status: "sent", sent_at: daysAgo(3), total_inc_gst: 700, expiry_warned_at: null },
        { id: "d", status: "approved", sent_at: daysAgo(25), total_inc_gst: 400, expiry_warned_at: daysAgo(2) },
      ],
    },
    { now: NOW, validDays: VALID }
  );

  // Closest to closing first, so the most urgent is the top line.
  assert.deepEqual(report.expiringSoon.map((quote) => quote.id), ["a", "b"]);
  assert.equal(report.expiringSoon[0].daysLeft, 1);
  assert.equal(report.expiringSoon[1].daysLeft, 6);
  // The one still weeks out is not in the list, and an approved quote never is.
  assert.equal(report.expiringSoon.some((quote) => quote.id === "c" || quote.id === "d"), false);

  assert.equal(report.expiry.warned, 1);
  assert.equal(report.expiry.warnedConverted, 1);
});

// ── the archive patch ───────────────────────────────────────────────────────

test("archiving records why, and restoring forgets it", () => {
  const quote = { status: "viewed" };
  const archived = quoteArchivePatch(quote, ARCHIVED_EXPIRED, "2026-08-26T02:00:00.000Z");
  assert.equal(archived.status, "archived");
  assert.equal(archived.archived_reason, ARCHIVED_EXPIRED);
  // Restoring puts it back exactly, which is the whole point of archiving.
  assert.equal(archived.archived_from_status, "viewed");

  const restored = quoteRestorePatch({ ...quote, ...archived }, "draft");
  assert.equal(restored.status, "viewed");
  assert.equal(restored.archived_reason, null, "a live quote must not still read as expired");
});

// ── the sweep ───────────────────────────────────────────────────────────────

function fakeSupabase(tables) {
  const state = { tables, errors: [] };

  const matches = (row, filters) =>
    filters.every(([kind, column, value]) => {
      const held = row[column];
      if (kind === "eq") return held === value;
      if (kind === "neq") return held !== value;
      if (kind === "in") return value.includes(held);
      if (kind === "notNull") return held !== null && held !== undefined;
      if (kind === "gte") return String(held ?? "") >= String(value);
      return true;
    });

  function run(query) {
    const rows = state.tables[query.table] || (state.tables[query.table] = []);

    if (query.op === "insert") {
      const incoming = Array.isArray(query.payload) ? query.payload : [query.payload];
      for (const row of incoming) {
        // The two uniqueness rules that matter here: one activity row per event,
        // and one stamp per job.
        const clash =
          (row.event_key && rows.some((held) => held.event_key && held.event_key === row.event_key)) ||
          (query.table === "pcd_job_stamps" && rows.some((held) => held.job === row.job));
        if (clash) return { data: null, error: { message: "duplicate key" } };
        rows.push({ ...row });
      }
      return { data: query.single ? incoming[0] : incoming, error: null };
    }

    const found = rows.filter((row) => matches(row, query.filters));

    if (query.op === "update") {
      found.forEach((row) => Object.assign(row, query.payload));
      return { data: found, error: null };
    }

    if (query.single) return { data: found[0] || null, error: null };
    return { data: query.limit ? found.slice(0, query.limit) : found, error: null };
  }

  function makeQuery(table) {
    const query = { table, op: "select", filters: [], payload: null, limit: null, single: false };
    const api = {
      select() {
        if (query.op === "select") query.op = "select";
        return api;
      },
      insert(payload) {
        query.op = "insert";
        query.payload = payload;
        return api;
      },
      update(payload) {
        query.op = "update";
        query.payload = payload;
        return api;
      },
      eq(column, value) {
        query.filters.push(["eq", column, value]);
        return api;
      },
      neq(column, value) {
        query.filters.push(["neq", column, value]);
        return api;
      },
      in(column, values) {
        query.filters.push(["in", column, values]);
        return api;
      },
      not(column) {
        query.filters.push(["notNull", column, null]);
        return api;
      },
      gte(column, value) {
        query.filters.push(["gte", column, value]);
        return api;
      },
      order() {
        return api;
      },
      limit(count) {
        query.limit = count;
        return api;
      },
      maybeSingle() {
        query.single = true;
        return api;
      },
      single() {
        query.single = true;
        return api;
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => run(query))
          .then(resolve, reject);
      },
    };
    return api;
  }

  return { state, from: (table) => makeQuery(table) };
}

/**
 * Run the sweep with no mail provider configured, which is a real state and the
 * one that keeps the network out of these tests. Console noise is swallowed:
 * the whole point of the send functions is that a refused email is reported and
 * never allowed to fail anything.
 */
async function sweep(tables, options = {}) {
  const supabase = fakeSupabase(tables);
  const key = process.env.RESEND_API_KEY;
  const complaints = [];
  const realError = console.error;
  delete process.env.RESEND_API_KEY;
  console.error = (...args) => complaints.push(args.join(" "));
  try {
    const summary = await runQuoteExpirySweep(supabase, { now: NOW, validDays: VALID, ...options });
    return { summary, tables: supabase.state.tables, complaints };
  } finally {
    console.error = realError;
    if (key !== undefined) process.env.RESEND_API_KEY = key;
  }
}

const quoteRow = (over = {}) => ({
  id: "q1",
  quote_number: "PCD-Q-1043",
  customer_id: "c1",
  customer_name: "Sarah",
  customer_email: "sarah@example.com",
  access_code: "K4M2XQ7B",
  status: "sent",
  sent_at: daysAgo(23),
  total_inc_gst: 8437.5,
  currency: "AUD",
  expiry_warned_at: null,
  archived_reason: null,
  order_id: null,
  sent_with_price: true,
  ...over,
});

test("the reminder is stamped even when the mail provider refuses it", async () => {
  // Otherwise a provider outage becomes a loop that empties into somebody's
  // inbox the moment it recovers.
  const { summary, tables } = await sweep({ pcd_quotes: [quoteRow()], pcd_order_activity: [] });
  assert.equal(summary.warned, 1);
  assert.ok(tables.pcd_quotes[0].expiry_warned_at, "the stamp has to be written either way");
  assert.equal(tables.pcd_quotes[0].status, "sent", "warning is not archiving");
});

test("the reminder writes a note on the customer file", async () => {
  const { tables } = await sweep({ pcd_quotes: [quoteRow()], pcd_order_activity: [] });
  const note = tables.pcd_order_activity.find((row) => row.action_type === "quote_expiry_warned");
  assert.ok(note, "there has to be something on the file saying this happened");
  assert.equal(note.customer_id, "c1");
  assert.equal(note.quote_id, "q1");
  assert.match(note.description, /expires on/);
});

test("a second pass on the same day does nothing twice", async () => {
  const tables = { pcd_quotes: [quoteRow()], pcd_order_activity: [] };
  await sweep(tables);
  const again = await sweep(tables);
  assert.equal(again.summary.warned, 0, "the stamp is what stops the second email");
});

test("a quote past its validity is archived, with the reason recorded", async () => {
  const { summary, tables } = await sweep({
    pcd_quotes: [quoteRow({ sent_at: daysAgo(31), expiry_warned_at: daysAgo(8) })],
    pcd_order_activity: [],
  });

  assert.equal(summary.archived, 1);
  assert.equal(summary.warned, 0, "an expired quote is not also warned");
  const quote = tables.pcd_quotes[0];
  assert.equal(quote.status, "archived");
  assert.equal(quote.archived_reason, ARCHIVED_EXPIRED);
  assert.equal(quote.archived_from_status, "sent", "so restoring puts it back exactly");

  const note = tables.pcd_order_activity.find((row) => row.action_type === "quote_archived_expired");
  assert.ok(note);
  assert.match(note.description, /reminded seven days before/);
});

test("a backlog is archived without pretending anybody was warned", async () => {
  // A quote that crossed both thresholds while this job was not running. Telling
  // them it expires in seven days when it expired a month ago would be worse
  // than saying nothing.
  const { summary, tables } = await sweep({
    pcd_quotes: [quoteRow({ sent_at: daysAgo(90) })],
    pcd_order_activity: [],
  });

  assert.equal(summary.archived, 1);
  assert.equal(summary.warned, 0);
  assert.equal(summary.archivedUnwarned, 1, "which is how the log says this job has been missing passes");
  assert.equal(tables.pcd_quotes[0].expiry_warned_at, null);
  const note = tables.pcd_order_activity.find((row) => row.action_type === "quote_archived_expired");
  assert.match(note.description, /not warned/);
});

test("an answered quote is left completely alone", async () => {
  const tables = {
    pcd_quotes: [
      quoteRow({ id: "a", status: "approved", sent_at: daysAgo(90) }),
      quoteRow({ id: "b", status: "awaiting_deposit", sent_at: daysAgo(90) }),
      quoteRow({ id: "c", status: "rejected", sent_at: daysAgo(90) }),
      quoteRow({ id: "d", status: "draft", sent_at: null }),
      quoteRow({ id: "e", status: "archived", sent_at: daysAgo(90) }),
    ],
    pcd_order_activity: [],
  };
  const { summary } = await sweep(tables);
  assert.equal(summary.warned, 0);
  assert.equal(summary.archived, 0);
  assert.deepEqual(
    tables.pcd_quotes.map((quote) => quote.status),
    ["approved", "awaiting_deposit", "rejected", "draft", "archived"]
  );
});

test("a quote that became an order is never archived by this job", async () => {
  const tables = {
    pcd_quotes: [quoteRow({ sent_at: daysAgo(90), order_id: "order-1" })],
    pcd_order_activity: [],
  };
  const { summary } = await sweep(tables);
  assert.equal(summary.archived, 0);
  assert.equal(tables.pcd_quotes[0].status, "sent");
});

test("one bad quote does not stop the rest of the pass", async () => {
  const tables = {
    pcd_quotes: [quoteRow({ id: "a", customer_email: null }), quoteRow({ id: "b" })],
    pcd_order_activity: [],
  };
  const { summary, tables: after } = await sweep(tables);
  // A quote with nowhere to send to is still stamped and still counted, because
  // it is not going to grow an email address on the next pass.
  assert.equal(summary.warned, 2);
  assert.ok(after.pcd_quotes.every((quote) => quote.expiry_warned_at));
});

// ── the weekly digest ───────────────────────────────────────────────────────

test("two schedulers calling at once send one digest, not two", async () => {
  const supabase = fakeSupabase({ pcd_job_stamps: [] });
  const first = await claimJobRun(supabase, "quote-expiry-digest", 6 * DAY, NOW);
  const second = await claimJobRun(supabase, "quote-expiry-digest", 6 * DAY, NOW);
  assert.equal(first, true);
  assert.equal(second, false, "the second caller has to be told no");

  // And a week later it is due again.
  const nextWeek = new Date(NOW.getTime() + 7 * DAY);
  assert.equal(await claimJobRun(supabase, "quote-expiry-digest", 6 * DAY, nextWeek), true);
});

test("a missing stamps table refuses rather than sending every pass", async () => {
  const broken = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "no table" } }) }) }),
    }),
  };
  const realError = console.error;
  console.error = () => {};
  try {
    assert.equal(await claimJobRun(broken, "quote-expiry-digest", 6 * DAY, NOW), false);
  } finally {
    console.error = realError;
  }
});

test("the digest describes the week, including what is about to go", async () => {
  const supabase = fakeSupabase({
    pcd_quotes: [
      quoteRow({ id: "gone", status: "archived", archived_reason: ARCHIVED_EXPIRED, archived_at: daysAgo(2), expiry_warned_at: daysAgo(9) }),
      quoteRow({ id: "soon", status: "sent", sent_at: daysAgo(26) }),
      quoteRow({ id: "later", status: "sent", sent_at: daysAgo(2) }),
    ],
  });

  const digest = await gatherExpiryDigest(supabase, { now: NOW, validDays: VALID });
  assert.equal(digest.archived.length, 1);
  assert.equal(digest.expiringSoon.length, 1);
  assert.equal(digest.expiringSoon[0].daysLeft, 4);
  assert.equal(digest.archived[0].warned, true);
});

// ── the words ───────────────────────────────────────────────────────────────

const EMAIL = customerQuoteExpiryHtml({
  customerName: "Sarah",
  quoteNumber: "PCD-Q-1043",
  sentAtLabel: "5 August 2026",
  expiresAtLabel: "4 September 2026",
  daysLeft: 7,
  validDays: 30,
  totalIncGst: "$8,437.50",
  viewUrl: "https://example.com/quotes/view?code=K4M2XQ7B",
});

test("the reminder tells them doing nothing is a complete answer", () => {
  // THE PARAGRAPH NOT TO CUT. Without it this is a chase, whatever else it says.
  assert.match(EMAIL, /there is nothing you need to do/);
  assert.match(EMAIL, /disregard this email/);
});

test("the reminder is firm about what happens, and why", () => {
  assert.match(EMAIL, /will be archived and the link above will stop working/);
  assert.match(EMAIL, /prepare a fresh quote/);
  // The consequence has to be stated, or a reissued quote at a higher price is a
  // surprise we never warned them about.
  assert.match(EMAIL, /different price or with different lead times/);
});

test("the reminder carries their own dates, not a rounded promise", () => {
  assert.match(EMAIL, /prepared for you on 5 August 2026/);
  assert.match(EMAIL, /expires on 4 September 2026/);
  assert.match(EMAIL, /7 days from today/);
  assert.match(EMAIL, /valid for 30 days/);
});

test("a quote sent without a price does not have one turn up in the reminder", () => {
  const withoutPrice = customerQuoteExpiryHtml({
    customerName: "Sarah",
    quoteNumber: "PCD-Q-1043",
    sentAtLabel: "5 August 2026",
    expiresAtLabel: "4 September 2026",
    daysLeft: 7,
    validDays: 30,
    totalIncGst: "",
    viewUrl: "https://example.com/quotes/view?code=K4M2XQ7B",
  });
  assert.equal(withoutPrice.includes("Total inc GST"), false);
  assert.match(withoutPrice, /PCD-Q-1043/, "everything else still goes");
});

test("one day left reads as a day, not as 1 days", () => {
  const tomorrow = customerQuoteExpiryHtml({
    customerName: "Sarah",
    quoteNumber: "PCD-Q-1043",
    sentAtLabel: "5 August 2026",
    expiresAtLabel: "4 September 2026",
    daysLeft: 1,
    validDays: 30,
    totalIncGst: "",
    viewUrl: "https://example.com/q",
  });
  assert.match(tomorrow, /expires in 1 day</);
  assert.equal(tomorrow.includes("1 days"), false);
});

test("the reminder says it is automatic without reading as do not reply", () => {
  // Both halves, or it closes the only door it opens. A quote sitting three
  // weeks unanswered is very often one with something slightly wrong in it.
  assert.match(EMAIL, /automatic reminder from our order management system/);
  assert.match(EMAIL, /Replies come straight through to our team/);
  assert.equal(/do not reply|no-?reply/i.test(EMAIL), false);
});

test("the reminder looks like the quote email it follows, not like a new company", () => {
  // The cream and green shell, which is the only email most customers ever see
  // from us. A chase in the navy internal shell reads as somebody else.
  assert.match(EMAIL, /#fffaf3/);
  assert.match(EMAIL, /Perth Cabinet Doors/);
});

test("the digest reports figures and stops there", () => {
  const html = salesQuoteExpiryDigestHtml({
    archived: [
      { quoteNumber: "PCD-Q-1", customerName: "Sarah", sentAtLabel: "5 July 2026", warned: true, totalIncGst: "$8,437.50" },
    ],
    expiringSoon: [
      { quoteNumber: "PCD-Q-2", customerName: "Tom", expiresAtLabel: "2 September 2026", daysLeft: 3, totalIncGst: "$2,100.00" },
    ],
    warned: [],
    adminUrl: "https://example.com/admin/reporting/leads",
    since: "19 August 2026",
  });

  assert.match(html, /PCD-Q-1/);
  assert.match(html, /PCD-Q-2/);
  assert.match(html, /Expiring within 7 days/);
  // Nothing is lost, and whoever reads this needs to know that before they panic.
  assert.match(html, /Nothing is deleted/);
});

test("an empty week still sends, and says so", () => {
  const html = salesQuoteExpiryDigestHtml({
    archived: [],
    expiringSoon: [],
    warned: [],
    adminUrl: "https://example.com/admin/reporting/leads",
    since: "19 August 2026",
  });
  // A digest that only arrives when something happened cannot be told apart
  // from a job that stopped running.
  assert.match(html, /None\./);
});
