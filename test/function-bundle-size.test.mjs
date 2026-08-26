// WHAT A SERVERLESS FUNCTION IS ALLOWED TO CARRY.
//
// -- WHY IT EXISTS -----------------------------------------------------------
//
// Vercel refuses to deploy a function over 250MB uncompressed. Nothing in a
// build or a test run tells you that: the build passes, every test passes, and
// the deploy is turned away half an hour later with a number and no cause.
//
// The cause is always the same shape. A function ships a copy of every file it
// might open, and a path built at runtime says nothing about WHICH file, so the
// build packs the whole folder that path starts from. Reading pictures out of
// public/ therefore packed all 442MB of website photography into the cut list,
// which came out at 444MB and was refused.
//
// The fix was to name the six picture folders outright, 44MB rather than 442MB.
// It is one edit away from coming undone, and coming undone is silent.
//
// -- WHAT MUST STAY TRUE -----------------------------------------------------
//
//   NOBODY READS public/ AS A WHOLE. A path rooted at public/ with a runtime
//   filename packs everything under it.
//
//   THE ROOTS STAY WRITTEN OUT. Building one out of a variable, however tidy,
//   loses the build its only clue and puts the parent folder back in the bundle.
//
//   EVERY NAMED FOLDER IS REALLY THERE. A typo here is a folder that silently
//   never resolves, and every picture in it prints as "No picture on file".

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const source = readFileSync(join(root, "lib/pcd-order-reference-images.js"), "utf8");

// path.join(process.cwd(), "public", "images", "colours")  ->  images/colours
const ROOT_CALL = /path\.join\(\s*process\.cwd\(\)\s*,\s*((?:"[^"]+"\s*,\s*)*"[^"]+")\s*\)/g;

function declaredRoots() {
  return [...source.matchAll(ROOT_CALL)].map((match) =>
    match[1].split(",").map((part) => part.trim().replace(/^"|"$/g, ""))
  );
}

test("the picture folders are named outright, not built from a variable", () => {
  const roots = declaredRoots();
  assert.ok(roots.length >= 6, `expected the picture folders to be listed, found ${roots.length}`);

  // Anything other than a run of quoted names inside path.join means something
  // is being assembled, which is exactly what the build cannot follow.
  const joins = source.match(/path\.join\(\s*process\.cwd\(\)[^)]*\)/g) || [];
  assert.equal(
    joins.length,
    roots.length,
    "a path.join off process.cwd() is being built from something other than written out names"
  );
});

test("no picture is read from the whole of public/", () => {
  const roots = declaredRoots();
  const tooBroad = roots.filter((parts) => parts.length < 3);
  assert.deepEqual(
    tooBroad,
    [],
    `these roots are wide enough to pack the whole folder: ${tooBroad.map((p) => p.join("/")).join(", ")}`
  );
});

test("every folder the sheet reads from is really there", () => {
  declaredRoots().forEach((parts) => {
    const folder = join(root, ...parts);
    assert.ok(existsSync(folder), `${parts.join("/")} is named in the reader but not in the repo`);
  });
});

test("a picture outside those folders is fetched rather than lost", () => {
  // The safety net. Without it, naming the folders would turn every picture
  // filed somewhere unexpected into "No picture on file" with no warning.
  assert.match(source, /function siteOrigin\(\)/);
  assert.match(source, /NEXT_PUBLIC_SITE_URL/);
  assert.match(source, /VERCEL_URL/);
});
