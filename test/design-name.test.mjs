// NAMING A DESIGN IN THE PUBLIC PLANNER.
//
// ── THE FAULT THIS FILE EXISTS FOR ───────────────────────────────────────────
//
// Every design made in the public planner was created as "My design", because
// the planner never asked and the create route had to write something. In the
// admin list they were all called the same thing, so telling one from another
// meant opening each of them in turn.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   IT IS ASKED FIRST. Once somebody is drawing cabinets they will not stop to
//   title anything, so it is asked when it costs one line of typing.
//
//   THE FIELD IS NEVER PRE-FILLED. A suggested name sitting in the box would be
//   accepted without being read, and we would be back to one shared name with
//   extra steps between us and it.
//
//   NOTHING IS CREATED UNTIL IT IS ANSWERED. Somebody who opens the planner and
//   thinks better of it leaves no row behind.
//
//   THE FALLBACK ADMITS TO BEING ONE. "Untitled design" tells whoever opens the
//   admin list that nobody named it. "My design" looks like somebody's answer.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DESIGN_NAME_MAX,
  DESIGN_NAME_MIN,
  DESIGN_NAME_PLACEHOLDER,
  FALLBACK_DESIGN_NAME,
  cleanDesignName,
  designNameOrFallback,
  isPlaceholderDesignName,
  isUsableDesignName,
} from "../lib/pcd-design-name.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const GATE   = read("app/(site)/design/DesignNameGate.js");
const FIELD  = read("app/(site)/design/DesignNameField.js");
const HOOK   = read("app/(site)/design/usePublicDesign.js");
const CLIENT = read("app/(site)/design/PublicDesignClient.js");
const CREATE = read("app/api/public/design/route.js");
const PATCH  = read("app/api/public/design/[code]/route.js");

// ── the rule itself ─────────────────────────────────────────────────────────

test("a name is tidied the same way wherever it arrives", () => {
  assert.equal(cleanDesignName("  Kitchen at 14 Marine Parade  "), "Kitchen at 14 Marine Parade");
  // Pasted out of a document, complete with a line break.
  assert.equal(cleanDesignName("Kitchen\n  and laundry"), "Kitchen and laundry");
  assert.equal(cleanDesignName(null), "");
  assert.equal(cleanDesignName(undefined), "");
});

test("a name cannot be longer than the column that shows it", () => {
  const long = "a".repeat(DESIGN_NAME_MAX + 50);
  assert.equal(cleanDesignName(long).length, DESIGN_NAME_MAX);
});

test("a stray keystroke is not a name", () => {
  assert.equal(isUsableDesignName(""), false);
  assert.equal(isUsableDesignName("   "), false);
  assert.equal(isUsableDesignName("a"), false);
  assert.equal(isUsableDesignName("Kitchen"), true);
  assert.equal(DESIGN_NAME_MIN, 2);
});

test("the fallback says nobody named it, rather than looking like a name", () => {
  // THE WHOLE POINT. "My design" reads as somebody's answer and is why this
  // problem went unnoticed. "Untitled design" reads as a gap.
  assert.equal(FALLBACK_DESIGN_NAME, "Untitled design");
  assert.notEqual(FALLBACK_DESIGN_NAME, "My design");
  assert.equal(designNameOrFallback(""), FALLBACK_DESIGN_NAME);
  assert.equal(designNameOrFallback("  "), FALLBACK_DESIGN_NAME);
  assert.equal(designNameOrFallback("x"), FALLBACK_DESIGN_NAME);
  assert.equal(designNameOrFallback(" Nan's laundry "), "Nan's laundry");
});

// ── the field ───────────────────────────────────────────────────────────────

test("the field starts empty and is never handed a value", () => {
  // A default in the box gets accepted without being read.
  assert.ok(!/defaultValue/.test(FIELD), "the field has a default value");
  assert.match(GATE, /useState\(""\)/, "the naming screen starts with something in the box");
});

test("the placeholder goes when the field is clicked into", () => {
  // A plain HTML placeholder stays put until the first keystroke, so it is
  // still on screen with the cursor in front of it and reads as text to delete.
  assert.match(FIELD, /placeholder=\{focused \? "" : DESIGN_NAME_PLACEHOLDER\}/);
  assert.match(FIELD, /onFocus=\{\(\) => setFocused\(true\)\}/);
  // And comes back if nothing was typed, so an empty field still says what it
  // wants.
  assert.match(FIELD, /onBlur=\{\(\) => setFocused\(false\)\}/);
});

test("the placeholder is an example specific enough to be worth copying", () => {
  // "My kitchen" would suggest exactly the name this was built to stop.
  assert.ok(DESIGN_NAME_PLACEHOLDER.length > 12);
  assert.ok(!/^my /i.test(DESIGN_NAME_PLACEHOLDER));
});

test("the field does not make iOS zoom the page in", () => {
  // Anything under 16px and Safari zooms the whole planner on focus, which on a
  // phone leaves somebody scrolled somewhere they did not ask to be.
  assert.match(FIELD, /fontSize: 16,/);
});

// ── the flow ────────────────────────────────────────────────────────────────

test("nothing is created until the design has been named", () => {
  // The boot used to POST straight away, which is why an abandoned visit still
  // left a row called "My design" behind.
  assert.match(HOOK, /setNeedsName\(true\)/);
  const boot = HOOK.slice(HOOK.indexOf("// Bootstrap:"), HOOK.indexOf("// ---- mutations ----"));
  assert.ok(!/await startFresh\(\)/.test(boot), "the boot still creates a design without asking");
});

test("the name is asked for before the room, not after it", () => {
  const gateAt = CLIENT.indexOf("if (d.needsName)");
  const roomErrorAt = CLIENT.indexOf("if (d.error || !d.room)");
  assert.ok(gateAt > 0 && roomErrorAt > 0);
  // Otherwise somebody who has not started anything is told we could not load
  // their room, which is true and useless.
  assert.ok(gateAt < roomErrorAt, "the room error branch would catch an unnamed session first");
});

test("the name the visitor typed is what the design is created with", () => {
  assert.match(HOOK, /body: JSON\.stringify\(\{ name \}\)/);
  assert.match(CREATE, /name: designNameOrFallback\(body\?\.name\)/);
  // Comments stripped: the file explaining why it must not write "My design"
  // is not the file writing it.
  const code = CREATE.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/"My design"/.test(code), "the old shared name is still in the create route");
});

test("starting over asks again rather than making another unnamed design", () => {
  const startOver = HOOK.slice(HOOK.indexOf("function startOver()"), HOOK.indexOf("// \"Send my design to PCD\""));
  assert.match(startOver, /setNeedsName\(true\)/);
  assert.match(startOver, /forgetCode\(\)/, "the old code would be resumed on the next reload");
});

test("forgetting a design clears the address bar as well as the store", () => {
  // Clearing only the stored code leaves ?c= in the URL, and the next reload
  // quietly resumes the design somebody had just chosen to abandon.
  const forget = HOOK.slice(HOOK.indexOf("function forgetCode()"), HOOK.indexOf("export default function usePublicDesign"));
  assert.match(forget, /removeItem\(CODE_STORAGE_KEY\)/);
  assert.match(forget, /searchParams\.delete\("c"\)/);
});

test("a link that no longer works asks for a name instead of silently starting over", () => {
  // Being dropped into an empty room that looks like yours is worse than being
  // told you are starting something new.
  assert.match(HOOK, /forgetCode\(\);\s*\n\s*\}\s*\n\s*setNeedsName\(true\)/);
});

// ── renaming ────────────────────────────────────────────────────────────────

test("the design can be renamed later, from the planner", () => {
  assert.match(CLIENT, /RenameDesignModal/);
  assert.match(HOOK, /const renameDesign = useCallback/);
  // The same field as the first screen, so the two cannot drift apart in what
  // they accept or in how the placeholder behaves.
  assert.match(CLIENT, /import DesignNameField from "\.\/DesignNameField"/);
});

test("renaming opens holding the current name, not empty", () => {
  // This is an edit. Starting blank would turn fixing a typo into retyping.
  assert.match(CLIENT, /useState\(currentName \|\| ""\)/);
});

test("the name is on screen while designing, on both layouts", () => {
  // It used to say "Room planner", which told nobody anything they did not know.
  assert.ok(!/>Room planner</.test(CLIENT), "the top bar still says Room planner");
  assert.equal((CLIENT.match(/Rename this design/g) || []).length >= 2, true, "one layout is missing the rename");
});

test("a rename to something too short is refused rather than blanking the name", () => {
  assert.match(PATCH, /isUsableDesignName\(body\.name\)/);
  assert.match(PATCH, /Please give the design a longer name/);
  assert.match(PATCH, /cleanDesignName\(body\.name\)/);
});

// ── the back catalogue ──────────────────────────────────────────────────────
//
// THE HOLE THIS CLOSES. Everything above only fires when there is no session to
// resume. Anybody who has used the planner before has a code saved, so they
// would go straight back into a design called "My design" and never be asked,
// and the admin list would stay unreadable for as long as anybody kept using an
// old session. Which, since the planner has been live a while, is everybody.

test("the names that are not really names are recognised", () => {
  ["My design", "my design", "  My  Design ", "Untitled design", "Untitled", "New design", "Design", "", "  ", "x"]
    .forEach((name) => assert.equal(isPlaceholderDesignName(name), true, `${JSON.stringify(name)} is not a name`));
});

test("a real name is left alone", () => {
  ["Kitchen at 14 Marine Parade", "Nan's laundry", "Butler's pantry", "Rental unit 3"]
    .forEach((name) => assert.equal(isPlaceholderDesignName(name), false, `${name} is a real name`));
});

test("coming back to an unnamed design gets asked, once", () => {
  assert.match(HOOK, /isPlaceholderDesignName\(data\.project\?\.name\)/);
  assert.match(HOOK, /setNamingExisting\(true\);\s*\n\s*setNeedsName\(true\)/);
});

test("answering it renames that design rather than starting a new one", () => {
  // Their work must not be thrown away to get a name onto it.
  const naming = HOOK.slice(HOOK.indexOf("const nameAndStart"), HOOK.indexOf("}, [renameDesignByCode, startFresh]);"));
  assert.match(naming, /if \(codeRef\.current\) \{/);
  assert.match(naming, /renameDesignByCode\(codeRef\.current, name\)/);
  assert.match(naming, /\} else \{\s*\n\s*await startFresh\(name\)/);
});

test("the rename reads the code from a ref, not from state", () => {
  // The gate answers in the same tick the code was set, so a callback closed
  // over the state value would still be holding null and rename nothing.
  assert.match(HOOK, /codeRef\.current = data\.code/);
  assert.match(HOOK, /const renameDesign = useCallback\(\(name\) => renameDesignByCode\(codeRef\.current, name\)/);
});

test("a returning visitor is not told we are starting something new", () => {
  // They would think their work had been lost.
  assert.match(GATE, /resuming \? "What should we call this design\?"/);
  assert.match(GATE, /Everything you have drawn is still there/);
  assert.match(GATE, /resuming \? "Save and carry on" : "Start designing"/);
});

test("starting over goes back to creating rather than renaming", () => {
  const startOver = HOOK.slice(HOOK.indexOf("function startOver()"), HOOK.indexOf("// \"Send my design to PCD\""));
  assert.match(startOver, /codeRef\.current = null/, "the gate would rename the design just abandoned");
  assert.match(startOver, /setNamingExisting\(false\)/);
});
