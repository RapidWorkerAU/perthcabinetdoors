// THE DASHBOARD'S WEBSITE PANEL, AND THE DETAIL PREFERENCE ON IT.
//
// ── WHAT REPLACED WHAT ───────────────────────────────────────────────────────
//
// The dashboard used to carry a ranked copy of the board. It was accurate and
// it was still wrong to have: the same work in two places is two places to keep
// in step, and only the board can set a card aside. In its place is the one
// question the board cannot answer, which is whether the website is bringing
// anything in.
//
// ── THE THREE THINGS THAT MUST STAY TRUE ─────────────────────────────────────
//
//   HOW MUCH DETAIL IS THE PERSON'S OWN SETTING. Not a decision made once in
//   code. Set on the page, remembered in a cookie, and never asked about again.
//
//   THE COOKIE IS READ BY THE SERVER. It has to be, or the standard view paints
//   and then rearranges itself while somebody is reading it. Which means the
//   name and the reader cannot live in a 'use client' file.
//
//   FIGURES, NEVER VERDICTS. Show the number and the change since last period.
//   Never "traffic is healthy": too many of the variables that would decide
//   that live outside the database.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const PAGE   = read("app/admin/dashboard/page.tsx");
const CLIENT = read("app/admin/dashboard/DashboardClient.tsx");
const PANELS = read("app/admin/dashboard/_components/WebsitePanels.tsx");
const TOGGLE = read("app/admin/dashboard/_components/DetailToggle.tsx");
const DETAIL = read("app/admin/dashboard/_components/detail.ts");
const BARS   = read("app/admin/dashboard/_components/DayBars.tsx");

// ── the detail preference ───────────────────────────────────────────────────

test("the detail preference is read on the server, so nothing rearranges itself", () => {
  // A cookie goes up with the request. Browser storage can only be read after
  // hydration, which means the wrong layout paints first and then moves.
  assert.match(PAGE, /import \{ cookies \} from 'next\/headers'/);
  assert.match(PAGE, /readDetail\(jar\.get\(DETAIL_COOKIE\)\?\.value\)/);
  assert.ok(!/localStorage/.test(PAGE) && !/localStorage/.test(CLIENT), "the preference is not a cookie");
});

test("the server never imports a function out of a client module", () => {
  // THE FOOTGUN THIS PINS. Every export of a 'use client' file is turned into a
  // client reference by the bundler, so a server component that imports a plain
  // function from one gets a proxy and throws the moment it calls it. The page
  // is a server component, so the cookie name and the reader live in a file
  // with no 'use client' on it.
  assert.ok(!/^\s*['"]use client['"]/m.test(DETAIL), "detail.ts must not be a client module");
  assert.match(PAGE, /from '\.\/_components\/detail'/);
  assert.ok(!/readDetail.*from '\.\/_components\/DetailToggle'/.test(PAGE), "the page is importing across the boundary");
});

test("choosing a detail level writes the cookie that the server will read back", () => {
  assert.match(TOGGLE, /document\.cookie = `\$\{DETAIL_COOKIE\}=\$\{next\}/);
  assert.match(TOGGLE, /max-age=31536000/, "the preference should outlast the session");
  // A browser refusing cookies means it is not remembered, not that the page
  // breaks. Every write is wrapped.
  assert.match(TOGGLE, /try \{[\s\S]{0,200}document\.cookie[\s\S]{0,200}\} catch/);
});

test("the toggle is on the dashboard itself, not in a settings screen", () => {
  assert.match(CLIENT, /<DetailToggle value=\{detail\} onChange=\{setDetail\} \/>/);
  // Seeded from what the server already read, so the two can never disagree.
  assert.match(CLIENT, /useState<Detail>\(initialDetail\)/);
});

test("a cookie we do not recognise falls back instead of emptying the page", () => {
  assert.match(DETAIL, /DETAIL_LEVELS\.includes\(value as Detail\) \? \(value as Detail\) : DEFAULT_DETAIL/);
});

// ── what the panel may and may not do ───────────────────────────────────────

test("the panel reports figures and never passes judgement on them", () => {
  // Same reason the board does not tell anybody whether they are at capacity.
  // Only words that could not plausibly be anything but a judgement, so this
  // catches the sentence being added rather than tripping over a variable name.
  const verdicts = /\b(healthy|unhealthy|excellent|underperform\w*|on track|doing well|needs attention|at capacity)\b/i;
  // Comments stripped first. The file explaining why it must not say "traffic
  // is healthy" is not the file saying it.
  const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  [CLIENT, PANELS].forEach((source) => {
    const found = withoutComments(source).match(verdicts);
    assert.ok(!found, `a verdict reached the screen: ${found?.[0]}`);
  });
});

test("with nothing collected the tiles say so rather than showing a nought", () => {
  // A zero is a claim that nobody visited. Not having looked is a different
  // thing and has to read differently.
  assert.match(CLIENT, /waiting: !site\.collecting/);
  assert.match(CLIENT, /Not collected yet/);
  assert.match(PANELS, /No visit figures yet/);
});

test("the two charts are two charts, not two lines on one axis", () => {
  // Visits and design tool starts are an order of magnitude apart. On one axis
  // the smaller one flattens along the floor and the chart invents a pattern
  // that is not in the data. This is the single most common charting mistake
  // and it is worth a test rather than a comment.
  const charts = PANELS.match(/<ChartPanel/g) || [];
  assert.equal(charts.length, 2, "there should be exactly two day charts");
  assert.match(PANELS, /its own scale, deliberately/);
  assert.ok(!/secondSeries|series2|rightAxis|yAxisRight/i.test(BARS), "the chart has grown a second axis");
});

test("the chart does not put a number on every bar", () => {
  // Thirty numbers is a table wearing a chart's clothes. The last day and the
  // busiest day, and everything else on hover or in the table underneath.
  assert.match(BARS, /\[last, peakIndex\]/);
});

test("the exact numbers are always one click away", () => {
  // A bar chart cannot be read by a screen reader and is awkward to read exact
  // values off for anybody, so the same figures are available as a table.
  assert.match(PANELS, /Show the numbers/);
  assert.match(BARS, /aria-label=\{`\$\{longDay\(point\.day\)\}/);
});

test("no figure is worked out on the page", () => {
  // Everything arrives finished from lib/pcd-site-stats.js. This is the rule the
  // old financial panel broke. test/financials-page.test.mjs holds the same line
  // for the two dashboard files; this extends it to the panels themselves.
  // One reduce, and it picks the busiest day rather than adding anything up.
  assert.equal((PANELS.match(/\.reduce\(/g) || []).length, 1, "the panel is working figures out for itself");
  assert.match(PANELS, /const peakOf[\s\S]{0,200}\.reduce\(/, "and the one reduce is not the one we expected");
  assert.ok(!/\.length \/ /.test(PANELS), "the panel is working out a rate");
});

test("a source that will not load is said out loud", () => {
  // An empty panel and a broken query look identical, and the second one is the
  // dangerous one.
  assert.match(PANELS, /site\.problems\.length > 0/);
  assert.match(PANELS, /could not be loaded just now/);
});
