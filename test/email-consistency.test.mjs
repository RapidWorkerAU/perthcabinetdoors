// ONE LOOK PER AUDIENCE.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
//   A CUSTOMER always sees the cream and green shell, the same one their quote
//   arrived in. Quote, confirmation, payment, variation, reminder, weekly
//   update, a reply typed by a person: all of it.
//
//   WE see the navy shell in sales@. An internal notification should be
//   obviously internal at a glance and never mistakable for something a
//   customer sent.
//
// ── WHY IT NEEDED WRITING DOWN ───────────────────────────────────────────────
//
// There were three looks, not two, and which one an email wore depended on the
// file it happened to be written in rather than on who was going to read it.
// The same customer, on the same job, could receive "Your quote is ready" in
// cream and "Thanks for approving your quote" in navy an hour later.
//
// Five separate files also carried their own inline copy of the cream layout,
// and had already drifted: a 680px card against 640, Georgia against Arial, and
// three of the five had no footer at all. They matched by coincidence, and
// coincidence does not survive the next edit.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   NO EMAIL BUILDS ITS OWN DOCUMENT. One file holds every shell.
//   EVERY CUSTOMER EMAIL IS CREAM. Every internal one is navy.
//   THE CONTACT DETAILS COME FROM ONE PLACE, so the address on an email and the
//   address on a tax invoice cannot disagree.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  businessEnquiryHtml,
  businessQuoteRequestHtml,
  customerDepositFinalHtml,
  customerDepositReminderHtml,
  customerEnquiryHtml,
  customerPaymentReceivedHtml,
  customerQuoteApprovedHtml,
  customerQuoteRequestHtml,
  customerUpdateHtml,
  customerVariationApprovedHtml,
  salesDepositUnpaidHtml,
} from "../lib/pcd-email-templates.js";
import { deskReplyEmailHtml } from "../lib/pcd-desk-email.js";
import { SALES_EMAIL, BUSINESS_PHONE } from "../lib/pcd-business-identity.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// The page colour of each shell, which is the cheapest reliable tell.
const CREAM_PAGE = "background:#f4f0e8";
const NAVY_HEADER = "background:#0d3550";

const DEPOSIT = {
  customerName: "Test", quoteNumber: "PCD-Q-1", totalIncGst: "$100.00",
  depositAmount: "$50.00", depositPercent: "50%", viewUrl: "https://example.com/q",
};

const TO_CUSTOMER = [
  ["quote request received", customerQuoteRequestHtml({ customerName: "T", productName: "P", lines: [] })],
  ["enquiry received", customerEnquiryHtml({ customerName: "T" })],
  ["quote approved", customerQuoteApprovedHtml({ customerName: "T", quoteNumber: "Q1", orderNumber: "O1" })],
  ["payment received", customerPaymentReceivedHtml({ customerName: "T", money: "$1.00", orderNumber: "O1" })],
  ["variation approved", customerVariationApprovedHtml({ customerName: "T", variationNumber: "V1", orderNumber: "O1" })],
  ["deposit reminder", customerDepositReminderHtml(DEPOSIT)],
  ["deposit final reminder", customerDepositFinalHtml(DEPOSIT)],
  ["weekly order update", customerUpdateHtml({ customerName: "T", body: "Hi T,\n\nPCD-O-1 - Job\n  1 August 2026 - Something happened\n\nEnd." })],
  ["desk reply", deskReplyEmailHtml({ bodyHtml: "<p>Hello</p>", subject: "Re: your job" })],
];

const TO_US = [
  ["new website enquiry", businessEnquiryHtml({ customerName: "T", customerEmail: "a@b.c", topic: "x" })],
  ["new quote request", businessQuoteRequestHtml({ customerName: "T", lines: [] })],
  ["deposit unpaid notice", salesDepositUnpaidHtml({
    quoteNumber: "Q1", customerName: "T", customerEmail: "a@b.c", customerPhone: "1",
    totalIncGst: "$1", depositAmount: "$1", approvedAt: "now", attempts: "1", adminUrl: "https://x",
  })],
];

test("every email a customer receives wears the same look", () => {
  TO_CUSTOMER.forEach(([name, html]) => {
    assert.ok(html.includes(CREAM_PAGE), `${name} is not on the cream shell a customer already knows`);
    assert.ok(!html.includes(NAVY_HEADER), `${name} is wearing the internal navy header`);
  });
});

test("every email we send ourselves is obviously internal", () => {
  TO_US.forEach(([name, html]) => {
    assert.ok(html.includes(NAVY_HEADER), `${name} should be on the navy staff shell`);
    assert.ok(!html.includes(CREAM_PAGE), `${name} looks like something a customer sent`);
  });
});

test("every email is a complete document with a footer", () => {
  [...TO_CUSTOMER, ...TO_US].forEach(([name, html]) => {
    assert.ok(/^<!doctype html>/i.test(html.trim()), `${name} is not a whole document`);
    assert.ok(html.includes("Perth Cabinet Doors"), `${name} does not say who sent it`);
    assert.ok(html.trim().endsWith("</html>"), `${name} is not closed`);
  });
});

test("no route or library builds its own email document", () => {
  // Five files used to. They matched by coincidence and had already drifted on
  // width, font and footer.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      const source = readFileSync(full, "utf8");
      if (/<!doctype html>/i.test(source) && !full.endsWith("pcd-email-templates.js")) {
        offenders.push(full.slice(root.length + 1));
      }
    }
  };
  walk(join(root, "app"));
  walk(join(root, "lib"));
  assert.deepEqual(offenders, [], `these build their own email document instead of using a shared shell: ${offenders.join(", ")}`);
});

test("the business contact details have one definition", () => {
  const identity = readFileSync(join(root, "lib/pcd-business-identity.js"), "utf8");
  assert.match(identity, /export const SALES_EMAIL/);
  assert.match(identity, /export const BUSINESS_PHONE/);

  // The templates re-export rather than declaring their own, so an email and a
  // tax invoice cannot end up naming different addresses.
  const templates = readFileSync(join(root, "lib/pcd-email-templates.js"), "utf8");
  assert.match(templates, /export \{ SALES_EMAIL[^}]*\} from "\.\/pcd-business-identity"/);
  assert.ok(!/const SALES_EMAIL = "/.test(templates), "the address must not be declared twice");
});

test("no personal phone number is printed on anything", () => {
  // Every tax invoice ever issued carried one, because it was the fallback
  // behind a column that does not exist. See lib/pcd-business-identity.js.
  const pdf = readFileSync(join(root, "lib/pcd-tax-invoice-pdf.js"), "utf8");
  const code = pdf.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/0405\s?263\s?332/.test(code), "the personal mobile is back on the invoice");
  assert.ok(!/businessDefaults\.(phone|email|abn|accountsContact)/.test(code),
    "these are not columns on pcd_business_defaults, so the fallback always wins");
  assert.equal(BUSINESS_PHONE, "0437 750 990");
  assert.equal(SALES_EMAIL, "sales@perthcabinetdoors.com.au");
});
