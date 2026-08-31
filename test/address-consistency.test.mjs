// One address, asked for the same way everywhere.
//
// Quote acceptance asked the customer for street, suburb and postcode. Every
// admin screen asked for one free text line. The same address typed by a staff
// member and by the customer produced two different records, and a delivery run
// planned by suburb could only see the half that came in through acceptance.
//
// The rules now: ADDRESS_FIELDS is the one definition every screen renders
// from; addressColumns is what every screen writes, parts AND the joined
// one-liner together; addressFromRecord is what every screen reads, structured
// columns first and the one-liner split as the fallback.
//
// The lead forms stay as they are. A suburb is the right question before there
// is a job, and it has to survive into the suburb box rather than being dropped
// into the street address.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADDRESS_FIELDS,
  ADDRESS_KEYS,
  addressColumns,
  addressFromRecord,
  addressIsEmpty,
  formatSiteAddress,
} from "../lib/pcd-contact-details.js";

const PARTS = { street: "14 Rokeby Road", suburb: "Subiaco", postcode: "6008" };

// ── the one definition ──────────────────────────────────────────────────────

test("the fields are street, suburb, postcode, in that order", () => {
  assert.deepEqual(ADDRESS_FIELDS.map((f) => f.key), ADDRESS_KEYS);
  assert.deepEqual(ADDRESS_KEYS, ["street", "suburb", "postcode"]);
});

test("every field is renderable without the screen inventing anything", () => {
  ADDRESS_FIELDS.forEach((field) => {
    assert.ok(field.label, `${field.key} needs a label`);
    assert.ok(field.placeholder, `${field.key} needs a placeholder`);
    assert.ok(field.autoComplete, `${field.key} needs an autocomplete token`);
  });
});

// ── what every screen writes ────────────────────────────────────────────────

test("saving writes the parts AND the joined one-liner", () => {
  // Everything downstream still reads site_address: the quote PDF, the order,
  // the admin list. Writing only the parts would leave those on the old value.
  const columns = addressColumns(PARTS);
  assert.deepEqual(columns, {
    site_address: "14 Rokeby Road, Subiaco 6008",
    site_street: "14 Rokeby Road",
    site_suburb: "Subiaco",
    site_postcode: "6008",
  });
});

test("a suburb on its own writes a suburb, not a street address", () => {
  // This is the request-quote path. "Subiaco" used to land in site_address with
  // nothing in site_suburb, so it read as the whole street address and a run
  // planned by suburb could not see it at all.
  const columns = addressColumns({ suburb: "Subiaco" });
  assert.equal(columns.site_suburb, "Subiaco");
  assert.equal(columns.site_street, "");
  assert.equal(columns.site_address, "Subiaco");
});

test("saving never writes undefined into a column", () => {
  Object.values(addressColumns({})).forEach((value) => assert.equal(typeof value, "string"));
  Object.values(addressColumns()).forEach((value) => assert.equal(typeof value, "string"));
});

test("values are trimmed on the way in", () => {
  const columns = addressColumns({ street: "  14 Rokeby Road ", suburb: " Subiaco", postcode: "6008 " });
  assert.equal(columns.site_street, "14 Rokeby Road");
  assert.equal(columns.site_address, "14 Rokeby Road, Subiaco 6008");
});

// ── what every screen reads ─────────────────────────────────────────────────

test("the structured columns win when they are there", () => {
  const address = addressFromRecord({
    site_street: "14 Rokeby Road", site_suburb: "Subiaco", site_postcode: "6008",
    site_address: "somewhere else entirely",
  });
  assert.deepEqual(address, PARTS);
});

test("a record holding only the one-liner still opens with its parts", () => {
  // A quote raised before the columns existed, or by a screen that only ever
  // wrote the one-liner. Asking for the address again would be the wrong answer.
  assert.deepEqual(addressFromRecord({ site_address: "14 Rokeby Road, Subiaco 6008" }), PARTS);
});

test("a partly structured record is not treated as empty", () => {
  // A quote raised from a request has the suburb and nothing else. The suburb
  // must survive, and the other two boxes must simply be blank.
  const address = addressFromRecord({ site_suburb: "Subiaco", site_address: "Subiaco" });
  assert.equal(address.suburb, "Subiaco");
  assert.equal(address.street, "");
  assert.equal(address.postcode, "");
});

test("an empty record reads as empty rather than as undefined", () => {
  assert.deepEqual(addressFromRecord({}), { street: "", suburb: "", postcode: "" });
  assert.deepEqual(addressFromRecord(null), { street: "", suburb: "", postcode: "" });
  assert.equal(addressIsEmpty(addressFromRecord(null)), true);
  assert.equal(addressIsEmpty({ suburb: "Subiaco" }), false);
});

// ── the round trip every screen depends on ──────────────────────────────────

test("read, edit one box, write: the other two survive", () => {
  // The failure this prevents: an order whose address is only a one-liner. The
  // boxes show the parsed parts, someone corrects the postcode, and writing a
  // single structured column makes the reader switch to structured columns,
  // blanking the street and suburb nobody typed in.
  const order = { site_address: "14 Rokeby Road, Subiaco 6008" };
  const edited = { ...addressFromRecord(order), postcode: "6009" };
  const saved = addressColumns(edited);

  assert.equal(saved.site_street, "14 Rokeby Road");
  assert.equal(saved.site_suburb, "Subiaco");
  assert.equal(saved.site_postcode, "6009");
  assert.equal(saved.site_address, "14 Rokeby Road, Subiaco 6009");
  assert.deepEqual(addressFromRecord(saved), { ...PARTS, postcode: "6009" });
});

test("an address we cannot split survives being read and written back", () => {
  // Anything unparseable goes in the street box, where it is visible and can be
  // corrected, and comes back out unchanged rather than being silently lost.
  const record = { site_address: "behind the blue gate, ring first" };
  const saved = addressColumns(addressFromRecord(record));
  assert.match(saved.site_street, /blue gate/);
  assert.equal(saved.site_address, "behind the blue gate, ring first");
});

test("a suburb-only record survives the round trip", () => {
  const quote = addressColumns({ suburb: "Subiaco" });
  assert.deepEqual(addressFromRecord(quote), { street: "", suburb: "Subiaco", postcode: "" });
  assert.equal(formatSiteAddress(addressFromRecord(quote)), "Subiaco");
});

// ── every screen actually uses it ───────────────────────────────────────────

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ADDRESS_SCREENS = [
  "app/admin/quotes/[id]/QuoteEditor.js",
  // QuotesManager.js was on this list and has been deleted. It was orphaned:
  // /admin/quotes renders QuotesTable, nothing imported QuotesManager, and
  // docs/admin-style-audit.md had said to delete it for months. It was still
  // carrying its own copy of the built-in 40% markup, so every search for
  // hard coded pricing kept turning it up as though it were live.
  "app/admin/orders/[id]/OrderDetail.js",
  "app/admin/customers/CustomersManager.tsx",
  "app/admin/design/_components/ImportModal.js",
];

test("no screen asks for the address as one free text box any more", () => {
  ADDRESS_SCREENS.forEach((path) => {
    const src = read(path);
    assert.ok(
      !src.includes("Site / delivery address") && !/>\s*Site address\s*</.test(src),
      `${path} still has a single address box`
    );
  });
});

test("every admin address screen renders the shared fields", () => {
  ADDRESS_SCREENS.forEach((path) => {
    const src = read(path);
    const usesShared = src.includes("AddressFields") || src.includes("ADDRESS_FIELDS");
    assert.ok(usesShared, `${path} must render from the one definition`);
  });
});

test("the shared component renders from ADDRESS_FIELDS, not its own list", () => {
  const src = read("components/admin/AddressFields.js");
  assert.match(src, /ADDRESS_FIELDS\.map/);
  assert.ok(!/"Suburb"/.test(src), "labels must come from the definition, not be repeated here");
});

test("the public quote page renders from the same definition", () => {
  const src = read("app/(site)/quotes/QuoteApprovalClient.js");
  assert.match(src, /ADDRESS_KEYS/);
  assert.ok(!src.includes('"Site / delivery address"'));
});

test("the request-quote form still asks for a suburb and nothing more", () => {
  // Asking for a full address before there is a job is the wrong question.
  const src = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  assert.match(src, /Delivery suburb/);
  assert.ok(!/Street address/.test(src), "no street on the lead form");
  assert.ok(!/name="postcode"/.test(src), "no postcode on the lead form");
});

test("converting a request puts the suburb in the suburb column", () => {
  const src = read("app/api/admin/quote-requests/route.js");
  assert.match(src, /addressColumns\(\{ suburb: quoteRequest\.delivery_suburb \}\)/);
  assert.ok(
    !/site_address: quoteRequest\.delivery_suburb/.test(src),
    "a suburb must not be written as the whole address"
  );
});
