// EVERY NOTE ON A LINE, NOT THE FIRST ONE FOUND.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// A line can carry four notes written by three people at three different times,
// and every one of them is an instruction to somebody holding a saw.
//
// The order screen read them with a fallback chain: the panel note, or failing
// that the production note, or failing that the line's note. So the moment
// anybody wrote a note against a panel, whatever the quote had said about that
// line stopped being displayed. Not flagged, not truncated, gone.
//
// The production sheet had already been fixed to add them all up. That left the
// screen and the sheet disagreeing about the same line, and the one the
// workshop actually reads was the one nobody was checking against.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Notes add up. They never replace each other. One definition, used by the
// screen and by the sheet, so the two cannot drift apart again.

import test from "node:test";
import assert from "node:assert/strict";

import { hasLineNotes, lineNotes, lineNotesText, NOTE_SOURCES } from "../lib/pcd-line-notes.js";

const FULL = {
  notes: "Mitre the return",
  production_notes: "Use the offcut from bay 3",
  client_note: "Soft close throughout, as discussed",
};

test("every note comes through, not the first one found", () => {
  const notes = lineNotes(FULL, { notes: "Grain runs vertical" });
  assert.equal(notes.length, 4);
  assert.deepEqual(
    notes.map((note) => note.text),
    ["Grain runs vertical", "Use the offcut from bay 3", "Mitre the return", "Soft close throughout, as discussed"]
  );
});

test("a note against a panel no longer hides what the quote said", () => {
  // This is the whole fault, in one assertion.
  const withPanelNote = lineNotesText(FULL, { notes: "Grain runs vertical" });
  assert.ok(withPanelNote.includes("Mitre the return"), "the quote's production note survives");
  assert.ok(withPanelNote.includes("Soft close throughout, as discussed"), "so does what the customer was told");
});

test("the narrowest instruction reads first", () => {
  // A panel note is about this exact piece. A client note is about the job.
  // Somebody scanning a sheet should hit the specific one first.
  const order = lineNotes(FULL, { notes: "Panel" }).map((note) => note.key);
  assert.deepEqual(order, ["panel", "production", "internal", "client"]);
  assert.deepEqual(NOTE_SOURCES.map((source) => source.key), order);
});

test("the same instruction typed twice is one instruction", () => {
  // Copied from the quote onto the panel, or typed again by somebody who did
  // not scroll. Printing it twice makes a person wonder which one is current.
  const notes = lineNotes({ notes: "Mitre the return" }, { notes: "mitre the RETURN" });
  assert.equal(notes.length, 1, "matched without caring about case");
});

test("blank and missing notes are not notes", () => {
  assert.deepEqual(lineNotes({}, {}), []);
  assert.deepEqual(lineNotes({ notes: "   ", client_note: "" }, { notes: null }), []);
  assert.equal(hasLineNotes({}, {}), false);
  assert.equal(hasLineNotes({ client_note: "Soft close" }, {}), true, "a client note alone still counts");
  // Called with nothing at all, as it is for a line that has no panels.
  assert.deepEqual(lineNotes(), []);
});

test("every note is labelled, so the screen can say where it came from", () => {
  for (const note of lineNotes(FULL, { notes: "Panel" })) {
    assert.ok(note.label, `${note.key} has no label`);
  }
  assert.equal(lineNotes({ client_note: "x" }, {})[0].label, "Told the customer");
});

test("the joined form carries the words and drops the labels", () => {
  // The production sheet's notes column is narrow. A person reading it needs
  // the instruction, not its provenance.
  const text = lineNotesText({ notes: "Mitre the return", client_note: "Soft close" }, {});
  assert.equal(text, "Mitre the return · Soft close");
  assert.ok(!text.includes("Told the customer"), "no labels in the printed column");
});
