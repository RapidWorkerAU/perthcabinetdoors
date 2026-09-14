// A COLUMN HEADING THAT DISAGREES WITH ITS COLUMN.
//
// The quote request email printed the height first and was headed "W x H". Both
// halves were deliberate and nobody had put them side by side: the values were
// flipped to height-first to match every other screen, and the heading was left
// where it was.
//
// A reader cannot tell which is true. "700 x 400" under "W x H" is a 700 wide
// door to anyone reading the heading and a 700 tall door to anyone who knows our
// screens, and one of them orders the wrong thing. This is not a cosmetic bug:
// it is the same figure meaning two things.
//
// Height first, everywhere, and every heading says so.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { itemSizeLabel } from "../lib/pcd-order-item-label.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Comments are stripped before scanning for labels: the files explain this very
// bug, and the explanation names the wrong order in order to describe it.
const withoutComments = (source) =>
  source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("--"))
    .join("\n");

test("no heading anywhere still says width before height", () => {
  ["lib/pcd-email-templates.js", "lib/pcd-line-summary.js", "lib/pcd-design-plan-pdf.js", "lib/pcd-cabinet-pdf.js", "lib/pcd-order-item-label.js"].forEach(
    (path) => {
      const source = withoutComments(read(path));
      assert.doesNotMatch(source, /W x H/i, `${path} still labels a size width-first`);
    }
  );
});

test("the quote request email heads its size column the way it fills it", () => {
  // The heading is on the email; the cell under it is written by the shared
  // describer, which the customer desk reads as well. They still have to agree.
  assert.match(read("lib/pcd-email-templates.js"), />H x W<\/th>/, "the heading");
  const source = read("lib/pcd-line-summary.js");
  assert.match(
    source,
    /return `\$\{height \|\| "-"\} x \$\{width \|\| "-"\} mm`/,
    "and the cell it heads, in the same order"
  );
});

test("the cabinet schedule does too", () => {
  const source = read("lib/pcd-design-plan-pdf.js");
  assert.match(source, /label: "H x W x D"/);
  assert.match(source, /return `\$\{h\} x \$\{w\} x \$\{d\}`/);
});

// These print under a heading of just "Size", which claims no order, so they
// only have to agree with each other and with everything above.
test("every other size formatter leads with the height", () => {
  assert.equal(itemSizeLabel({ height_mm: 720, width_mm: 400 }), "720 x 400mm");

  const cabinetPdf = read("lib/pcd-cabinet-pdf.js");
  assert.match(
    cabinetPdf,
    /function cutSize\(heightMm, widthMm\) \{\s*\n\s*return `\$\{cutDimension\(heightMm\)\} x \$\{cutDimension\(widthMm\)\}`/,
    "the cut list"
  );

  // The builder, the list page and the review page all print a line, so how a
  // line reads lives in one module rather than in each of them.
  const lineText = read("lib/pcd-quote-line-text.js");
  assert.match(
    lineText,
    /return `\$\{line\.height \|\| "-"\} x \$\{line\.width \|\| "-"\}`/,
    "the quote form's summary"
  );
});

// The form asks for them in the same order it prints them, so nobody has to
// re-order the two numbers in their head between typing and checking.
test("the form asks for the height before the width", () => {
  // The quote form and the shop's product pages ask the size through one
  // shared component, so the order is checked there and both must use it.
  const fields = read("app/(site)/_builder/SizeFields.js");
  const height = fields.indexOf("Height (mm)");
  const width = fields.indexOf("Width (mm)");
  assert.ok(height > -1 && width > -1);
  assert.ok(height < width, "height is asked first, the same way round as it is shown");
  assert.match(read("app/(site)/request-quote/RequestQuoteFormClient.js"), /<SizeFields/);
  assert.match(read("app/(site)/products/[slug]/ShopProductClient.js"), /<SizeFields/);
});

// ── THE EMAIL SAYS WHAT THEY ASKED FOR ─────────────────────────────────────
//
// A hardware line showed "-" under Material, because hardware has no board. So
// the customer's own confirmation of what they had asked for did not say what
// they had asked for.

test("the email names the hardware in the material column", () => {
  const source = read("lib/pcd-line-summary.js");
  assert.match(source, /const named = line\.productName \|\| line\.product_name \|\| ""/);
  assert.match(
    source,
    /return named && named !== type \? named : "-"/,
    "and not when the name only repeats the Type column beside it"
  );
});

test("the form's summary names it too, from the same rule", () => {
  const lineText = read("lib/pcd-quote-line-text.js");
  assert.match(lineText, /if \(line\.hardwareName\) return text\(line\.hardwareName\)/);
  // And every page that prints a line asks that module rather than working it
  // out again, which is what stops the list describing a door differently from
  // the page that made it. The builder is not one of them any more: it draws
  // the line somebody is describing and the list page lists them.
  ["app/(site)/request-quote/list/QuoteListClient.js", "app/(site)/request-quote/send/QuoteSendClient.js"].forEach(
    (path) => {
      assert.match(read(path), /from "@\/lib\/pcd-quote-line-text"/, `${path} has its own copy`);
    }
  );
});
