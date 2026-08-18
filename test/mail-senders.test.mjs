// Who counts as a customer, decided once and remembered.
//
// Supplier mail arrives almost daily. The rule that matters most is precedence:
// a whole supplier can be ignored while one real person there still gets
// through, because an address rule beats a domain rule. Get that backwards and
// either every statement opens a ticket or a genuine enquiry disappears.
//
// Nothing here can lose an email. Every message stays in the Outlook mailbox
// whatever these rules say; they only decide what the desk makes of it.

import test from "node:test";
import assert from "node:assert/strict";

import { decisionFor, domainOf, normaliseEmail } from "../lib/pcd-mail-senders.js";
import { hasCounterparty } from "../lib/pcd-desk-sync.js";

const RULES = [
  { match_type: "address", pattern: "mailer-daemon", decision: "ignore" },
  { match_type: "domain", pattern: "polytec.com.au", decision: "ignore" },
  { match_type: "address", pattern: "jane@polytec.com.au", decision: "customer" },
];

test("an address nobody has decided about is left undecided, not guessed at", () => {
  // The empty answer is what sends a sender to the approval list. Defaulting it
  // either way is the whole thing this design exists to avoid.
  assert.equal(decisionFor("sarah.chen@gmail.com", RULES), "");
});

test("a domain rule covers everybody at that company", () => {
  assert.equal(decisionFor("accounts@polytec.com.au", RULES), "ignore");
  assert.equal(decisionFor("freight@polytec.com.au", RULES), "ignore");
});

test("an address rule beats the domain rule it sits inside", () => {
  // Ignore the supplier, allow the one person there who talks about real jobs.
  assert.equal(decisionFor("jane@polytec.com.au", RULES), "customer");
});

test("a bare role name matches that role at any domain", () => {
  // The seeded rules are "mailer-daemon" and "postmaster" with no domain,
  // because a bounce comes from whichever mail server bounced it.
  assert.equal(decisionFor("mailer-daemon@outlook.com", RULES), "ignore");
  assert.equal(decisionFor("mailer-daemon@some-other-host.net", RULES), "ignore");
});

test("case and stray spaces do not defeat a rule", () => {
  assert.equal(decisionFor("  ACCOUNTS@Polytec.COM.AU  ", RULES), "ignore");
});

test("an empty address is ignored rather than treated as new", () => {
  assert.equal(decisionFor("", RULES), "ignore");
  assert.equal(decisionFor(null, RULES), "ignore");
});

test("a domain rule written with a leading @ still works", () => {
  const rules = [{ match_type: "domain", pattern: "@bunnings.com.au", decision: "ignore" }];
  assert.equal(decisionFor("orders@bunnings.com.au", rules), "ignore");
});

test("domains are read from the last @, so an odd address still resolves", () => {
  assert.equal(domainOf("first.last@example.com"), "example.com");
  assert.equal(domainOf("not-an-address"), "");
  assert.equal(normaliseEmail("  A@B.COM "), "a@b.com");
});

// ── what the sync refuses before any rule is consulted ──────────────────────

test("mail with us on both sides belongs to nobody", () => {
  const ours = new Set(["sales@perthcabinetdoors.com.au"]);
  assert.equal(hasCounterparty({ counterparty: { email: "sales@perthcabinetdoors.com.au" } }, ours), false);
  assert.equal(hasCounterparty({ counterparty: {} }, ours), false);
  assert.equal(hasCounterparty({ counterparty: { email: "sarah@gmail.com" } }, ours), true);
});
