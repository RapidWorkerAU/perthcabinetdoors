// THE CALENDAR AND THE FINANCIALS ON A PHONE.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
// Both pages are read standing up: on a site, in the van, on the way to a
// delivery. Three things go wrong on a phone and none of them show on a laptop.
//
//   TEXT THAT RUNS OUT OF ITS BOX. An address pasted from a meeting invite is a
//   Zoom link with no spaces in it. Nothing wraps it unless it is told to, and
//   it walks straight out of the panel.
//
//   TARGETS TOO SMALL TO HIT. A 26px filter pill is a miss.
//
//   INPUTS UNDER 16px. iOS zooms the page on focus and does not zoom back out,
//   so the rest of the page is then off screen. See docs/ui-system-rules.md.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CALENDAR = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
const FINANCIALS = readFileSync(new URL("../app/admin/financials/FinancialsClient.tsx", import.meta.url), "utf8");

// ── Nothing runs out of its box ─────────────────────────────────────────────

test("every free text field in the detail can break a string with no spaces in it", () => {
  // A booking made in Outlook carries whatever somebody typed. One of them was
  // a Zoom URL in the address, which ran out of the panel and over the page.
  const field = CALENDAR.slice(CALENDAR.indexOf("function Field({"), CALENDAR.indexOf("function Field({") + 600);
  assert.match(field, /min-w-0/, "a flex child will not shrink below its content without this");
  assert.match(field, /break-words/, "and a URL has nowhere to break without this");

  for (const marker of ["{booking.notes}", "{booking.syncError}", "{booking.title}</h3>", "{run.name}</h3>"]) {
    const at = CALENDAR.indexOf(marker);
    assert.ok(at > 0, `${marker} is not in the file, so this checks nothing`);
    // The class sits on the element that holds it, within the tag just before.
    const tag = CALENDAR.slice(Math.max(0, at - 400), at);
    assert.match(tag, /break-words/, `${marker} can overflow its container`);
  }
});

test("a bar or a tile truncates rather than spilling over the one beside it", () => {
  // Every one of these sits in a fixed width cell. Without truncate the text
  // just keeps going over whatever is next to it.
  const spans = CALENDAR.match(/<span className="[^"]*truncate[^"]*">/g) || [];
  assert.ok(spans.length >= 8, "the bars and tiles clip their own text");
});

// ── A phone gets a layout of its own ────────────────────────────────────────

test("the phone gets a month of dots and a day list, not a squeezed timeline", () => {
  // A six week timeline needs a metre of width and a week of hour columns is
  // five slivers. Neither is a phone layout.
  assert.match(CALENDAR, /function MobileCalendar/, "there is a layout built for a phone");
  assert.match(CALENDAR, /function dayDots/, "a cell says how much and what kind");
  assert.ok(CALENDAR.includes("dots.slice(0, 3)"), "three dots at most, then a count");
});

test("the phone steps months, whatever the desktop toggle is set to", () => {
  assert.ok(CALENDAR.includes("const phone = useIsMobile(768)"), "the page knows it is on a phone");
  assert.ok(CALENDAR.includes("const shownView = phone ? 'month' : settings.view"), "and the toolbar follows what is drawn");
  assert.ok(CALENDAR.includes("if (phone || settings.view === 'month')"), "so does the range it asks the server for");
});

test("the desktop-only controls are not shown on a phone", () => {
  // The toggle picks between three desktop layouts, and the legend names six
  // colours that the dots underneath already carry.
  assert.ok(CALENDAR.includes('<span className="hidden md:inline-flex">'), "the layout toggle is desktop only");
  assert.match(CALENDAR, /ml-auto hidden flex-wrap[^"]*md:flex/, "so is the legend");
});

test("an empty month still leaves a phone something to navigate with", () => {
  // The empty state replaces the desktop layouts. Replacing the month grid with
  // it would leave somebody on an empty month with nothing to tap.
  assert.ok(CALENDAR.includes('{!hasAnything && !isLoading && (\n        <div className="hidden md:block">'), "the empty state is desktop only");
  assert.ok(CALENDAR.includes("{!isLoading && (\n        <MobileCalendar"), "the phone calendar draws either way");
});

test("everything on a phone is big enough to hit", () => {
  // A month cell, a booking row and a job row are all things a thumb has to
  // land on.
  assert.ok(CALENDAR.includes("min-h-[48px]"), "a day in the month grid");
  assert.ok((CALENDAR.match(/min-h-\[52px\]/g) || []).length >= 2, "the rows under it");
});

// ── Financials ──────────────────────────────────────────────────────────────

test("the period pills are tappable on a phone", () => {
  // Seven of them, and they steer the whole page.
  assert.match(FINANCIALS, /min-h-\[40px\] px-3 text-\[13px\] md:min-h-0 md:h-\[26px\]/, "40px on a phone, 26 on a desktop");
});

test("the ledger tabs are tappable on a phone", () => {
  assert.equal(
    (FINANCIALS.match(/min-h-\[40px\] px-3 text-\[13px\] md:min-h-0 md:py-\[5px\]/g) || []).length,
    2,
    "both tabs"
  );
});

test("no input on the financials page is small enough to make iOS zoom", () => {
  // Any font under 16px zooms the page on focus and does not zoom back out.
  const inputs = FINANCIALS.match(/<input[\s\S]{0,400}?\/>/g) || [];
  assert.ok(inputs.length >= 3, "the search box and the two custom range dates");
  for (const input of inputs) {
    const className = /className="([^"]*)"/.exec(input)?.[1] || "";
    assert.match(className, /text-\[16px\]/, `an input still zooms on focus: ${className.slice(0, 60)}`);
    assert.match(className, /md:text-\[1[12]px\]/, "and goes back to the compact size on a desktop");
  }
});

test("a reference with no spaces in it wraps rather than pushing the amount off the card", () => {
  // The phone card only. The desktop row sits in a container that scrolls
  // sideways on purpose, so it has somewhere to put a long reference.
  const cards = FINANCIALS.slice(FINANCIALS.indexOf('md:hidden flex flex-col'));
  const at = cards.indexOf("{row.ref}</Link>");
  assert.ok(at > 0, "the phone card list is not where this test thinks it is");
  assert.match(cards.slice(Math.max(0, at - 300), at), /break-words/);
});

test("the wide table scrolls inside itself, so the page never scrolls sideways", () => {
  assert.match(FINANCIALS, /hidden md:block overflow-x-auto/, "the desktop ledger");
  assert.match(FINANCIALS, /md:hidden flex flex-col/, "and a phone gets cards instead of it");
});
