// THE GOOGLE REVIEW REQUEST.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   NOTHING IS SENT TO A CUSTOMER WHO OWES MONEY, and the wait starts the day
//   they pay, not the day the job was finished.
//
//   TURNING IT ON DOES NOT EMAIL THE BACK CATALOGUE. Only orders finished after
//   the switch went on are asked.
//
//   AN UNSUBSCRIBE AND A "NEVER ASK" BOTH STOP IT, and so does a request to the
//   same customer inside the gap.
//
//   ONE ORDER, ONE EMAIL. Two passes arriving together, or a pass and Send now,
//   cannot both send. Tested against a fake database that honours the filters.
//
//   THE EMAIL ALWAYS HAS A BUTTON AND AN UNSUBSCRIBE LINK, whatever is typed
//   into the wording in Settings.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  REVIEW_BUTTON,
  addDays,
  clockStartDay,
  firstName,
  insideSendingHours,
  perthDay,
  reviewMessageParagraphs,
  reviewRequestState,
  reviewSettingsProblem,
} from "../lib/pcd-review-requests.js";
import { customerReviewRequestHtml } from "../lib/pcd-email-templates.js";
import { businessDefaultsToDbRow } from "../lib/pcd-business-defaults.js";
import { normalizeBusinessDefaults } from "../lib/pcd-quote-utils.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const SETTINGS = {
  review_requests_enabled: true,
  review_request_delay_days: 3,
  review_request_gap_months: 12,
  google_review_url: "https://g.page/r/example/review",
  review_request_subject: "Thank you",
  review_request_message: "Hi {first_name},\n\nThanks.\n\n{review_button}",
};
const ENABLED_AT = "2026-10-01T00:00:00Z";

// 10am Perth on Monday 5 October 2026.
const MON_10AM = new Date("2026-10-05T02:00:00Z");

const order = (overrides = {}) => ({
  id: "o1",
  status: "complete",
  // 3pm Perth on Monday 5 October.
  completed_at: "2026-10-05T07:00:00Z",
  total_inc_gst: 1000,
  customer_email: "jane@example.com",
  customer_name: "Jane Example",
  ...overrides,
});
const paidInFull = [{ amount: 1000, is_paid: true, paid_at: "2026-09-20", payment_type: "final" }];

const state = (o, extra = {}) =>
  reviewRequestState(o, { settings: SETTINGS, enabledAt: ENABLED_AT, payments: paidInFull, now: MON_10AM, ...extra });

// ── The clock ───────────────────────────────────────────────────────────────

test("days are Perth days, so a job finished at 9pm Perth is that day, not the next", () => {
  // 9pm Perth on 5 October is 1pm UTC the same day; 1am Perth on the 6th is
  // 5pm UTC on the 5th, which is the case UTC would get wrong.
  assert.equal(perthDay("2026-10-05T13:00:00Z"), "2026-10-05");
  assert.equal(perthDay("2026-10-05T17:00:00Z"), "2026-10-06");
  assert.equal(perthDay("2026-10-05"), "2026-10-05");
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
});

test("the wait counts from the later of finishing and the last payment", () => {
  assert.equal(clockStartDay(order(), paidInFull), "2026-10-05");
  const paidLater = [{ amount: 1000, is_paid: true, paid_at: "2026-10-12", payment_type: "final" }];
  assert.equal(clockStartDay(order(), paidLater), "2026-10-12");
  // A refund is money going out, not the job being paid for.
  const refundLater = [...paidInFull, { amount: -50, is_paid: true, paid_at: "2026-10-20", payment_type: "refund" }];
  assert.equal(clockStartDay(order(), refundLater), "2026-10-05");
});

test("lined up for three Perth days after Complete, then due", () => {
  const waiting = state(order());
  assert.equal(waiting.key, "waiting");
  assert.equal(waiting.sendOn, "2026-10-08");
  assert.match(waiting.label, /jane@example\.com/);
  assert.equal(state(order(), { now: new Date("2026-10-08T01:00:00Z") }).key, "due");
});

test("a request that was due long ago is not sent", () => {
  assert.equal(state(order(), { now: new Date("2027-01-20T01:00:00Z") }).key, "too_late");
});

test("the job only sends in Perth working hours", () => {
  assert.equal(insideSendingHours(new Date("2026-10-05T01:00:00Z")), true); // 9am
  assert.equal(insideSendingHours(new Date("2026-10-05T06:00:00Z")), true); // 2pm
  assert.equal(insideSendingHours(new Date("2026-10-04T22:00:00Z")), false); // 6am
});

// ── Who is not asked ────────────────────────────────────────────────────────

test("money still owing holds it, and says how much", () => {
  const owing = state(order(), { payments: [{ amount: 580, is_paid: true, paid_at: "2026-09-20" }] });
  assert.equal(owing.key, "owing");
  assert.equal(owing.owing, 420);
  assert.match(owing.label, /\$420\.00/);
});

test("orders finished before the switch went on are never asked", () => {
  assert.equal(state(order({ completed_at: "2026-09-30T07:00:00Z" })).key, "before_switch");
  assert.equal(state(order(), { enabledAt: null }).key, "before_switch");
});

test("switched off, unsubscribed and never ask all stop it", () => {
  assert.equal(state(order(), { settings: { ...SETTINGS, review_requests_enabled: false } }).key, "off");
  assert.equal(state(order(), { optedOut: true }).key, "opted_out");
  assert.equal(state(order(), { neverAsk: true }).key, "opted_out");
});

test("a customer asked inside the gap is not asked again, and a gap of 0 asks every time", () => {
  assert.equal(state(order(), { lastAskedAt: "2026-06-01T01:00:00Z" }).key, "asked_recently");
  assert.equal(state(order(), { lastAskedAt: "2025-06-01T01:00:00Z" }).key, "waiting");
  assert.equal(
    state(order(), { lastAskedAt: "2026-06-01T01:00:00Z", settings: { ...SETTINGS, review_request_gap_months: 0 } }).key,
    "waiting"
  );
});

test("sent is final, even after the order is reopened", () => {
  assert.equal(state(order({ review_request_sent_at: "2026-10-08T01:00:00Z" })).key, "sent");
  assert.equal(state(order({ status: "active", review_request_sent_at: "2026-10-08T01:00:00Z" })).key, "sent");
  assert.equal(state(order({ status: "active" })).key, "not_complete");
});

test("no email waits for one rather than being written off", () => {
  assert.equal(state(order({ customer_email: "" })).key, "no_email");
});

// ── The email ───────────────────────────────────────────────────────────────

test("the wording always ends up with a button, wherever it was typed", () => {
  assert.deepEqual(reviewMessageParagraphs("Hi {first_name},\n\nThanks.", { firstName: "Jane" }), [
    "Hi Jane,",
    "Thanks.",
    REVIEW_BUTTON,
  ]);
  assert.deepEqual(reviewMessageParagraphs("Please {review_button} thanks", {}), ["Please", REVIEW_BUTTON, "thanks"]);
  assert.equal(reviewMessageParagraphs("Hi {first_name},", {})[0], "Hi there,");
});

test("a company name is not used as a first name", () => {
  assert.equal(firstName("Jane Example"), "Jane");
  assert.equal(firstName("ABC Builders Pty Ltd"), "");
  assert.equal(firstName(""), "");
});

test("the email carries the button and the unsubscribe link", () => {
  const html = customerReviewRequestHtml({
    heading: "Thank you, Jane",
    paragraphs: ["Hi Jane,", REVIEW_BUTTON],
    buttonUrl: "https://example.com/go?code=abc",
    unsubscribeUrl: "https://example.com/reviews/unsubscribe?code=abc",
    orderNumber: "PCD-1",
  });
  assert.match(html, /Leave a Google review/);
  assert.match(html, /href="https:\/\/example\.com\/go\?code=abc"/);
  assert.match(html, /Stop review requests/);
  assert.match(html, /order PCD-1/);
});

test("it cannot be switched on without a link and wording", () => {
  assert.equal(reviewSettingsProblem({ review_requests_enabled: false }), null);
  assert.equal(reviewSettingsProblem(SETTINGS), null);
  assert.match(reviewSettingsProblem({ ...SETTINGS, google_review_url: "" }), /Google review link/);
  assert.match(reviewSettingsProblem({ ...SETTINGS, google_review_url: "g.page/x" }), /https/);
  assert.match(reviewSettingsProblem({ ...SETTINGS, review_request_message: " " }), /wording/);
});

// ── Settings ────────────────────────────────────────────────────────────────

test("the settings survive the trip to the database, and off is the default", () => {
  assert.equal(normalizeBusinessDefaults({}).review_requests_enabled, false);
  assert.equal(normalizeBusinessDefaults({ review_requests_enabled: "true" }).review_requests_enabled, false);
  assert.equal(normalizeBusinessDefaults({ review_request_delay_days: 0 }).review_request_delay_days, 0);
  assert.equal(normalizeBusinessDefaults({ review_request_delay_days: 500 }).review_request_delay_days, 60);
  const row = businessDefaultsToDbRow(SETTINGS);
  assert.equal(row.review_requests_enabled, true);
  assert.equal(row.google_review_url, SETTINGS.google_review_url);
  // Stamped by the database only.
  assert.ok(!("review_requests_enabled_at" in row));
});

test("the migration stamps the switch time and starts switched off", () => {
  const sql = read("supabase/202610051200_pcd_review_requests.sql");
  assert.match(sql, /review_requests_enabled boolean not null default false/);
  assert.match(sql, /new\.review_requests_enabled_at := timezone\('utc', now\(\)\)/);
  assert.match(sql, /create unique index if not exists pcd_orders_review_token_key/);
});

// ── One order, one email ────────────────────────────────────────────────────

// A fake of the few supabase calls the job makes, honouring eq / is / in / gte
// filters on update, which is what the claim depends on.
function fakeSupabase(tables) {
  const matches = (row, filters) => filters.every(([op, col, val]) =>
    op === "eq" ? row[col] === val
      : op === "is" ? (row[col] ?? null) === val
        : op === "in" ? val.includes(row[col])
          : op === "gte" ? row[col] != null && String(row[col]) >= String(val)
            : true);
  return {
    from(name) {
      const rows = tables[name] || (tables[name] = []);
      const filters = [];
      let patch = null;
      let insert = null;
      const q = {
        select() { return q; },
        update(values) { patch = values; return q; },
        insert(values) { insert = values; return q; },
        upsert(values) { insert = values; return q; },
        eq(c, v) { filters.push(["eq", c, v]); return q; },
        is(c, v) { filters.push(["is", c, v]); return q; },
        in(c, v) { filters.push(["in", c, v]); return q; },
        gte(c, v) { filters.push(["gte", c, v]); return q; },
        not() { return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle() { return Promise.resolve(run()).then((r) => ({ data: r.data?.[0] || null, error: null })); },
        single() { return q.maybeSingle(); },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      function run() {
        if (insert) {
          const list = Array.isArray(insert) ? insert : [insert];
          if (name === "pcd_order_activity" && list.some((r) => r.event_key && rows.some((x) => x.event_key === r.event_key))) {
            return { data: null, error: { message: "duplicate key" } };
          }
          rows.push(...list.map((r) => ({ id: `${name}-${rows.length + 1}`, ...r })));
          return { data: list, error: null };
        }
        const hit = rows.filter((row) => matches(row, filters));
        if (patch) hit.forEach((row) => Object.assign(row, patch));
        return { data: hit, error: null };
      }
      return q;
    },
  };
}

test("two passes at once send one email, and a refused send is let go for the next pass", async () => {
  const { runReviewRequests } = await import("../lib/pcd-review-request-run.js");
  // Stands in for Resend. Counts what it was given; refuses while `down`.
  const sends = [];
  let down = false;
  const mailer = {
    emails: {
      send: async (payload) => {
        if (down) return { data: null, error: { message: "provider unavailable" } };
        sends.push(payload);
        return { data: { id: `m${sends.length}` }, error: null };
      },
    },
  };
  process.env.RESEND_FROM_EMAIL = "sales@example.com";

  const db = fakeSupabase({
    pcd_business_defaults: [{ id: "00000000-0000-0000-0000-000000000001", ...SETTINGS, review_requests_enabled_at: ENABLED_AT }],
    pcd_orders: [order({ review_token: "11111111-1111-1111-1111-111111111111", order_number: "PCD-1" })],
    pcd_order_payments: paidInFull.map((p) => ({ ...p, order_id: "o1" })),
  });
  const now = new Date("2026-10-08T01:00:00Z");
  const pass = () => runReviewRequests(db, { now, baseUrl: "https://site.example", mailer });

  // Refused: nothing sent, and the order is let go rather than marked sent.
  down = true;
  const refused = await pass();
  assert.equal(sends.length, 0);
  assert.equal(refused.problems.length, 1);
  assert.equal((await db.from("pcd_orders").select("*")).data[0].review_request_sent_at, null);

  // The provider is back. Two passes at once send exactly one.
  down = false;
  const [a, b] = await Promise.all([pass(), pass()]);
  assert.equal(sends.length, 1, `exactly one email: ${JSON.stringify([a, b])}`);
  assert.equal(a.sent + b.sent, 1);
  assert.equal(sends[0].to[0], "jane@example.com");
  assert.match(sends[0].html, /site\.example\/api\/review-request\/go\?code=11111111/);
  assert.equal(sends[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  // And a later pass finds nothing to do.
  await pass();
  assert.equal(sends.length, 1);
});

test("the order page and the job read the same rules", () => {
  const route = read("app/api/admin/orders/[id]/route.js");
  assert.match(route, /reviewRequestForOrder/);
  const cron = read("vercel.json");
  assert.match(cron, /\/api\/cron\/review-requests/);
});
