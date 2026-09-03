// EVERY WAY OF CHANGING A QUOTE HAS TO ASK WHETHER IT IS LOCKED.
//
// An accepted quote is the record of what was agreed. The order is raised from
// a copy of it, so changing the quote afterwards moves one of the two and not
// the other: the Quote Summary tab on the order and the production sheet then
// describe two different jobs, and nothing anywhere says why. Changes to
// committed work go through a variation, which is priced, sent and approved.
//
// lib/pcd-quote-lock.js enforces that, and it has done since 17 August 2026.
// Quotes accepted before that date could be, and were, edited afterwards. The
// drift on those orders is historical and no code change reaches back for it.
//
// What this file protects is the rule going forward. The lock currently lives
// inside the two shared savers, so a route that writes through them is covered
// without knowing it. That is the right design and also a fragile one: it holds
// only for as long as nothing writes the tables directly. This checks that.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
// fileURLToPath, NOT pathname with the leading slash stripped. That idiom turns
// "/C:/Users/..." into a usable Windows path and "/home/runner/..." into a
// RELATIVE one, so these checks quietly passed here and failed everywhere else
// the first time they were ever run outside Windows.
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const API = join(ROOT, "app", "api");
const SAVER = join(ROOT, "app", "api", "admin", "quotes", "[id]", "_quote-line-save.js");

function walk(dir, hits = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, hits);
    else if (/\.(js|ts)$/.test(entry)) hits.push(full);
  }
  return hits;
}

function name(file) {
  return relative(ROOT, file).split("\\").join("/");
}

// The tables that hold what a quote SAYS. Money and status live elsewhere on
// purpose: accepting a quote, recording a payment and sending it all write to
// pcd_quotes and none of them change the work.
const QUOTE_SPEC_TABLES = ["pcd_quote_line_items", "pcd_cabinet_configs"];
const WRITE = /\.(?:update|insert|upsert|delete)\s*\(/;

const files = walk(API);

test("the api folder was actually walked", () => {
  assert.ok(files.length > 20, `only found ${files.length} route files, which cannot be right`);
});

// ── the savers are where the lock lives ────────────────────────────────────
//
// Everything else depends on this being true, so it is asserted rather than
// assumed. If the lock is ever moved out of here, every route that writes
// through these silently loses it and the tests below would still pass.

test("saveQuoteLine refuses to write a locked quote", () => {
  const source = readFileSync(SAVER, "utf8");
  const body = source.slice(source.indexOf("export async function saveQuoteLine"));
  const untilNext = body.slice(0, body.indexOf("export async function", 10));
  assert.match(untilNext, /assertQuoteEditable/, "saveQuoteLine is where the lock has to be, and it is not there");
});

test("deleteQuoteLine refuses to touch a locked quote", () => {
  const source = readFileSync(SAVER, "utf8");
  const body = source.slice(source.indexOf("export async function deleteQuoteLine"));
  const untilNext = body.slice(0, body.indexOf("export async function", 10) + 1 || undefined);
  assert.match(untilNext, /assertQuoteEditable/, "deleteQuoteLine is where the lock has to be, and it is not there");
});

// ── nothing may write around the savers ────────────────────────────────────
//
// A route that touches pcd_quote_line_items or pcd_cabinet_configs itself does
// not go through the lock, so it has to call it. This is the check that the
// saver-based design keeps holding.

const EXEMPT = new Map([
  [
    "app/api/admin/quotes/[id]/duplicate/route.js",
    "writes the lines of the NEW quote it just created, never the one it copied from",
  ],
  [
    "app/api/admin/quote-requests/route.js",
    "builds a brand new quote out of a request, so there is no order it could be behind",
  ],
  ["app/api/admin/quotes/route.js", "creates quotes"],
  ["app/api/admin/quotes/[id]/_quote-line-save.js", "is the saver, and is checked directly above"],
]);

const directWriters = files.filter((file) => {
  const source = readFileSync(file, "utf8");
  return QUOTE_SPEC_TABLES.some((table) => {
    let at = source.indexOf(`"${table}"`);
    while (at >= 0) {
      // The write is chained onto the .from(), so it lands within a few lines.
      if (WRITE.test(source.slice(at, at + 400))) return true;
      at = source.indexOf(`"${table}"`, at + 1);
    }
    return false;
  });
});

test("some route writes quote lines, so this test is checking something", () => {
  assert.ok(directWriters.length > 0, "found nothing that writes a quote line");
});

directWriters.forEach((file) => {
  const routeName = name(file);
  test(`${routeName} does not write a quote line around the lock`, () => {
    if (EXEMPT.has(routeName)) return; // reason recorded on the list above
    assert.match(
      readFileSync(file, "utf8"),
      /assertQuoteEditable|orderForQuote/,
      "this writes what a quote says without going through saveQuoteLine or deleteQuoteLine, so it " +
        "skips the lock and can rewrite an accepted quote under a live order. Call assertQuoteEditable, " +
        "or add it to EXEMPT with the reason it is safe."
    );
  });
});

// An exemption that no longer matches a real file is an exemption nobody is
// reading. It would also quietly excuse a NEW file that took the same path.
test("every exemption still points at a route that writes", () => {
  const names = new Set(directWriters.map(name));
  const stale = [...EXEMPT.keys()].filter((entry) => !names.has(entry));
  assert.deepEqual(stale, [], `these exemptions no longer match a route that writes quote lines: ${stale.join(", ")}`);
});

// ── the refusal has to read as a rule, not a crash ─────────────────────────

test("a locked quote refuses with a status the screen can act on", () => {
  const lock = readFileSync(join(ROOT, "lib", "pcd-quote-lock.js"), "utf8");
  assert.match(lock, /error\.status\s*=\s*409/, "the lock must carry a 409 so a refusal is not mistaken for a crash");
  assert.match(lock, /QUOTE_LOCKED_MESSAGE/, "the refusal has to name the order the quote became");
});

// Stage Quote reached the lock through the savers, but reported its refusal as
// a 500: "Import failed", with the real reason buried in the message. Somebody
// reading that screen has no way to tell a rule from a broken system.
test("Stage Quote passes the lock's refusal through instead of flattening it to a crash", () => {
  const importer = readFileSync(
    join(ROOT, "app", "api", "admin", "design", "projects", "[projectId]", "import", "route.js"),
    "utf8"
  );
  assert.match(
    importer,
    /status:\s*error\?\.status\s*\|\|\s*500/,
    "a locked quote has to come back as its own 409, or Stage Quote reports a rule as an unexplained failure"
  );
  assert.match(
    importer,
    /assertQuoteEditable/,
    "Stage Quote must refuse before it generates and prices an import nobody can commit"
  );
});
