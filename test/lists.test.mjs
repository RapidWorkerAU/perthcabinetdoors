// SETTINGS, LISTS: the dropdown vocabularies you can add to yourself.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   NOTHING IS EVER DELETED. There is no delete route anywhere in the feature.
//   Records already hold these values, and removing an item would leave an
//   order from last year saying nothing about what went wrong with it.
//
//   A SWITCHED OFF ITEM STILL SHOWS ON RECORDS THAT USE IT. This is the whole
//   point of the feature and the easiest thing to get wrong: a dropdown built
//   only from the active items would show blank on that order, or silently
//   change it to the first option in the list.
//
//   THE KEY NEVER MOVES. The name is editable precisely so the stored value
//   never has to be. Renaming an item must not orphan what refers to it.
//
//   ONLY SAFE LISTS ARE IN HERE. Workflow statuses, field maps and anything
//   with geometry behind it must stay in code, because a new value would sail
//   past the code that branches on them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  LISTS,
  LIST_KEYS,
  activeOnly,
  builtinItems,
  cleanExtras,
  groupByList,
  isListKey,
  itemKeyFrom,
  keyAsWords,
  labelFor,
  listSpec,
  normaliseListItem,
  optionsFor,
  validateNewItem,
} from "../lib/pcd-lists.js";
import { validateIssue } from "../lib/pcd-order-issues.js";
import { isSettlementMethod, settlementWantsReference } from "../lib/pcd-payment-settlement.js";
import { normaliseSupplierName } from "../lib/pcd-colour-library.js";
import { QUOTE_STATUSES, ORDER_STATUSES } from "../lib/pcd-quote-utils.js";
import { dismissNote, isDismissReason } from "../lib/pcd-board-dismissal.js";

// ── what is in, and what is deliberately out ────────────────────────────────

test("every list is a vocabulary, and the load bearing ones are not here", () => {
  // If any of these ever turn up in the Lists screen, somebody can add a quote
  // status that the document lock, the board and the conversion report have
  // never heard of.
  const banned = ["quote_statuses", "order_statuses", "variation_statuses", "line_statuses", "production_stages", "job_cost_types"];
  for (const key of banned) {
    assert.equal(isListKey(key), false, `${key} must not be editable`);
  }
  // And the constants they come from are untouched by any of this.
  assert.ok(QUOTE_STATUSES.includes("draft") && ORDER_STATUSES.includes("active"));
});

test("every list explains itself and says where it is used", () => {
  assert.ok(LISTS.length >= 5);
  for (const spec of LISTS) {
    assert.ok(spec.key && spec.label, `incomplete list: ${spec.key}`);
    assert.ok(spec.note?.length > 10, `${spec.key} does not explain what it is`);
    assert.ok(spec.where?.length > 5, `${spec.key} does not say where it is used`);
    assert.ok(Array.isArray(spec.builtin) && spec.builtin.length, `${spec.key} has no starting items`);
  }
  assert.equal(new Set(LIST_KEYS).size, LISTS.length, "duplicate list keys");
});

test("note sources were taken out again, because nobody picks one", () => {
  // A note's source is decided by which field it came from. A list you can add
  // to that nothing writes and nothing reads is worse than not offering it.
  assert.equal(isListKey("note_sources"), false);
});

test("the built-in items keep the order they have always appeared in", () => {
  const kinds = builtinItems("issue_kinds");
  assert.equal(kinds[0].label, "Damaged in production");
  assert.equal(kinds[kinds.length - 1].label, "Something else", "Something else belongs last");
  // Spaced in tens so an item can be dropped between two without renumbering.
  assert.deepEqual(kinds.slice(0, 3).map((item) => item.sort_order), [0, 10, 20]);
});

// ── the rule the whole feature exists for ───────────────────────────────────

test("a switched off item is not offered on anything new", () => {
  const items = [
    normaliseListItem({ list_key: "issue_kinds", item_key: "wrong_size", label: "Wrong size", sort_order: 0 }),
    normaliseListItem({ list_key: "issue_kinds", item_key: "retired", label: "Old one", sort_order: 10, is_active: false }),
  ];
  assert.deepEqual(activeOnly(items).map((item) => item.key), ["wrong_size"]);
  assert.deepEqual(optionsFor(items, "").map((item) => item.key), ["wrong_size"]);
});

test("but a record already using it still shows it, marked retired", () => {
  // THE ONE THAT MATTERS. Without this an order raised last year shows blank,
  // or silently becomes whatever is first in the list.
  const items = [
    normaliseListItem({ list_key: "issue_kinds", item_key: "wrong_size", label: "Wrong size", sort_order: 0 }),
    normaliseListItem({ list_key: "issue_kinds", item_key: "retired", label: "Old one", sort_order: 10, is_active: false }),
  ];
  const offered = optionsFor(items, "retired");
  assert.deepEqual(offered.map((item) => item.key), ["wrong_size", "retired"]);
  assert.equal(offered[1].retired, true, "so the screen can say why it is there");
});

test("a value from before any of this existed is shown rather than dropped", () => {
  const offered = optionsFor([], "some_old_value");
  assert.equal(offered.length, 1);
  assert.equal(offered[0].key, "some_old_value");
  assert.equal(offered[0].label, "Some old value", "read as words, not left as a code");
  assert.equal(offered[0].retired, true);
});

test("an active item does not get added twice when a record already holds it", () => {
  const items = [normaliseListItem({ list_key: "issue_kinds", item_key: "wrong_size", label: "Wrong size" })];
  assert.deepEqual(optionsFor(items, "wrong_size").map((item) => item.key), ["wrong_size"]);
});

// ── keys and names ──────────────────────────────────────────────────────────

test("the key is made from the name once, and stays readable", () => {
  assert.equal(itemKeyFrom("Damaged in transit"), "damaged_in_transit");
  assert.equal(itemKeyFrom("  Wrong Colour / Finish  "), "wrong_colour_finish");
  assert.equal(itemKeyFrom("Bank & cheque"), "bank_and_cheque");
  // And it reads back as the right words, which is what keeps a custom item
  // legible in a PDF built where the list cannot be reached.
  assert.equal(keyAsWords("damaged_in_transit"), "Damaged in transit");
});

test("renaming an item cannot change what records hold", () => {
  // The screen edits the label. The key is written once and never patched, so
  // this pins that the route never accepts one.
  const route = readFileSync(new URL("../app/api/admin/lists/[id]/route.js", import.meta.url), "utf8");
  assert.ok(!/patch\.item_key/.test(route), "the key must never be patched");
  assert.ok(!/patch\.list_key/.test(route), "an item must not move between lists");
  assert.match(route, /typeof payload\.label === "string"/, "the label is what can be edited");
});

test("a label falls back through the list, the built-ins, then the key", () => {
  const items = [normaliseListItem({ list_key: "issue_kinds", item_key: "custom", label: "Our own one" })];
  assert.equal(labelFor(items, "custom"), "Our own one");
  assert.equal(labelFor([], "wrong_size", "issue_kinds"), "Wrong size", "built-ins answer when the list is out of reach");
  assert.equal(labelFor([], "never_heard_of_it"), "Never heard of it");
  assert.equal(labelFor([], ""), "");
});

// ── adding ──────────────────────────────────────────────────────────────────

test("an item needs a name worth having", () => {
  assert.match(validateNewItem("issue_kinds", { label: "" }).label, /Give it a name/);
  assert.match(validateNewItem("issue_kinds", { label: "x" }).label, /Give it a name/);
  assert.match(validateNewItem("issue_kinds", { label: "!!!" }).label, /letter or number/);
  assert.deepEqual(validateNewItem("issue_kinds", { label: "Damaged in transit" }), {});
});

test("adding something already on the list says to switch it back on", () => {
  const existing = [normaliseListItem({ list_key: "issue_kinds", item_key: "wrong_size", label: "Wrong size", is_active: false })];
  // Case and punctuation ignored, or "Wrong Size" and "wrong size" become two
  // items that read identically in a dropdown.
  const errors = validateNewItem("issue_kinds", { label: "Wrong Size" }, existing);
  assert.match(errors.label, /Switch it back on/);
});

test("a list whose items carry settings will not take one without them", () => {
  assert.match(validateNewItem("production_timeframes", { label: "5 weeks" }).days, /has to be a number/);
  assert.match(validateNewItem("production_timeframes", { label: "5 weeks", extras: { days: 0 } }).days, /above zero/);
  assert.deepEqual(validateNewItem("production_timeframes", { label: "5 weeks", extras: { days: 35 } }), {});

  assert.match(validateNewItem("dismiss_reasons", { label: "Wrong number" }).words, /is needed/);
  assert.deepEqual(
    validateNewItem("dismiss_reasons", { label: "Wrong number", extras: { words: "Not the right person." } }),
    {}
  );
});

test("settings are kept to the fields that list actually has", () => {
  const extras = cleanExtras("settlement_methods", { wantsReference: "yes", sneaky: "dropped" });
  assert.deepEqual(extras, { wantsReference: true });
  assert.deepEqual(cleanExtras("production_timeframes", { days: "35" }), { days: 35 });
  assert.deepEqual(cleanExtras("issue_kinds", { anything: 1 }), {}, "a plain list carries no settings");
});

test("an unknown list cannot be added to", () => {
  assert.match(validateNewItem("quote_statuses", { label: "On hold" }).list, /not a list you can add to/);
  assert.equal(listSpec("quote_statuses"), null);
});

// ── nothing anywhere deletes ────────────────────────────────────────────────

test("there is no delete handler on any lists route", () => {
  for (const path of ["../app/api/admin/lists/route.js", "../app/api/admin/lists/[id]/route.js", "../app/api/admin/lists/order/route.js"]) {
    const url = new URL(path, import.meta.url);
    assert.ok(existsSync(url), `${path} is missing`);
    const source = readFileSync(url, "utf8");
    assert.ok(!/export async function DELETE/.test(source), `${path} has a delete handler`);
  }
});

test("the screen offers Off rather than a way to remove something", () => {
  const screen = readFileSync(new URL("../app/admin/_components/ListsManager.tsx", import.meta.url), "utf8");
  assert.match(screen, /In use/);
  assert.match(screen, /Nothing on this screen deletes anything/, "the screen has to say so, or Off reads as gone");
  // No delete ACTION. The sentence above says the word, which is the point of
  // it, so what this looks for is a request that would remove something.
  assert.ok(!/method:\s*['"]DELETE['"]/.test(screen), "the screen makes a delete request");
  assert.ok(!/>\s*(Delete|Remove)\b/.test(screen), "the screen offers a delete button");
});

test("the migration seeds what the code already holds, and can be run twice", () => {
  const sql = readFileSync(new URL("../supabase/202608281000_pcd_list_items.sql", import.meta.url), "utf8");
  assert.match(sql, /on conflict \(list_key, item_key\) do nothing/, "a second run must add nothing");
  assert.match(sql, /create unique index if not exists pcd_list_items_key/);
  // Every list in the code has to be seeded, or its screen opens empty.
  for (const key of LIST_KEYS) {
    assert.ok(sql.includes(`('${key}',`), `${key} is not seeded by the migration`);
  }
});

// ── the screen's own shape ──────────────────────────────────────────────────

test("grouping puts every item under its own list and loses none", () => {
  const rows = [
    { list_key: "issue_kinds", item_key: "a", label: "A", sort_order: 10 },
    { list_key: "issue_kinds", item_key: "b", label: "B", sort_order: 0 },
    { list_key: "colour_suppliers", item_key: "Polytec", label: "Polytec", sort_order: 0 },
  ];
  const grouped = groupByList(rows);
  const kinds = grouped.filter((list) => list.key === "issue_kinds")[0];
  assert.deepEqual(kinds.items.map((item) => item.key), ["b", "a"], "ordered by position, not read order");
  assert.equal(grouped.filter((list) => list.key === "colour_suppliers")[0].items.length, 1);
  assert.equal(grouped.length, LISTS.length, "every list is shown, even an empty one");
});

test("a row with no active flag is on, not off", () => {
  // A column added later must not silently hide every existing item.
  assert.equal(normaliseListItem({ item_key: "x", label: "X" }).is_active, true);
  assert.equal(normaliseListItem({ item_key: "x", label: "X", is_active: false }).is_active, false);
});

// ── the consumers keep working ──────────────────────────────────────────────

test("a reason somebody added themselves is accepted and writes its own words", () => {
  // Without this the button on the board would do nothing: the API validated
  // against the built-in keys only.
  const custom = [{ key: "wrong_number", label: "Wrong number", is_active: true, extras: { words: "Not the right person." } }];
  assert.equal(isDismissReason("wrong_number"), false, "not a built-in");
  assert.equal(isDismissReason("wrong_number", custom), true, "but a real one once it is on the list");
  assert.match(dismissNote("A quote", "wrong_number", "", custom), /Not the right person\./);
});

test("a switched off reason is not accepted on anything new", () => {
  const off = [{ key: "wrong_number", label: "Wrong number", is_active: false, extras: { words: "x" } }];
  assert.equal(isDismissReason("wrong_number", off), false);
});

test("the built-in reasons still work with nothing passed at all", () => {
  assert.equal(isDismissReason("spam"), true);
  assert.match(dismissNote("A card", "spam", ""), /Spam or junk\./);
});

// ── THE WIRING ──────────────────────────────────────────────────────────────
//
// Adding an item is only half of it. Every place that VALIDATES one of these
// values has to read the live list too, or the dropdown offers something the
// server then refuses and the button appears to do nothing. These pin each one.

test("an issue kind somebody added is accepted, not refused on save", () => {
  const custom = [{ key: "damaged_in_transit", label: "Damaged in transit", is_active: true }];
  const draft = { kind: "damaged_in_transit", detail: "Arrived with a corner knocked off." };
  assert.match(validateIssue(draft).kind, /Choose what is wrong/, "not a built-in");
  assert.deepEqual(validateIssue(draft, custom), {}, "but fine once it is on the list");
});

test("an issue kind switched off is not accepted on anything new", () => {
  const off = [{ key: "damaged_in_transit", label: "Damaged in transit", is_active: false }];
  assert.match(validateIssue({ kind: "damaged_in_transit", detail: "Something happened." }, off).kind, /Choose what is wrong/);
});

test("owner and blocks stay fixed, whatever is passed", () => {
  // Both decide which side of the board a card lands on, so a value nothing
  // branches on would land it nowhere.
  const errors = validateIssue({ kind: "wrong_size", detail: "Too short.", owner: "somebody_else", blocks: "maybe" });
  assert.match(errors.owner, /Choose who has to fix it/);
  assert.match(errors.blocks, /Choose whether it stops the job/);
});

test("a payment method somebody added is accepted, and its reference rule is used", () => {
  const custom = [{ key: "direct_debit", label: "Direct debit", is_active: true, extras: { wantsReference: true } }];
  assert.equal(isSettlementMethod("direct_debit"), false, "not a built-in");
  assert.equal(isSettlementMethod("direct_debit", custom), true);
  assert.equal(settlementWantsReference("direct_debit"), false, "no rule without the list");
  assert.equal(settlementWantsReference("direct_debit", custom), true, "and the tick is honoured with it");
});

test("a brand added in Settings keeps the exact spelling it was given", () => {
  // Otherwise "IKEA" is title-cased into "Ikea" on the way into the database.
  const brands = [{ key: "IKEA", label: "IKEA" }];
  assert.equal(normaliseSupplierName("IKEA"), "Ikea", "the fallback title-cases");
  assert.equal(normaliseSupplierName("ikea", brands), "IKEA", "the list is the speller");
  assert.equal(normaliseSupplierName("polytec"), "Polytec", "built-ins unchanged");
});

test("every route that validates one of these values reads the live list", () => {
  const wired = [
    ["../app/api/admin/orders/[id]/issues/route.js", "issue_kinds"],
    ["../app/api/admin/orders/[id]/payments/[paymentId]/settle/route.js", "settlement_methods"],
    ["../app/api/admin/board/dismiss/route.js", "dismiss_reasons"],
  ];
  for (const [path, listKey] of wired) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /loadListItems/, `${path} does not read the lists`);
    assert.ok(source.includes(`"${listKey}"`), `${path} does not read ${listKey}`);
  }
});

test("every screen that offers one of these lists reads it live", () => {
  const wired = [
    ["../app/admin/orders/[id]/OrderDetail.js", ["issue_kinds", "production_timeframes"]],
    ["../app/admin/_components/SettlePaymentModal.js", ["settlement_methods"]],
    ["../app/admin/board/BoardClient.tsx", ["dismiss_reasons"]],
    ["../app/admin/options/ColourLibraryManager.tsx", ["colour_suppliers"]],
    ["../app/admin/profiles/ProfileLibraryManager.js", ["profile_suppliers"]],
  ];
  for (const [path, keys] of wired) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /useLists/, `${path} does not use the lists hook`);
    for (const key of keys) {
      assert.ok(source.includes(`'${key}'`) || source.includes(`"${key}"`), `${path} does not read ${key}`);
    }
  }
});

test("nothing rewrites a supplier it does not recognise any more", () => {
  // Both libraries used to fall back to Polytec whenever the brand was not in a
  // hardcoded list, which silently changed one brand into another.
  for (const path of ["../app/admin/options/ColourLibraryManager.tsx", "../lib/pcd-profile-library.js"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(
      !/SUPPLIERS\.includes\(normaliseSupplierName/.test(source),
      `${path} still rewrites an unrecognised brand`
    );
  }
});

test("the lists that come from the libraries are left alone", () => {
  // Thickness follows the material, and materials come from lib/pcd-materials.js.
  // None of that is editable in Settings and none of it should have moved.
  const materials = readFileSync(new URL("../lib/pcd-materials.js", import.meta.url), "utf8");
  assert.ok(!/pcd-lists|pcd-list-load|useLists/.test(materials), "materials must not read the Lists table");
  assert.equal(isListKey("materials"), false);
  assert.equal(isListKey("thicknesses"), false);
});
