// SHARING A DESIGN WE DREW WITH THE CUSTOMER IT IS FOR.
//
// Two faults, both silent, both only found by a person actually sending one:
//
//   THE LINK OPENED THE WRONG DESIGN. The admin share route built ?code= and the
//   planner has only ever read ?c=. The parameter was ignored, the planner fell
//   through to the code saved in that browser, and the link opened whatever
//   design that browser had drawn last. Nothing errored. The customer was shown
//   their own old design, or an empty planner, and never the one sent.
//
//   THE EMAIL SAID THEY DREW IT. The route sent the public planner's own "email
//   me my link" message word for word, so a customer who had never opened the
//   planner was told "the design you started with us" and given a button
//   reading "Open my design".
//
// Neither could be caught by a build or by a type: one is a string mismatch
// between two files that never import each other, the other is wording. So they
// are caught here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ROUTE = read("app/api/admin/design/projects/[projectId]/share/route.js");
const PLANNER = read("app/(site)/design/usePublicDesign.js");
const EMAIL = read("lib/pcd-design-share-email.js");

// ── THE LINK AND THE PLANNER HAVE TO AGREE ──────────────────────────────────

test("the shared link uses the parameter the planner reads", () => {
  const built = ROUTE.match(/\/design\?(\w+)=\$\{encodeURIComponent\(code\)\}/);
  assert.ok(built, "the route still builds a share link");
  assert.equal(built[1], "c", "?code= was ignored by the planner for the life of this feature");
});

test("the planner still accepts the old spelling, because those links are already out", () => {
  // A link is a promise made to somebody outside the building, and the ones
  // already emailed with ?code= cannot be recalled.
  assert.match(PLANNER, /params\.get\("c"\) \|\| params\.get\("code"\)/);
});

test("a link beats whatever is saved in the browser", () => {
  // The whole fault in one ordering: somebody following a link is asking for
  // THAT design. localStorage is only the answer when they arrive with no link.
  const fn = PLANNER.slice(PLANNER.indexOf("function readInitialCode()"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  const url = body.indexOf("params.get");
  const stored = body.indexOf("localStorage");
  assert.ok(url > -1 && stored > -1, "it reads both");
  assert.ok(url < stored, "the URL has to be read, and returned, before the stored code");
  assert.match(body, /if \(fromUrl\) return fromUrl;/, "and returned immediately, not merged");
});

// ── THE EMAIL HAS TO SAY WHO DREW IT ────────────────────────────────────────

test("the admin share tells the email that we drew it", () => {
  assert.match(ROUTE, /drawnByUs: true/, "otherwise it sends the customer's own words back at them");
});

test("and tells it whether they can change what they are opening", () => {
  // A read-only design opens without the tools. Telling somebody to change it
  // sends them hunting for controls that are deliberately not there.
  assert.match(ROUTE, /canEdit: mode === EDITABLE/);
});

test("the two cases do not share a sentence that is only true of one", () => {
  const wrong = ["the design you started with us", "Open my design", "a design was saved on our website"];
  // Each of those is fine in the customer's own email and untrue in ours, so
  // each has to sit on the branch that owns it rather than above the split.
  const split = EMAIL.indexOf("const words = drawnByUs");
  assert.ok(split > -1, "there has to be a split at all");
  const ours = EMAIL.slice(split, EMAIL.indexOf("    : {", split));
  for (const sentence of wrong) {
    assert.ok(!ours.includes(sentence), `"${sentence}" is the customer's wording and must not be in ours`);
  }
});

test("our version says we drew it, in the subject and in the body", () => {
  const split = EMAIL.indexOf("const words = drawnByUs");
  const ours = EMAIL.slice(split, EMAIL.indexOf("    : {", split));
  assert.match(ours, /We have put a design together for you/);
  assert.match(ours, /Your design from Perth Cabinet Doors/);
  assert.match(ours, /we shared a design with/);
});

test("the customer's own version is unchanged", () => {
  // The original email is not collateral damage. Somebody saving a design on the
  // planner still gets the words that were written for them.
  const split = EMAIL.indexOf("    : {", EMAIL.indexOf("const words = drawnByUs"));
  const theirs = EMAIL.slice(split, EMAIL.indexOf("      };", split));
  assert.match(theirs, /the design you started with us/);
  assert.match(theirs, /Open my design/);
  assert.match(theirs, /Your design is saved/);
});

// ── AND THE LINK STILL HAS TO BE ONE OF OURS ────────────────────────────────

test("the email still refuses to send a link that is not a planner link", () => {
  // Unchanged by any of this, and worth holding: without it a hand-rolled POST
  // could have us send a branded email pointing anywhere.
  assert.match(EMAIL, /url\.pathname\.startsWith\("\/design"\)/);
});
