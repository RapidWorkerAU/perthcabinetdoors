// HOW ONE LINE READS, WRITTEN DOWN ONCE.
//
// The builder shows a line, the list page shows the same line, and the review
// page shows it a third time in one sentence. Three copies of "what does this
// line say" is three chances for the list to describe a door differently from
// the page that made it, and the customer has no way to tell which one we are
// going to quote.
//
// Pure, and takes the line object the builder holds, so it can be tested
// without a browser.

const text = (value) => String(value ?? "").trim();

/** Height first, the same way round as every form, label and document here. */
export function sizeText(line = {}) {
  if (!line.width && !line.height) return "";
  return `${line.height || "-"} x ${line.width || "-"}`;
}

export function materialText(line = {}) {
  // A hardware line has no board, and its name is its entire spec. This answers
  // "what is this line for", which for a door is the board and for a handle is
  // the handle. Showing a dash made the one line whose spec is its name the
  // only line that did not show it.
  if (line.hardwareName) return text(line.hardwareName);
  return [line.thickness, line.material].map(text).filter(Boolean).join(" ");
}

export function colourText(line = {}) {
  return [line.finish, line.colour].map(text).filter(Boolean).join(" - ");
}

/**
 * What the line IS, in as few words as carry it.
 *
 * A panel says which kind it is, because "Panel" covers an end panel, a filler,
 * a kickboard and a scribe, and those are not the same thing to anybody
 * standing in a kitchen.
 */
export function lineTitle(line = {}) {
  const type = text(line.type) || text(line.productType) || "Item";
  const use = text(line.panelUse);
  return use ? `${type}, ${use.toLowerCase()}` : type;
}

/** The builder's one-line version, for a table row. */
export function itemTitle(line = {}) {
  return [lineTitle(line), materialText(line), sizeText(line)].filter(Boolean).join(" - ");
}

/**
 * The lines of detail under the title on a list card.
 *
 * Only what was answered. A card reading "Edge profile: none" is a question
 * dressed up as an answer, and half of these questions are never put to half
 * of the item types.
 */
export function lineDetailLines(line = {}) {
  const out = [];

  const board = [materialText(line), colourText(line)].filter(Boolean).join(" · ");
  if (board) out.push(board);

  const front = [
    text(line.profile) ? `${[text(line.profileType), text(line.profile)].filter(Boolean).join(" ")} front` : "",
    text(line.edgeMould) ? `${text(line.edgeMould)} edge` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (front) out.push(front);

  const size = sizeText(line);
  if (size) out.push(`${size} mm`);

  // Only ever asked of a decorative board line, so an answer here means it was
  // asked. All four is our standard and is not worth a line; anything else is a
  // deliberate instruction to the bench and is.
  if (Array.isArray(line.bandedEdges)) {
    if (!line.bandedEdges.length) out.push("No edges banded");
    else if (line.bandedEdges.length < 4) out.push(`Banded ${line.bandedEdges.join(", ").toLowerCase()}`);
  }

  if (line.preDrill) {
    const drilled = [text(line.hingeQty), text(line.holeType)].filter(Boolean).join(", ");
    const side = text(line.hingeSide) ? `hinged ${text(line.hingeSide).toLowerCase()}` : "";
    out.push([drilled || "Drilled for hinges", side].filter(Boolean).join(", "));
  }

  if (text(line.cabinetBrand)) out.push(`Going on ${text(line.cabinetBrand)}`);

  return out;
}

/** The review page's version: everything about one line, on one line. */
export function lineOneLiner(line = {}) {
  const size = sizeText(line);
  return [lineTitle(line), size ? `${size} mm` : "", materialText(line)].filter(Boolean).join(" · ");
}

/**
 * The same thing, minus what it is.
 *
 * For anywhere the title is already printed in bold directly above, which is
 * every basket and every list card. lineOneLiner there reads "2 x Door" with
 * "Door · 400 x 400 mm · 18mm Thermolaminate" under it, and the reader is told
 * twice what it is and once what it is made of.
 *
 * Colour first, because after "which door" the next question anybody asks is
 * what colour, and it is the part they chose rather than the part we decided.
 */
export function lineSpecLine(line = {}) {
  const size = sizeText(line);
  return [colourText(line), materialText(line), size ? `${size} mm` : ""].filter(Boolean).join(" · ");
}
