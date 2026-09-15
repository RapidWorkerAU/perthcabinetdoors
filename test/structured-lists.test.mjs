// VOCABULARIES ARE PICKED FROM, NOT TYPED.
//
// A field that is plainly a set of words, left as a text box, becomes several
// fields. The live board library proved it: three finishes each existed twice,
// purely from typing.
//
//     "Absolute Grain" and "AbsoluteGrain"
//     "Absolute Matt"  and "AbsoluteMatte"
//     "Raw"            and "Raw Finish"
//
// Nothing rejected them because nothing could: to the database they are six
// different words. Every screen that groups or filters by finish then read six
// finishes, so /finishes listed one twice and a quote could be written against
// either spelling.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LIST_KEYS, LISTS, isListKey } from "../lib/pcd-lists.js";
import { COLOUR_FINISHES } from "../lib/pcd-colour-library.js";
import { HARDWARE_BRANDS } from "../lib/pcd-hardware-types.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the finishes and the hardware brands are vocabularies", () => {
  for (const key of ["colour_finishes", "hardware_brands"]) {
    assert.ok(LIST_KEYS.includes(key), `${key} is a list`);
    assert.equal(isListKey(key), true, `${key} can be added to through the API`);
    assert.ok(LISTS.find((list) => list.key === key).builtin.length, `${key} starts with what we already use`);
  }
});

// THE SEED IS THE TRUTH, NOT THE MESS. The duplicates are the reason the list
// exists, so shipping them as options would hand the fault back.
test("the seeded finishes carry no duplicate spellings", () => {
  const key = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const seen = new Map();
  for (const finish of COLOUR_FINISHES) {
    const k = key(finish);
    assert.equal(seen.has(k), false, `${finish} is ${seen.get(k)} spelt another way`);
    seen.set(k, finish);
  }

  for (const gone of ["AbsoluteGrain", "AbsoluteMatte", "Raw Finish"]) {
    assert.equal(COLOUR_FINISHES.includes(gone), false, `${gone} must not be offered as its own finish`);
  }
  for (const kept of ["Absolute Grain", "Absolute Matt", "Raw", "Woodmatt", "Matt"]) {
    assert.ok(COLOUR_FINISHES.includes(kept), `${kept} is a real finish and has to stay`);
  }
});

test("the hardware brands are brands, not product names", () => {
  assert.ok(HARDWARE_BRANDS.includes("Blum"));
  // "Strip Light" sits in the brand column on a live row. It is what the thing
  // IS, not who makes it, so it is not seeded as a brand: whoever edits that row
  // next is offered the real brands instead of having the mistake blessed.
  assert.equal(HARDWARE_BRANDS.includes("Strip Light"), false);
});

// ── THE CONTROL ITSELF ──────────────────────────────────────────────────────

test("the picker is a real select, not a suggesting text box", () => {
  const field = read("components/admin/ListField.js");
  assert.match(field, /<select/, "a datalist suggests and then accepts anything anyway");
  assert.ok(!/<input[^>]*\blist=/.test(field), "no datalist");
  assert.match(field, /Add new\.\.\./, "and a deliberate way to add a word");
});

test("adding a word adds it to the vocabulary, not just to this record", () => {
  const field = read("components/admin/ListField.js");
  assert.match(field, /fetch\("\/api\/admin\/lists"/, "it reaches the same list Settings edits");
  assert.match(field, /forgetLists\(\)/, "and every other field on the screen sees it straight away");
  // A word that never reaches the list is the original fault wearing a hat.
  assert.match(field, /option\.label\.toLowerCase\(\) === label\.toLowerCase\(\)/, "and the same word twice is refused");
});

test("both screens use the picker rather than a text box", () => {
  const colours = read("app/admin/options/ColourLibraryManager.tsx");
  assert.match(colours, /listKey="colour_finishes"/);
  assert.ok(!/placeholder="e\.g\. Woodmatt"/.test(colours), "the free text finish box is gone");

  const hardware = read("app/admin/hardware/HardwareManager.js");
  assert.match(hardware, /listKey="hardware_brands"/);
  assert.ok(!/placeholder="e\.g\. Blum, Hafele"/.test(hardware), "the free text brand box is gone");
});

// A record keeps what it holds even after an option is retired. This is the
// rule the whole lists mechanism exists to protect, and the picker has to
// honour it or switching a finish off would blank every colour using it.
test("a value already on a record survives its option being retired", async () => {
  const { optionsFor } = await import("../lib/pcd-lists.js");
  const items = [{ id: "1", list_key: "colour_finishes", key: "Matt", label: "Matt", is_active: true, sort_order: 10, extras: {} }];
  const offered = optionsFor(items, "Woodmatt");
  assert.ok(offered.some((option) => option.key === "Woodmatt"), "the held value is still in its own dropdown");
  assert.ok(offered.find((option) => option.key === "Woodmatt").retired, "and is marked, so nobody wonders why");
});
