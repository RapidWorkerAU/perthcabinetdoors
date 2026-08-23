// NO HOOK MAY SIT BELOW AN EARLY RETURN.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The Order History view was added beside the section that renders it, roughly
// 1,400 lines below the component's loading gate:
//
//   if (isLoading) return <AdminLoading ... />;
//
// A hook after that only runs once the gate has passed. So the first render
// counted 46 hooks and the second counted 47, and React refused to continue:
//
//   "Rendered more hooks than during the previous render."
//
// The build was clean and every test passed, because nothing here is a syntax
// error and nothing renders in a test. It only appeared on the screen.
//
// ── WHY A TEST AND NOT JUST LINTING ──────────────────────────────────────────
//
// react-hooks/rules-of-hooks catches a hook inside a condition or a loop. It
// does not catch a hook that is merely BELOW an early return at the top level of
// a component, because that is legal JavaScript and only wrong at run time.
//
// These files are thousands of lines long, so "put it near what uses it" is the
// natural instinct and the wrong one. This makes the rule enforceable.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\//, "");

function walk(dir, hits = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, hits);
    else if (/\.(js|jsx|tsx)$/.test(entry)) hits.push(full);
  }
  return hits;
}

// Top level of a component body: exactly two spaces of indent. A hook deeper
// than that is inside a function, a branch or a callback, which is a different
// question and one the linter already answers.
const TOP_LEVEL_HOOK = /^ {2}(?:const|let)\s+[^=\n]*=\s*use(?:Memo|State|Effect|Callback|Ref|Reducer|Context|LayoutEffect)\(/;

// An early return at that same top level. `return (` opening the component's
// real JSX is not one, so it ends the search rather than counting.
const EARLY_RETURN = /^ {2}if\s*\([^)]*\)\s*return\s/;
const FINAL_RETURN = /^ {2}return\s*\(\s*$/;

// A new function starting at column 0. Everything indented two spaces belongs to
// whichever of these it sits under, so this is what separates a component body
// from a module-level helper. Without it, an early return in a small helper near
// the top of a file was reported against a hook in a component 300 lines below,
// which is 25 findings that are all the same mistake in the test rather than in
// the code.
const NEW_TOP_LEVEL_FUNCTION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s|^(?:export\s+)?(?:const|let)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/;

const files = [];
for (const dir of ["app", "components"]) {
  try {
    files.push(...walk(join(ROOT, dir)));
  } catch {
    // a folder this project does not have
  }
}

test("the app was actually walked", () => {
  assert.ok(files.length > 50, `only found ${files.length} component files, which cannot be right`);
});

test("no hook is declared below an early return", () => {
  const offenders = [];

  files.forEach((file) => {
    const source = readFileSync(file, "utf8");
    if (!source.includes("use")) return;
    const lines = source.split(/\r?\n/);

    let gate = null;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      // A new top-level function is a fresh scope. An early return in the helper
      // above has nothing to do with the hooks in the component below it.
      if (NEW_TOP_LEVEL_FUNCTION.test(line)) {
        gate = null;
        continue;
      }

      // The component's own return ends the hook region; anything after it is
      // inside JSX or a later declaration and not our concern.
      if (FINAL_RETURN.test(line)) {
        gate = null;
        continue;
      }
      if (EARLY_RETURN.test(line)) {
        if (gate === null) gate = index + 1;
        continue;
      }
      if (gate !== null && TOP_LEVEL_HOOK.test(line)) {
        offenders.push(
          `${relative(ROOT, file).split("\\").join("/")}:${index + 1} runs a hook below the early return on line ${gate}`
        );
        gate = null; // one report per component is enough to act on
      }
    }
  });

  assert.deepEqual(
    offenders,
    [],
    "a hook after an early return runs on some renders and not others, so React counts a different " +
      `number each time and stops: ${offenders.join("; ")}`
  );
});
