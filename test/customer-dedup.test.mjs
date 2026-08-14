// One customer per email address.
//
// Someone can reach the customer list two ways now: saving a design on the
// public planner, and sending a quote request that gets converted. If those two
// paths disagree, one person ends up as two records and their history splits.
//
// These run against a fake Supabase so the find-or-create logic, the enrichment
// and the race recovery can all be exercised without a database.

import assert from "node:assert/strict";
import test from "node:test";

import {
  findCustomerByEmail,
  upsertCustomerByEmail,
  resolveQuoteCustomer,
} from "../lib/pcd-customer-utils.js";

// ── a fake postgrest, just enough of it ─────────────────────────────────────
function fakeDb({ rows = [], failFirstInsertWith = null } = {}) {
  const state = { rows: rows.map((r) => ({ ...r })), inserts: 0, updates: 0, queries: [] };
  let pendingInsertError = failFirstInsertWith;

  function unescapeLike(pattern) {
    return String(pattern).replace(/\\(.)/g, "$1");
  }
  // Mirrors ILIKE: % is any run, _ is any single character. Anything the caller
  // escaped is matched literally, which is the behaviour under test.
  function likeToRegex(pattern) {
    let out = "";
    for (let i = 0; i < pattern.length; i += 1) {
      const c = pattern[i];
      if (c === "\\") { out += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); i += 1; }
      else if (c === "%") out += ".*";
      else if (c === "_") out += ".";
      else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${out}$`, "i");
  }

  const api = {
    from() {
      const q = { filters: [], op: null, payload: null };
      const builder = {
        select() { return builder; },
        ilike(col, pattern) { q.filters.push({ col, pattern }); return builder; },
        eq(col, value) { q.filters.push({ col, value }); return builder; },
        limit() { return builder; },
        insert(payload) { q.op = "insert"; q.payload = payload; return builder; },
        update(payload) { q.op = "update"; q.payload = payload; return builder; },
        async maybeSingle() { return run(q, true); },
        async single() { return run(q, false); },
        then(resolve) { return Promise.resolve(run(q, false)).then(resolve); },
      };
      return builder;
    },
    state,
  };

  function match(row, filters) {
    return filters.every((f) => {
      if (f.pattern !== undefined) {
        state.queries.push({ col: f.col, pattern: f.pattern });
        return likeToRegex(f.pattern).test(String(row[f.col] ?? ""));
      }
      return String(row[f.col] ?? "") === String(f.value);
    });
  }

  function run(q, allowNull) {
    if (q.op === "insert") {
      state.inserts += 1;
      if (pendingInsertError) {
        const err = pendingInsertError;
        pendingInsertError = null;
        // The row the other request already wrote.
        state.rows.push({ id: `raced-${state.rows.length + 1}`, ...err.existing });
        return { data: null, error: { code: err.code } };
      }
      const row = { id: `new-${state.rows.length + 1}`, ...q.payload };
      state.rows.push(row);
      return { data: row, error: null };
    }
    if (q.op === "update") {
      state.updates += 1;
      const row = state.rows.find((r) => match(r, q.filters));
      if (!row) return { data: null, error: { code: "PGRST116" } };
      Object.assign(row, q.payload);
      return { data: { ...row }, error: null };
    }
    const found = state.rows.find((r) => match(r, q.filters));
    if (!found && !allowNull) return { data: null, error: { code: "PGRST116" } };
    return { data: found ? { ...found } : null, error: null };
  }

  return api;
}

const SARAH = { id: "c1", name: "Sarah Jones", email: "sarah@example.com", phone: null, site_address: null, company_name: null };

// ── the core promise ────────────────────────────────────────────────────────

test("saving a design then sending a quote request gives ONE customer", async () => {
  const db = fakeDb();

  // Saves a design on the planner.
  const first = await upsertCustomerByEmail(db, { name: "Sarah Jones", email: "sarah@example.com" });
  assert.ok(first.id);

  // Weeks later, sends a quote request that gets converted to a quote.
  const id = await resolveQuoteCustomer(db, {
    customer_name: "Sarah Jones",
    customer_email: "sarah@example.com",
    customer_phone: "0400 000 000",
  });

  assert.equal(id, first.id, "the quote must attach to the customer the planner created");
  assert.equal(db.state.rows.length, 1, "exactly one customer row");
  assert.equal(db.state.inserts, 1, "only the first path inserted");
});

test("matching is case insensitive, so Sarah@ and sarah@ are one person", async () => {
  const db = fakeDb({ rows: [SARAH] });
  const found = await upsertCustomerByEmail(db, { name: "S Jones", email: "SARAH@EXAMPLE.COM" });
  assert.equal(found.id, "c1");
  assert.equal(db.state.rows.length, 1);
});

test("a second visit fills in what the first one did not have", async () => {
  const db = fakeDb({ rows: [SARAH] });
  const updated = await upsertCustomerByEmail(db, {
    name: "Sarah Jones",
    email: "sarah@example.com",
    phone: "0400 000 000",
    site_address: "Subiaco",
  });
  assert.equal(updated.id, "c1");
  assert.equal(updated.phone, "0400 000 000", "a blank phone gets filled");
  assert.equal(updated.site_address, "Subiaco");
});

test("a value we already hold is never overwritten by a newer one", async () => {
  const db = fakeDb({ rows: [{ ...SARAH, phone: "0411 111 111" }] });
  const updated = await upsertCustomerByEmail(db, {
    name: "Sarah Jones", email: "sarah@example.com", phone: "0499 999 999",
  });
  assert.equal(updated.phone, "0411 111 111", "the phone we already had wins");
});

test('the "Customer" placeholder counts as a blank name', async () => {
  // normalizeCustomerPayload writes this when no name was given, so a real name
  // arriving later should replace it.
  const db = fakeDb({ rows: [{ ...SARAH, name: "Customer" }] });
  const updated = await upsertCustomerByEmail(db, { name: "Sarah Jones", email: "sarah@example.com" });
  assert.equal(updated.name, "Sarah Jones");
});

// ── the bugs this was written to catch ──────────────────────────────────────

test("an underscore in an address does not match somebody else", async () => {
  // ILIKE treats _ as any single character, so an unescaped a_b@ matched axb@.
  const db = fakeDb({ rows: [{ id: "other", name: "Someone Else", email: "axb@example.com" }] });
  const created = await upsertCustomerByEmail(db, { name: "Real Person", email: "a_b@example.com" });
  assert.notEqual(created.id, "other", "must not have matched the other customer");
  assert.equal(created.email, "a_b@example.com");
  assert.equal(db.state.rows.length, 2);
});

test("a percent sign in an address does not match everybody", async () => {
  const db = fakeDb({ rows: [{ id: "other", name: "Someone Else", email: "zzz@example.com" }] });
  const created = await upsertCustomerByEmail(db, { name: "Real Person", email: "%@example.com" });
  assert.notEqual(created.id, "other");
  assert.equal(db.state.rows.length, 2);
});

test("losing a race takes the other request's record instead of failing", async () => {
  // Two submissions land at once. Both read nothing, both insert; the database's
  // unique index rejects the second with 23505.
  const db = fakeDb({
    failFirstInsertWith: { code: "23505", existing: { name: "Sarah Jones", email: "sarah@example.com" } },
  });
  const customer = await upsertCustomerByEmail(db, { name: "Sarah Jones", email: "sarah@example.com" });
  assert.ok(customer?.id, "recovered rather than throwing");
  assert.equal(db.state.rows.length, 1, "still one customer");
});

test("a real insert error is not swallowed", async () => {
  const db = fakeDb({ failFirstInsertWith: { code: "42501", existing: {} } });
  await assert.rejects(
    () => upsertCustomerByEmail(db, { name: "Sarah", email: "sarah@example.com" }),
    (err) => err.code === "42501"
  );
});

// ── edges ───────────────────────────────────────────────────────────────────

test("no email means no customer record from the planner", async () => {
  const db = fakeDb();
  assert.equal(await upsertCustomerByEmail(db, { name: "Anonymous" }), null);
  assert.equal(db.state.inserts, 0);
});

test("a quote request with only a phone still creates a customer", async () => {
  // There is nothing to dedupe on, so this one has to insert.
  const db = fakeDb();
  const id = await resolveQuoteCustomer(db, { customer_name: "No Email", customer_phone: "0400 000 000" });
  assert.ok(id);
  assert.equal(db.state.rows.length, 1);
});

test("an explicit customer_id short circuits everything", async () => {
  const db = fakeDb();
  assert.equal(await resolveQuoteCustomer(db, { customer_id: "chosen" }), "chosen");
  assert.equal(db.state.inserts, 0);
});

test("an empty payload creates nothing", async () => {
  const db = fakeDb();
  assert.equal(await resolveQuoteCustomer(db, {}), null);
  assert.equal(db.state.inserts, 0);
});

test("findCustomerByEmail with no email is a no-op", async () => {
  const db = fakeDb({ rows: [SARAH] });
  assert.equal(await findCustomerByEmail(db, ""), null);
  assert.equal(await findCustomerByEmail(db, null), null);
});
