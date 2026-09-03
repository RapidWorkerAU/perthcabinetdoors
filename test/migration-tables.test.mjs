// EVERY TABLE A MIGRATION NAMES HAS TO BE A REAL TABLE.
//
// This exists because of one that was not. A migration meant to bring order
// lines into line with their quote wrote to `pcd_order_items`. The table is
// called `pcd_order_line_items`. Worse, the statement was wrapped in an "if the
// table exists" guard, so it did not fail: it did nothing, said nothing, and
// reported success, and the orders kept the old spelling while the quotes moved
// on. Nobody would find that until the workshop paperwork disagreed with the
// quote in front of a customer.
//
// A typo in a table name is invisible in review and invisible at run time. It is
// only visible against a list of the tables that really exist, which is what
// this does: the app is the list. If the app never touches a table, either the
// name is wrong or the table is dead, and both are worth stopping for.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
// fileURLToPath, NOT pathname with the leading slash stripped. That idiom turns
// "/C:/Users/..." into a usable Windows path and "/home/runner/..." into a
// RELATIVE one, so these checks quietly passed here and failed everywhere else
// the first time they were ever run outside Windows.
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, hits = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, hits);
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry)) hits.push(full);
  }
  return hits;
}

// Every pcd_ name the running application actually reads or writes.
const LIVE = new Set();
for (const dir of ["app", "lib", "components"]) {
  let files = [];
  try {
    files = walk(join(ROOT, dir));
  } catch {
    continue; // a folder this project does not have
  }
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/pcd_[a-z0-9_]+/g)) LIVE.add(match[0]);
  }
}

// Named in SQL but never in the app: postgres functions and triggers, which are
// called by name from SQL rather than from JavaScript. Each was checked by hand
// when it was added here.
const SQL_ONLY = new Set(["pcd_board_message_state", "pcd_set_updated_at", "pcd_touch_updated_at"]);

const SQL_DIR = join(ROOT, "supabase");
const sqlFiles = readdirSync(SQL_DIR).filter((name) => name.endsWith(".sql"));

test("the supabase folder has migrations to check", () => {
  assert.ok(sqlFiles.length > 0, "no .sql files found, so this test is checking nothing");
});

test("the app itself names tables, so the list to check against is not empty", () => {
  assert.ok(LIVE.size > 20, `only found ${LIVE.size} pcd_ names in the app, which cannot be right`);
});

// A migration is allowed to write to a table it creates in the same file.
function createdIn(sql, table) {
  const pattern = `create\\s+(?:or\\s+replace\\s+)?(?:temp\\s+|temporary\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\b`;
  return new RegExp(pattern, "i").test(sql);
}

sqlFiles.forEach((name) => {
  test(`${name} only writes to tables that exist`, () => {
    const sql = readFileSync(join(SQL_DIR, name), "utf8");
    const unknown = new Set();
    // The three statements that silently miss every row when the name is wrong.
    // A create or an alter names a table into existence, so those are not here.
    const pattern = /\b(?:update|insert\s+into|delete\s+from)\s+(?:public\.)?(pcd_[a-z0-9_]+)/gi;
    for (const [, table] of sql.matchAll(pattern)) {
      const found = table.toLowerCase();
      if (!LIVE.has(found) && !SQL_ONLY.has(found) && !createdIn(sql, found)) unknown.add(found);
    }
    assert.deepEqual(
      [...unknown],
      [],
      `no such table, so this migration writes to nothing: ${[...unknown].join(", ")}`
    );
  });
});

// The guard that turned a wrong table name into a silent success.
//
// Checking information_schema before a data fix is usually right: three files
// here add a column and backfill it in the same block, and the check is what
// makes them safe to run twice. The broken one added nothing. It only asked
// whether a table it was about to write to was there, and quietly walked away
// when it was not, which is indistinguishable from a typo in the name.
//
// So the rule is not "no guards". A guarded data fix has to do one of two
// things: create what it is guarding on, or say out loud that it skipped. One
// file here does the second, and says exactly which migration to run first and
// to come back afterwards. The broken one did neither, and that silence is the
// whole fault. The word SKIP in a raise is what this looks for.
const CHANGES_DATA = /\b(?:update|insert\s+into|delete\s+from)\s+(?:public\.)?pcd_/i;
const CREATES_SOMETHING = /\b(?:alter|create)\s+table\b/i;
const SAYS_IT_SKIPPED = /raise\s+(?:notice|warning|exception)[^;]*skip/i;

test("no data fix skips itself in silence", () => {
  const offenders = [];
  sqlFiles.forEach((name) => {
    const sql = readFileSync(join(SQL_DIR, name), "utf8");
    for (const guard of sql.matchAll(/information_schema/gi)) {
      // The block this guard controls, up to the end of its do $$ ... $$.
      const endMarker = sql.indexOf("end $$", guard.index);
      const block = sql.slice(guard.index, endMarker >= 0 ? endMarker : sql.length);
      if (!CHANGES_DATA.test(block)) continue;
      if (CREATES_SOMETHING.test(block) || SAYS_IT_SKIPPED.test(block)) continue;
      if (!offenders.includes(name)) offenders.push(name);
    }
  });
  assert.deepEqual(
    offenders,
    [],
    `these skip a data fix without saying so, which is indistinguishable from a wrong table name: ${offenders.join(", ")}`
  );
});

// A QUOTE LINE AND ITS ORDER LINE MOVE TOGETHER, OR NOT AT ALL.
//
// The application lock stops a person editing an accepted quote. It cannot stop
// SQL, and SQL is the one editor that reaches straight past every rule the app
// has. 202608202100 changed the material on quote lines belonging to three
// approved quotes and one sent one. Its order-line half named the wrong table
// and did nothing, so those orders kept the old spelling and the Quote Summary
// tab and the production sheet stopped agreeing that night.
//
// So: a migration that changes what a quote LINE says has to change the matching
// order line in the same file. Money and status are not here. Repricing a quote
// does not change what the workshop makes, and an order's own total is
// deliberately its own after a variation.
const SPEC_COLUMNS = ["material", "thickness", "colour", "finish", "edge_mould", "profile", "width_mm", "height_mm", "qty"];

test("a migration that respells a quote line respells its order line too", () => {
  const offenders = [];
  sqlFiles.forEach((file) => {
    const sql = readFileSync(join(SQL_DIR, file), "utf8");
    // Only the statements that change an existing quote line. Creating one, or
    // backfilling a column that was just added, cannot put an order out of step.
    const touchesQuoteSpec = SPEC_COLUMNS.some((column) => {
      const pattern =
        "update\\s+(?:public\\.)?pcd_quote_line_items[\\s\\S]{0,400}?\\bset\\b[\\s\\S]{0,200}?\\b" + column + "\\b";
      return new RegExp(pattern, "i").test(sql);
    });
    if (!touchesQuoteSpec) return;
    if (/update\s+(?:public\.)?pcd_order_line_items/i.test(sql)) return;
    // Or it says in writing which file carries the order half.
    if (/pcd_order_line_items/i.test(sql)) return;
    offenders.push(file);
  });
  assert.deepEqual(
    offenders,
    [],
    "these change what a quote line says without changing the order raised from it, so the Quote Summary " +
      `and the production sheet stop agreeing: ${offenders.join(", ")}`
  );
});
