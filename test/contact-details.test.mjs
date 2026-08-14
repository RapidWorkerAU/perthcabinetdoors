// A quote cannot be accepted without somewhere to deliver it.
//
// Jobs were reaching the delivery run with no address and no mobile, because
// acceptance asked for a name typed into a box and nothing else. These rules
// now stand between a customer and the Approve button, so they have to be
// right: too loose and the gap stays open, too strict and a real customer
// cannot accept a quote they want to accept.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ADDRESS_KEYS,
  DETAIL_FIELDS,
  detailsAreComplete,
  formatSiteAddress,
  normaliseDetails,
  parseSiteAddress,
  prefillDetails,
  validateDetail,
  validateDetails,
} from "../lib/pcd-contact-details.js";

const GOOD = {
  name: "Sarah Jones",
  email: "sarah.jones@example.com",
  mobile: "0412 345 678",
  street: "14 Rokeby Road",
  suburb: "Subiaco",
  postcode: "6008",
};

const PARTS = { street: "14 Rokeby Road", suburb: "Subiaco", postcode: "6008" };

// ── the gate ────────────────────────────────────────────────────────────────

test("a complete set passes", () => {
  assert.deepEqual(validateDetails(GOOD), {});
  assert.equal(detailsAreComplete(GOOD), true);
});

test("every single field is required", () => {
  for (const { key } of DETAIL_FIELDS) {
    const missing = { ...GOOD, [key]: "" };
    assert.ok(validateDetails(missing)[key], `${key} must be required`);
    assert.equal(detailsAreComplete(missing), false);
  }
});

test("whitespace is not an answer", () => {
  assert.ok(validateDetail("street", "   "));
  assert.ok(validateDetail("suburb", "\t"));
  assert.ok(validateDetail("name", " "));
});

test("n/a style answers do not get through where the shape matters", () => {
  assert.ok(validateDetail("email", "n/a"), "an email has to look like one");
  assert.ok(validateDetail("mobile", "n/a"));
  assert.ok(validateDetail("postcode", "n/a"));
  assert.ok(validateDetail("street", "n/a"), "too short to be a street address");
});

// ── real values must not be rejected ────────────────────────────────────────

test("real Australian numbers are accepted in the forms people type", () => {
  [
    "0412 345 678",
    "0412345678",
    "0412-345-678",
    "+61412345678",
    "+61 412 345 678",
    "08 9200 1000",
    "0892001000",
  ].forEach((number) => {
    assert.equal(validateDetail("mobile", number), "", `${number} should be accepted`);
  });
});

test("obvious rubbish numbers are rejected", () => {
  ["12345", "0000", "abcdefghij", "0112345678", "+1 555 0100"].forEach((number) => {
    assert.ok(validateDetail("mobile", number), `${number} should be rejected`);
  });
});

test("postcodes are exactly four digits", () => {
  assert.equal(validateDetail("postcode", "6008"), "");
  assert.equal(validateDetail("postcode", "0800"), "");
  ["608", "60081", "6a08", "WA 6008"].forEach((p) => assert.ok(validateDetail("postcode", p)));
});

test("emails with real-world shapes are accepted", () => {
  ["a.b@c.com.au", "sarah+quotes@example.co", "s@e.io"].forEach((e) => {
    assert.equal(validateDetail("email", e), "", `${e} should be accepted`);
  });
  ["sarah@example", "sarah example.com", "@example.com", "sarah@"].forEach((e) => {
    assert.ok(validateDetail("email", e), `${e} should be rejected`);
  });
});

// ── storage shape ───────────────────────────────────────────────────────────

test("the one-line address keeps the form every existing consumer reads", () => {
  assert.equal(formatSiteAddress(GOOD), "14 Rokeby Road, Subiaco 6008");
});

test("a partial address still formats without stray punctuation", () => {
  assert.equal(formatSiteAddress({ street: "14 Rokeby Road" }), "14 Rokeby Road");
  assert.equal(formatSiteAddress({ suburb: "Subiaco", postcode: "6008" }), "Subiaco 6008");
  assert.equal(formatSiteAddress({}), "");
});

test("a stored one-liner parses back into its parts", () => {
  assert.deepEqual(parseSiteAddress("14 Rokeby Road, Subiaco 6008"), PARTS);
  assert.deepEqual(parseSiteAddress("14 Rokeby Road, Subiaco, WA 6008"), PARTS);
  assert.deepEqual(parseSiteAddress("Unit 2, 14 Rokeby Road, Subiaco 6008"), {
    street: "Unit 2, 14 Rokeby Road",
    suburb: "Subiaco",
    postcode: "6008",
  });
});

test("an address it cannot read goes in the street field rather than vanishing", () => {
  // Visible and correctable beats silently dropped.
  const parsed = parseSiteAddress("behind the blue gate, ring first");
  assert.match(parsed.street, /blue gate/);
  assert.equal(parsed.postcode, "");
});

test("formatting and parsing round-trip", () => {
  assert.deepEqual(parseSiteAddress(formatSiteAddress(GOOD)), PARTS);
});

// ── pre-fill ────────────────────────────────────────────────────────────────

test("the customer record wins over the quote snapshot", () => {
  const details = prefillDetails({
    customer: {
      name: "Sarah Jones", email: "new@example.com", phone: "0412 345 678",
      site_street: "14 Rokeby Road", site_suburb: "Subiaco", site_postcode: "6008",
    },
    quote: {
      customer_name: "S Jones", customer_email: "old@example.com", customer_phone: "",
      site_address: "1 Old Street, Nedlands 6009",
    },
  });
  assert.equal(details.email, "new@example.com", "the record we keep current wins");
  assert.equal(details.street, "14 Rokeby Road");
});

test("the quote fills the gaps the customer record leaves", () => {
  const details = prefillDetails({
    customer: { name: "Sarah Jones", email: "", phone: null },
    quote: {
      customer_email: "sarah@example.com",
      customer_phone: "0412 345 678",
      site_address: "14 Rokeby Road, Subiaco 6008",
    },
  });
  assert.equal(details.email, "sarah@example.com");
  assert.equal(details.mobile, "0412 345 678");
  assert.equal(details.suburb, "Subiaco", "an old one-liner still pre-fills the parts");
});

test("nothing on file pre-fills to blanks, not to undefined", () => {
  const details = prefillDetails({ customer: null, quote: {} });
  DETAIL_FIELDS.forEach(({ key }) => assert.equal(details[key], "", `${key} should be an empty string`));
  assert.equal(detailsAreComplete(details), false);
});

test("a quote with only a name is incomplete, and names the five that are missing", () => {
  const details = prefillDetails({ quote: { customer_name: "Sarah Jones" } });
  const errors = validateDetails(details);
  assert.deepEqual(Object.keys(errors).sort(), ["email", "mobile", "postcode", "street", "suburb"]);
});

test("normalise trims and never returns undefined", () => {
  const out = normaliseDetails({ name: "  Sarah  ", email: undefined, mobile: null });
  assert.equal(out.name, "Sarah");
  DETAIL_FIELDS.forEach(({ key }) => assert.equal(typeof out[key], "string"));
});

test("the address keys are the three the summary shows as one row", () => {
  assert.deepEqual(ADDRESS_KEYS, ["street", "suburb", "postcode"]);
  ADDRESS_KEYS.forEach((key) => {
    assert.ok(DETAIL_FIELDS.some((f) => f.key === key), `${key} must be a detail field`);
  });
});
