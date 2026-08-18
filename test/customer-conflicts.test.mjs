// Conflicting customer details are parked, never applied and never dropped.
//
// upsertCustomerByEmail has always filled blank fields and thrown away anything
// that disagreed with a value already on the record. Keeping the old value is
// right: a phone number confirmed by voice must not be overwritten by an older
// one typed into a form. Throwing the new one away is what was wrong, because
// sometimes it is the correct one and there was nothing left to show for it.
//
// The three rules these hold down:
//   a blank fills, silently, as before
//   a disagreement is parked and the record is NOT touched
//   one standing question per field, however many forms arrive

import test from "node:test";
import assert from "node:assert/strict";

import { customerFieldLabel, parkCustomerChanges, upsertCustomerByEmail } from "../lib/pcd-customer-utils.js";

// A Supabase stand-in. Records what was asked of it so the test can check the
// customer row was left alone as well as what got parked.
function fakeSupabase(existing) {
  const state = { customer: { ...existing }, parked: [], updates: [], cleared: [] };

  const api = {
    from(table) {
      if (table === "pcd_customers") {
        return {
          select: () => api._customerQuery(),
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) }),
          update(patch) {
            state.updates.push(patch);
            Object.assign(state.customer, patch);
            return { eq: () => ({ select: () => ({ single: async () => ({ data: state.customer, error: null }) }) }) };
          },
        };
      }
      if (table === "pcd_pending_customer_changes") {
        return {
          // Cleared and re-inserted, not upserted: the unique index is partial
          // and Postgres cannot match ON CONFLICT to one.
          delete: () => ({
            eq: () => ({
              eq: () => ({
                in: (column, values) => {
                  state.cleared.push({ column, values });
                  return Promise.resolve({ error: null });
                },
              }),
            }),
          }),
          insert(rows) {
            state.parked.push(...rows);
            return { select: async () => ({ data: rows, error: null }) };
          },
        };
      }
      throw new Error("unexpected table " + table);
    },
    _customerQuery() {
      return { ilike: () => ({ limit: () => ({ maybeSingle: async () => ({ data: state.customer, error: null }) }) }) };
    },
    state,
  };
  return api;
}

const ON_RECORD = {
  id: "c1",
  name: "Sarah Chen",
  email: "sarah.chen@gmail.com",
  phone: "0412 884 210",
  company_name: null,
  site_address: null,
  site_street: null,
  site_suburb: "Mount Lawley",
  site_postcode: "6050",
};

test("a blank field is filled without asking", async () => {
  const supabase = fakeSupabase(ON_RECORD);
  await upsertCustomerByEmail(supabase, { email: "sarah.chen@gmail.com", company_name: "Chen Design" });
  assert.equal(supabase.state.customer.company_name, "Chen Design");
  assert.deepEqual(supabase.state.parked, [], "filling a blank is not a question");
});

test("a value that disagrees is parked and the record is left alone", async () => {
  const supabase = fakeSupabase(ON_RECORD);
  await upsertCustomerByEmail(
    supabase,
    { email: "sarah.chen@gmail.com", phone: "0433 555 222", site_suburb: "Inglewood" },
    { source: "quote_request", id: "qr1", label: "Quote request, today 9:47am" }
  );

  assert.equal(supabase.state.customer.phone, "0412 884 210", "the record must not be overwritten");
  assert.equal(supabase.state.customer.site_suburb, "Mount Lawley");

  const fields = supabase.state.parked.map((row) => row.field).sort();
  assert.deepEqual(fields, ["phone", "site_suburb"]);

  const phone = supabase.state.parked.find((row) => row.field === "phone");
  assert.equal(phone.current_value, "0412 884 210");
  assert.equal(phone.proposed_value, "0433 555 222");
  assert.equal(phone.source, "quote_request");
  assert.equal(phone.source_label, "Quote request, today 9:47am");
  assert.equal(phone.status, "pending");
});

test("the same value arriving again is not a conflict", async () => {
  const supabase = fakeSupabase(ON_RECORD);
  await upsertCustomerByEmail(supabase, { email: "sarah.chen@gmail.com", phone: "0412 884 210" });
  assert.deepEqual(supabase.state.parked, []);
});

test("whitespace is not a conflict either", async () => {
  const supabase = fakeSupabase(ON_RECORD);
  await upsertCustomerByEmail(supabase, { email: "sarah.chen@gmail.com", phone: "  0412 884 210  " });
  assert.deepEqual(supabase.state.parked, []);
});

test("one standing question per field, so three forms do not ask three times", async () => {
  // The standing suggestion for a field is cleared before the new one is
  // written, so a customer who submits the same new phone number three times
  // raises one question and the newest value is the one on offer.
  const supabase = fakeSupabase(ON_RECORD);
  await parkCustomerChanges(supabase, ON_RECORD, { phone: "0433 555 222" }, { source: "form" });

  assert.equal(supabase.state.cleared.length, 1, "the standing suggestion must be cleared first");
  assert.deepEqual(supabase.state.cleared[0].values, ["phone"], "and only for the fields being replaced");
  assert.equal(supabase.state.parked.length, 1);
  assert.equal(supabase.state.parked[0].proposed_value, "0433 555 222");
});

test("a failure to park never breaks the thing that was actually being done", async () => {
  // This runs inside quote creation and inbound email. A suggestion that cannot
  // be written must not take the quote down with it.
  const broken = {
    from: (table) => {
      if (table === "pcd_pending_customer_changes") throw new Error("relation does not exist");
      throw new Error("unexpected table " + table);
    },
  };
  const parked = await parkCustomerChanges(broken, ON_RECORD, { phone: "0433 555 222" });
  assert.deepEqual(parked, []);
});

test("a customer with no id is not something to park against", async () => {
  assert.deepEqual(await parkCustomerChanges(fakeSupabase(ON_RECORD), {}, { phone: "0400 000 000" }), []);
});

test("fields read as English on screen", () => {
  assert.equal(customerFieldLabel("site_postcode"), "Postcode");
  assert.equal(customerFieldLabel("company_name"), "Company");
  assert.equal(customerFieldLabel("something_new"), "something new");
});
