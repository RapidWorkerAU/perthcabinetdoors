// A LIST OF THE THINGS THE APP IS MADE OF GETS WRITTEN DOWN ONCE.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
// CABINET_TYPES was written out by hand in SEVEN files: three design panels, an
// import modal, a route, the geometry translation, and lib/pcd-design-item-io.js
// which already exported it for everybody. All seven were byte identical, and
// that is the only reason nothing had broken yet.
//
// The failure it was waiting to cause is the bad kind. Adding a cabinet type
// meant finding all seven, and the first one anybody missed would not have
// thrown: the list is only ever asked `.includes(item.item_type)`, so a missing
// entry means a cabinet quietly stops being treated as a cabinet. It gets no
// doors, no cut list, no carcass. On a quote that reads as a cheap cabinet, not
// as an error, and the first person to notice is whoever builds it.
//
// ── WHY A TEST AND NOT A NOTE ────────────────────────────────────────────────
//
// Deleting the six copies fixes today. It does nothing about the next person
// who needs the list in a new file, cannot remember where it lives, and types
// it out again, which is exactly how there came to be seven. This fails the
// moment a second copy appears, and says where to import it from instead.
//
// ── ADDING A VOCABULARY TO THIS LIST ─────────────────────────────────────────
//
// Anything that is a fixed set of names the app matches against, and that more
// than one file needs, belongs here. Give it the file that owns it and a note
// saying what a missed copy would silently do.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The vocabularies that must have exactly one author.
 *
 * `owner` is the file allowed to declare it. `pattern` matches a declaration
 * and deliberately not an import, so a file that imports the list is fine and a
 * file that retypes it is not.
 */
const ONE_DEFINITION = [
  {
    name: "CABINET_TYPES",
    owner: "lib/pcd-design-item-io.js",
    pattern: /(?:const|let|var)\s+CABINET_TYPES\s*=\s*\[/,
    silentlyBreaks:
      "a cabinet type missing from a copy stops being treated as a cabinet: no doors, " +
      "no cut list, no carcass, and a quote that reads as cheap rather than wrong",
  },
];

const SEARCHED = ["app", "lib", "components", "hooks"];
const SKIP = new Set(["node_modules", ".next", ".git", "test"]);

function walk(dir, hits = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return hits; // a folder this project does not have
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, hits);
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry)) hits.push(full);
  }
  return hits;
}

const files = SEARCHED.flatMap((dir) => walk(join(ROOT, dir)));

// The walk itself has to be checked. A path that silently matched nothing would
// make every assertion below pass by finding no files at all, which is the
// failure mode this whole file exists to catch.
test("the app was actually walked", () => {
  assert.ok(files.length > 200, `expected to walk the app, found ${files.length} files`);
});

for (const vocabulary of ONE_DEFINITION) {
  test(`${vocabulary.name} is declared once, in ${vocabulary.owner}`, () => {
    const declaredIn = files
      .filter((file) => vocabulary.pattern.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file).split("\\").join("/"));

    const strays = declaredIn.filter((file) => file !== vocabulary.owner);

    assert.deepEqual(
      strays,
      [],
      `${vocabulary.name} is written out again in:\n` +
        strays.map((file) => `  ${file}`).join("\n") +
        `\n\nImport it from ${vocabulary.owner} instead. A second copy is not a tidiness ` +
        `problem: ${vocabulary.silentlyBreaks}.`
    );

    // The owner has to actually own it. If the definition is moved and this
    // list is not updated, the check above would pass by finding nothing.
    assert.ok(
      declaredIn.includes(vocabulary.owner),
      `${vocabulary.name} is not declared in ${vocabulary.owner} any more. ` +
        `If it moved, point this test at its new home.`
    );
  });

  test(`${vocabulary.name} is exported, so there is something to import`, () => {
    const source = readFileSync(join(ROOT, vocabulary.owner), "utf8");
    assert.match(
      source,
      new RegExp(`export\\s+const\\s+${vocabulary.name}\\b`),
      `${vocabulary.owner} declares ${vocabulary.name} but does not export it, which is what ` +
        `sends the next person to retype it.`
    );
  });
}
