// Every dropdown on the public site must keep its arrow.
//
// The arrow is two background layers on .pcdSelect (a solid chip, and the
// chevron drawn on top of it). The `background` SHORTHAND resets
// background-image to none, so any rule or inline style that uses it on a
// select silently deletes the arrow. That is exactly what happened: six
// stylesheets and one shared style object set `background`, and every dropdown
// on the site lost its chevron at once.
//
// Nothing here renders anything. It reads the source and fails on the two
// patterns that cause it: a `background` shorthand reaching a select, and a
// select that does not reserve room for the chip.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const CSS = [
  "app/(site)/contact/contact.module.css",
  "app/(site)/products/products.module.css",
  "app/(site)/ikea-kaboodle/configurator.module.css",
  "app/(site)/finishes/finishes.module.css",
  "app/(site)/launch/launch.module.css",
  "app/(site)/frontend.css",
];

const JSX = [
  "app/(site)/design/PublicDesignClient.js",
  "app/(site)/contact/ContactFormClient.js",
  "app/(site)/request-quote/RequestQuoteFormClient.js",
  "app/(site)/finishes/FinishesBrowser.js",
  "app/(site)/launch/page.js",
  "app/(site)/products/ProductsLibraryClient.js",
  "components/AddItemRail.js",
];

// Walk a stylesheet and return every rule whose selector mentions a select.
function selectRules(css) {
  const out = [];
  const lines = css.split("\n");
  let selector = null;
  let inRule = false;
  lines.forEach((line, i) => {
    if (line.includes("{")) {
      // The selector may span several lines; collect back to the last brace.
      let j = i;
      const parts = [line.replace(/\{.*/, "")];
      while (j > 0 && !/[{}]/.test(lines[j - 1]) && lines[j - 1].trim()) {
        parts.unshift(lines[j - 1]);
        j -= 1;
      }
      selector = parts.join(" ").replace(/\s+/g, " ").trim();
      inRule = true;
    }
    if (inRule && selector && /\bselect\b/.test(selector)) {
      out.push({ selector, line: line.trim(), n: i + 1 });
    }
    if (line.includes("}")) inRule = false;
  });
  return out;
}

test("no stylesheet uses the background shorthand on a select", () => {
  const offenders = [];
  for (const file of CSS) {
    selectRules(read(file)).forEach((r) => {
      if (/^background\s*:/.test(r.line)) {
        offenders.push(`${file}:${r.n}  ${r.selector}  ->  ${r.line}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "use background-color; the shorthand resets background-image and deletes the arrow"
  );
});

// Every `const NAME = { ... }` style object, across the JSX files AND anything
// they spread from, with whether it uses the `background` shorthand.
//
// The first version of this test only looked at `btn` in the planner. It passed
// while the view dropdown had no arrow, because the shorthand was three levels
// up the chain: barButton (in DesignTopBar) -> mobileBarBtn -> the select. This
// version follows the chain.
function styleObjects() {
  const objects = new Map();
  const files = [...JSX, "components/DesignTopBar.js"];
  for (const file of files) {
    const src = read(file);
    const re = /(?:export\s+)?const\s+(\w+)\s*=\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      const [, name, body] = m;
      if (!/padding|background|border|font|color/.test(body)) continue; // style-ish only
      const prev = objects.get(name) || { name, shorthand: false, spreads: [], file };
      prev.shorthand = prev.shorthand || /\bbackground:\s*[`"']/.test(body);
      [...body.matchAll(/\.\.\.(\w+)/g)].forEach((s) => prev.spreads.push(s[1]));
      objects.set(name, prev);
    }
  }
  return objects;
}

// Does this object, or anything it spreads from, carry the shorthand?
function carriesShorthand(name, objects, seen = new Set()) {
  if (seen.has(name)) return false;
  seen.add(name);
  const obj = objects.get(name);
  if (!obj) return false;
  if (obj.shorthand) return name;
  for (const s of obj.spreads) {
    const hit = carriesShorthand(s, objects, seen);
    if (hit) return hit;
  }
  return false;
}

test("nothing spread into a select carries the background shorthand", () => {
  const objects = styleObjects();
  const offenders = [];

  for (const file of JSX) {
    const src = read(file);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (!/<select\b/.test(line)) return;
      const chunk = lines.slice(i, i + 10).join(" ");
      const style = /style=\{\{([^}]*(?:\}[^}]*\})*[^}]*)\}\}/.exec(chunk);
      if (!style) return;

      // The literal itself.
      if (/\bbackground:\s*[`"']/.test(style[1])) {
        offenders.push(`${file}:${i + 1} sets background: inline`);
      }
      // Anything it spreads from, transitively.
      [...style[1].matchAll(/\.\.\.(\w+)/g)].forEach((s) => {
        const via = carriesShorthand(s[1], objects);
        if (via) {
          offenders.push(`${file}:${i + 1} spreads ${s[1]}, which reaches the shorthand via ${via}`);
        }
      });
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "the background shorthand resets background-image and deletes the arrow; use backgroundColor"
  );
});

test("the arrow layers cannot be defeated by an inline shorthand", () => {
  // Belt and braces for the above: even if a shorthand slips through, the class
  // wins outright.
  const css = read("app/(site)/frontend.css");
  const rule = /\.pcdSelect \{[\s\S]*?\n\}/.exec(css)[0];
  ["background-image", "background-position", "background-repeat", "background-size"].forEach((prop) => {
    const decl = new RegExp(`${prop}:[^;]*!important;`);
    assert.match(rule, decl, `${prop} must be !important so an inline shorthand cannot reset it`);
  });
});

test("every public select carries the shared treatment", () => {
  const missing = [];
  for (const file of JSX) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      if (!/<select\b/.test(line)) return;
      const chunk = lines.slice(i, i + 8).join(" ");
      // AddItemRail is shared with admin, which does not load frontend.css, so
      // it applies the same treatment inline via selectChrome().
      const treated = /pcdSelect/.test(chunk) || /selectChrome\(/.test(read(file));
      if (!treated) missing.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(missing, [], "these selects would render the browser's native arrow");
});

test("every select reserves room on the right for the chip", () => {
  const tooTight = [];
  for (const file of JSX) {
    if (file.includes("AddItemRail")) continue; // sets paddingRight in selectChrome
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      if (!/<select\b/.test(line)) return;
      const chunk = lines.slice(i, i + 8).join(" ");
      const shorthand = /padding:\s*"/.test(chunk);
      const explicit = /paddingRight:\s*(\d+)/.exec(chunk);
      // An inline padding shorthand beats the class, so it must be paired with
      // an explicit paddingRight.
      if (shorthand && !explicit) tooTight.push(`${file}:${i + 1} (inline padding with no paddingRight)`);
      if (explicit) {
        const need = /pcdSelect--compact/.test(chunk) ? 26 : 40;
        if (Number(explicit[1]) < need) {
          tooTight.push(`${file}:${i + 1} (paddingRight ${explicit[1]}, needs ${need})`);
        }
      }
    });
  }
  assert.deepEqual(tooTight, [], "text would run under the arrow on these");
});

test("the shared rule still defines both layers and the ellipsis", () => {
  const css = read("app/(site)/frontend.css");
  const rule = /\.pcdSelect \{[\s\S]*?\}/.exec(css);
  assert.ok(rule, ".pcdSelect should exist");
  const body = rule[0];
  assert.match(body, /background-image:[\s\S]*chevron|background-image:[\s\S]*svg/i, "needs the chevron layer");
  assert.match(body, /linear-gradient\(var\(--pcdSelectChip\)/, "needs the solid chip layer");
  assert.match(body, /text-overflow:\s*ellipsis/, "long options must clip, not run under the arrow");
  assert.match(body, /padding-right:\s*40px/, "must reserve the chip's width");
});

// ── containers must not draw a header their child already draws ─────────────

test("AddItemRail does not draw its own header inside a container that has one", () => {
  // The planner's mobile sheet renders a title and a close button, and the rail
  // was rendering the same two again underneath, so "Add to your room" and a ✕
  // appeared twice stacked on top of each other.
  const planner = read("app/(site)/design/PublicDesignClient.js");
  const lines = planner.split("\n");

  lines.forEach((line, i) => {
    if (!/<BottomSheet|<FullScreenConfigModal/.test(line)) return;
    // Does this wrapper pass a title of its own?
    if (!/title=/.test(line)) return;

    // Look at what it wraps, up to its closing tag.
    const closing = /<BottomSheet/.test(line) ? "</BottomSheet>" : "</FullScreenConfigModal>";
    let end = i;
    while (end < lines.length && !lines[end].includes(closing)) end += 1;
    const body = lines.slice(i, end + 1).join(" ");

    if (/<AddItemRail/.test(body)) {
      assert.match(
        body,
        /showHeader=\{false\}/,
        `line ${i + 1}: this wrapper draws a title, so the rail inside it must pass showHeader={false}`
      );
      assert.ok(
        !/<AddItemRail[^>]*onCancel=/.test(body),
        `line ${i + 1}: the wrapper already has a close button, so the rail must not add one`
      );
    }
  });
});

test("AddItemRail renders no empty header strip when the header is off", () => {
  const rail = read("components/AddItemRail.js");
  assert.match(
    rail,
    /\{\(showHeader \|\| showFilter \|\| belowFilter\) && \(/,
    "the header wrapper must be conditional, or turning it off leaves a bordered empty strip"
  );
});
