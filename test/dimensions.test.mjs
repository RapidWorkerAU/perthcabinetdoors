// How a size is written down.
//
// The rule this file exists to hold: HEIGHT FIRST. A door is 2100 high and 600
// wide, and that is the order it is said on the bench, so it is the order it is
// written everywhere else.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  dimensionParts,
  dimensionText,
  dimensionTextEach,
  dimensionWords,
  dimensionTextFor,
  DIMENSION_FIELDS,
} from "../lib/pcd-dimensions.js";

// ── the order ──────────────────────────────────────────────────────────────

test("height comes first, then width, then depth", () => {
  assert.deepEqual(dimensionParts({ height: 2100, width: 600, depth: 560 }), [2100, 600, 560]);
  assert.equal(dimensionText({ height: 2100, width: 600 }), "2100 x 600");
  assert.equal(dimensionText({ height: 2100, width: 600, depth: 560 }), "2100 x 600 x 560");
});

test("the form fields are in the same order as the text", () => {
  assert.deepEqual(DIMENSION_FIELDS.map((f) => f.key), ["height_mm", "width_mm", "depth_mm"]);
  assert.deepEqual(DIMENSION_FIELDS.map((f) => f.short), ["H", "W", "D"]);
});

test("a row is read the same way as loose numbers", () => {
  assert.equal(dimensionTextFor({ height_mm: 2100, width_mm: 600 }), "2100 x 600");
  assert.equal(dimensionTextFor({ height: 2100, width: 600 }), "2100 x 600");
  assert.equal(dimensionTextFor({ height_mm: 720, width_mm: 600, depth_mm: 560 }, { withDepth: true }), "720 x 600 x 560");
  assert.equal(dimensionTextFor({ height_mm: 720, width_mm: 600, depth_mm: 560 }), "720 x 600", "depth is opt in");
});

// ── what is missing ────────────────────────────────────────────────────────

test("nothing at all is nothing, not a row of dashes", () => {
  assert.equal(dimensionText({}), "");
  assert.equal(dimensionText({ height: 0, width: 0 }), "");
  assert.equal(dimensionText(), "");
  assert.equal(dimensionTextEach({}), "");
  assert.equal(dimensionWords({}), "");
});

test("one missing number is a dash, so the other still reads in its place", () => {
  assert.equal(dimensionText({ height: 2100 }), "2100 x -");
  assert.equal(dimensionText({ width: 600 }), "- x 600");
});

// A depth on its own is not a size, and would read as a height if printed first.
test("a depth alone is not a size", () => {
  assert.equal(dimensionText({ depth: 560 }), "");
});

test("a non-numeric value counts as missing rather than NaN", () => {
  assert.equal(dimensionText({ height: "abc", width: 600 }), "- x 600");
  assert.equal(dimensionText({ height: null, width: 600 }), "- x 600");
});

test("numbers are rounded, because a cut list has no use for a fraction", () => {
  assert.equal(dimensionText({ height: 2100.4, width: 599.6 }), "2100 x 600");
});

// ── the variants ───────────────────────────────────────────────────────────

test("a unit is appended once, not after every number", () => {
  assert.equal(dimensionText({ height: 2100, width: 600, unit: "mm" }), "2100 x 600mm");
  assert.equal(dimensionText({ height: 2100, width: 600, unit: " mm" }), "2100 x 600 mm");
});

test("each number can carry its own unit where they are read apart", () => {
  assert.equal(dimensionTextEach({ height: 2100, width: 600 }), "2100mm x 600mm");
  assert.equal(dimensionTextEach({ height: 720, width: 600, depth: 560 }), "720mm x 600mm x 560mm");
});

test("spelled out, one dimension still says which it is", () => {
  assert.equal(dimensionWords({ height: 2100, width: 600 }), "2100mm high x 600mm wide");
  assert.equal(dimensionWords({ height: 2100 }), "2100mm high");
  assert.equal(dimensionWords({ width: 600 }), "600mm wide");
  assert.equal(dimensionWords({ height: 720, width: 600, depth: 560 }), "720mm high x 600mm wide x 560mm deep");
});

// ── nothing writes a size the old way any more ─────────────────────────────
//
// A grep rather than a unit test, because the failure this guards against is
// somebody hand building the string again somewhere new, which no amount of
// testing this module would catch.

const ROOTS = ["app", "lib", "components"];
const SKIP = new Set(["node_modules", ".next", ".next-verify", "dist"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

// width, then an x, then height. The pattern of the thing we are removing.
const WIDTH_FIRST = /width[_a-zA-Z]*\s*(\|\|[^}]*)?\}?\s*(mm)?\s*(x|×)\s*\$?\{?\s*[a-zA-Z.]*height/i;

// A comment describing area maths is not a size anybody reads, and neither is
// a cache key. Both mention width before height quite correctly.
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

// Keys, not labels. Their order is arbitrary and changing it would invalidate
// every cached entry for no gain.
const ALLOWED = new Set([
  // The preset ref, a cache key rather than a label. Its line moves when
  // anything is added above it in that file.
  "lib/pcd-ikea-presets.js:106",
  "lib/pcd-door-utils.js:395",
]);

test("no file builds a size string width first", () => {
  const offenders = [];
  ROOTS.forEach((root) => {
    walk(root).forEach((file) => {
      const text = readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        if (isComment(line)) return;
        const at = `${file.split("\\").join("/")}:${i + 1}`;
        if (ALLOWED.has(at)) return;
        if (WIDTH_FIRST.test(line)) offenders.push(at);
      });
    });
  });
  assert.deepEqual(offenders, [], "these still write width before height:\n" + offenders.join("\n"));
});
