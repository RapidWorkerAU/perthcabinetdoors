/*
 * ARROWS ARE ICONS, NOT CHARACTERS.
 *
 * Every back arrow, chevron and caret on the site was once a character typed
 * into the markup: "<-" in the quote builder, a left arrow glyph on the order
 * page, a small triangle for a disclosure caret, a right angle quote for a
 * drill-in row. They never matched. Different sizes, different weights, none of
 * them lining up with the real icons beside them, and each one drawn at
 * whatever the font decided rather than at the size it was given.
 *
 * The admin already draws its icons from @tabler/icons-react, so that is the
 * one definition and there is no reason for a second one made out of text. This
 * fails on any typed arrow that gets back into a rendered file.
 *
 * Comments are exempt. "mm -> metres" in a comment is prose about the code, not
 * something a person sees on a screen.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The glyphs people reach for instead of an icon: arrows, triangles, angle
// quotes, and the HTML entities that render as the same things.
const TYPED_ARROWS = [
  "←", "→", "↑", "↓", // arrows
  "▸", "▾", "▴", "◂", // small triangles
  "▲", "▼", "◀", "▶", // solid triangles
  "‹", "›", "«", "»", // angle quotes
  "&larr;", "&rarr;", "&uarr;", "&darr;",
];

const SLASH = String.fromCharCode(92);
const asPosix = (p) => p.split(SLASH).join("/");

/*
 * The code on a line with its comments taken off.
 *
 * A comment is prose about the code, and "mm -> metres" written in one is not
 * an arrow anybody sees. Skipping only the lines that START as a comment is not
 * enough: a note on the end of a working line and the middle of a block comment
 * both read as code, and both were full of arrows already.
 *
 * Block comments carry across lines, so this walks the file rather than judging
 * each line on its own. Rough on a "//" inside a string literal, which it will
 * treat as the start of a comment, but the cost of that is a missed arrow and
 * never a false accusation.
 */
function codeOnly(text) {
  const out = [];
  let inBlock = false;
  for (const raw of text.split("\n")) {
    let line = raw;
    let code = "";
    while (line.length) {
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end === -1) { line = ""; break; }
        inBlock = false;
        line = line.slice(end + 2);
        continue;
      }
      const block = line.indexOf("/*");
      const rest = line.indexOf("//");
      if (rest !== -1 && (block === -1 || rest < block)) { code += line.slice(0, rest); break; }
      if (block !== -1) { code += line.slice(0, block); line = line.slice(block + 2); inBlock = true; continue; }
      code += line;
      break;
    }
    out.push(code);
  }
  return out;
}

function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") sourceFiles(full, found);
    } else if (/[.](js|jsx|ts|tsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const ROOT = path.dirname(path.dirname(asPosix(new URL(import.meta.url).pathname.slice(1))));
const FILES = ["app", "components"].flatMap((dir) => sourceFiles(path.join(ROOT, dir)));

/** Every rendered line matching `hit`, as "file:line". */
function offenders(hit) {
  const found = [];
  for (const file of FILES) {
    codeOnly(fs.readFileSync(file, "utf8")).forEach((line, i) => {
      const what = hit(line);
      if (what) found.push(asPosix(path.relative(ROOT, file)) + ":" + (i + 1) + "  " + what);
    });
  }
  return found;
}

test("the sweep is actually looking at the screens", () => {
  // A guard on the guard. A broken path would find no files and pass forever.
  assert.ok(FILES.length > 200, "only found " + FILES.length + " files to check");
  assert.ok(FILES.some((f) => asPosix(f).endsWith("app/admin/quotes/[id]/QuoteEditor.js")));
});

test("no arrow is typed as a character where somebody can see it", () => {
  const found = offenders((line) => TYPED_ARROWS.find((g) => line.includes(g)));
  assert.deepEqual(found, [], "use a @tabler/icons-react icon instead of typing the arrow");
});

test("no arrow is spelt with a dash and an angle bracket either", () => {
  // The quote builder's own spelling, which is the one that started this.
  const found = offenders((line) => {
    for (const spelling of ['"<-', '"->', ">&lt;-<", ">-&gt;<"]) {
      if (line.includes(spelling)) return spelling;
    }
    return null;
  });
  assert.deepEqual(found, []);
});

test("a lone angle bracket is not a chevron", () => {
  // <span>&gt;</span> was the drill-in marker on two different section lists.
  const found = offenders((line) => {
    for (const spelling of [">&gt;<", ">&lt;<"]) {
      if (line.includes(spelling)) return spelling;
    }
    return null;
  });
  assert.deepEqual(found, []);
});

test("the icons that replaced them come from the one icon set", () => {
  // Not a hand-drawn svg per screen, and not a second icon package. Checked on
  // the files this swept, so a later edit cannot quietly introduce a rival.
  const swept = [
    "app/admin/quotes/[id]/QuoteEditor.js",
    "app/admin/quotes/[id]/SiteMeasurePanel.js",
    "app/admin/orders/[id]/OrderDetail.js",
    "app/admin/_components/SecondarySidebar.tsx",
    "app/admin/_components/ListsManager.tsx",
    "app/admin/options/ColourLibraryManager.tsx",
    "components/admin/CabinetConfigurator.tsx",
    "components/ConfigSection.js",
  ];
  for (const rel of swept) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(text.includes("@tabler/icons-react"), rel + " lost its icon import");
  }
});
