// HOW MUCH ALFRED READS, AND SAYING SO (2026-10-06).
//
//   A list stops at 50, and when it stops it says how many there really are,
//   so part of a list is never presented as all of it.
//   Counts are taken over everything, never over the part listed.
//   Many ids are read a hundred at a time, and the update clock twenty five
//   customers at a time, so nothing is silently dropped by the database's
//   thousand row ceiling or a request too long to send.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capped, LIST_CAP, rowsForIds } from "../lib/pcd-alfred-lookups.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a cut list says how many there really are", () => {
  assert.equal(LIST_CAP, 50);
  const lines = Array.from({ length: 63 }, (_, i) => `Row ${i + 1}`);
  const out = capped(lines);
  assert.equal(out.length, 51);
  assert.equal(out[50], "Showing the first 50 of 63. Ask for a narrower list to see the rest.");
  assert.deepEqual(capped(["a", "b"]), ["a", "b"], "nothing added when nothing was left out");
  assert.equal(capped(["a"], 120).at(-1), "Showing the first 1 of 120. Ask for a narrower list to see the rest.", "the database's own count wins");
});

test("many ids are read a hundred at a time", async () => {
  const asked = [];
  const supabase = {
    from: () => ({
      select: () => ({
        in: async (_column, ids) => {
          asked.push(ids.length);
          return { data: ids.map((id) => ({ id })), error: null };
        },
      }),
    }),
  };
  const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
  const rows = await rowsForIds(supabase, "pcd_order_payments", "order_id", ids);
  assert.deepEqual(asked, [100, 100, 50]);
  assert.equal(rows.length, 250);
});

test("no lookup is cut short without a count", () => {
  const sources = read("lib/pcd-alfred-lookups.js") + read("lib/pcd-alfred-ask.js");
  assert.doesNotMatch(sources, /\.limit\((8|10|15|40|80)\)/, "an old silent limit is back");
  assert.doesNotMatch(sources, /\.slice\(0, (10|15|25)\)\.map/, "an old silent slice is back");
  assert.match(read("lib/pcd-alfred-ask.js"), /When a tool says it is showing only some of a list, say so and give the real total\./);
});

test("the update clock reads customers in small groups, newest emails first", () => {
  const updates = read("lib/pcd-alfred-updates.js");
  assert.match(updates, /for \(let i = 0; i < customerIds\.length; i \+= 25\)/);
  assert.match(updates, /\.eq\("direction", "outbound"\)\s*\.order\("created_at", \{ ascending: false \}\)/);
});

// A refresh opens the same chat, it never saves it again as a new one.
test("the chat on screen keeps its id across a refresh", () => {
  const ask = read("app/admin/alfred/AskAlfred.tsx");
  assert.match(ask, /url\.searchParams\.set\('chat', id\)/, "the id is in the address");
  assert.match(ask, /window\.sessionStorage\.setItem\(STORE, JSON\.stringify\(\{ id, turns/, "and in the tab, with the turns");
  assert.match(ask, /const id = chatInAddress\(\) \|\| kept\.id/, "and is read back on opening");
  assert.match(ask, /if \(p\.ok\) showChat\(id, p\.chat\.turns \|\| \[\]\)/, "from the shared list, not from the tab's copy");
  assert.match(ask, /method: 'DELETE'/, "a chat can be deleted");
});
