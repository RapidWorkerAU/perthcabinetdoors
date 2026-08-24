// Every note attached to a line, in one place.
//
// WHY THIS EXISTS. A line can carry four notes written by three different
// people at three different times, and each of them is an instruction to
// somebody holding a saw:
//
//   the panel note        typed on the order against this one panel
//   the production note   typed on the order against the whole line
//   the internal note     typed on the quote line, "production, mitres,
//                         hinges, runners"
//   the client note       typed on the quote line as the wording the customer
//                         reads, and often the only place a decision agreed on
//                         the phone was ever written down
//
// THEY ADD UP, THEY DO NOT REPLACE EACH OTHER. The screen used to take the
// first one it found, so writing a note against a panel silently hid whatever
// the quote had said about that line. The production sheet had already been
// fixed to show all of them, which meant the sheet and the screen disagreed
// about the same line, and the one the workshop reads was the one nobody was
// checking. Both now come through here so they cannot drift apart again.
//
// Framework free and pure, so a React table and a PDF generator can share it.

// The order they read in, most specific first. A panel note is about this exact
// piece; a client note is about the job. Somebody scanning a sheet should hit
// the narrowest instruction first.
export const NOTE_SOURCES = [
  { key: "panel", label: "Panel" },
  { key: "production", label: "Production" },
  { key: "internal", label: "From the quote" },
  { key: "client", label: "Told the customer" },
];

function clean(value) {
  return String(value ?? "").trim();
}

/**
 * Every note on a line, labelled and de-duplicated.
 *
 * `plan` is the panel plan for one panel, or nothing when the line is not split
 * into panels. Pass the panel's OWN note here, never a merged one: merging
 * twice is how the same sentence ends up printed three times.
 *
 * Duplicates are dropped case-insensitively, because the same instruction typed
 * once on the quote and again on the panel is one instruction, and reading it
 * twice on a sheet makes a person wonder which one is current.
 */
export function lineNotes(item = {}, plan = {}) {
  const candidates = [
    { key: "panel", text: clean(plan?.notes) },
    { key: "production", text: clean(item?.production_notes) },
    { key: "internal", text: clean(item?.notes) },
    { key: "client", text: clean(item?.client_note) },
  ];

  const seen = new Set();
  const notes = [];

  for (const candidate of candidates) {
    if (!candidate.text) continue;
    const fingerprint = candidate.text.toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    notes.push({
      ...candidate,
      label: NOTE_SOURCES.find((source) => source.key === candidate.key)?.label || "Note",
    });
  }

  return notes;
}

/**
 * The same notes as one string, for a table cell or a PDF column.
 *
 * Unlabelled on purpose. The column is narrow, the labels would cost more room
 * than they earn, and a person reading a production sheet needs the instruction
 * rather than its provenance. The labels are on the screen, where there is room
 * to ask where a note came from.
 */
export function lineNotesText(item, plan, separator = " · ") {
  return lineNotes(item, plan)
    .map((note) => note.text)
    .join(separator);
}

/** Is there anything written against this line at all. */
export function hasLineNotes(item, plan) {
  return lineNotes(item, plan).length > 0;
}
