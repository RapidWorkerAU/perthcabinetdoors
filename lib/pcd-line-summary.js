// WHAT ONE REQUESTED LINE SAYS, IN WORDS.
//
// A door, its board, its size, its edges, its drilling: the same description in
// every place a person reads a line back rather than edits it. These lived
// inside pcd-email-templates.js, so the only screen that could describe a line
// was an email. The customer desk now needs the same words about the same
// request, and two describers would drift the first time either was touched.
//
// Every one of them takes a line in EITHER shape, camelCase from a form or
// snake_case from the database, because both reach here.

import { hingeCustomerLines } from "./pcd-hinges";
import { bandedEdgesText } from "./pcd-line-details";

export function cleanLineColour(line = {}) {
  const colour = String(line.colour || "").trim();
  const finish = String(line.finish || "").trim();
  if (finish && colour.toLowerCase().startsWith(`${finish.toLowerCase()} - `)) {
    return colour.slice(finish.length + 3).trim();
  }
  return colour;
}

// HEIGHT FIRST, and the column heading above says so. They disagreed once:
// the values were flipped to height-first to match the rest of the site and
// the heading stayed at "W x H", so "700 x 400" meant a 700 wide door to
// anyone reading the heading and a 700 tall door to anyone reading the site.
// If you change the order here, change the heading in quoteLineRows with it.
export function lineDimensions(line = {}) {
  const width = line.width || line.width_mm;
  const height = line.height || line.height_mm;
  if (!width && !height) return "-";
  return `${height || "-"} x ${width || "-"} mm`;
}

export function lineMaterial(line = {}) {
  // A hardware line has no board and its name is its whole spec, so that is
  // what belongs here. The same rule the form's Material column follows: this
  // is "what is the line for", which for a door is the board and for a handle
  // is the handle. It read "-" before, so the customer's confirmation of what
  // they had asked for did not say what they had asked for.
  const board = [line.material, line.thickness].filter(Boolean).join(" / ");
  if (board) return board;
  const named = line.productName || line.product_name || "";
  const type = line.productType || line.product_type || "";
  // Only when it says something the Type column does not. A line whose name
  // is just "Hardware" repeats the column beside it and is better left blank.
  return named && named !== type ? named : "-";
}

export function lineType(line = {}) {
  // A panel by what it is: "Scribe", not six rows all reading "Panel".
  const type = line.productType || line.product_type || "";
  const use = line.panelUse || line.panel_use || "";
  if (use && type === "Panel") return use;
  return type || line.productName || line.product_name || "Line item";
}

/**
 * EVERYTHING ELSE THEY CHOSE FOR ONE ITEM, as short phrases.
 *
 * The table only has room for the board, the size and the quantity, so the
 * customer's copy of their own request could not show the profile, the edges,
 * the drilling or which cabinet it was for, and they had no way to check they
 * had sent it through right. These sit on a line of their own under the item,
 * full width so it reads on a phone, in the same words the quote uses.
 */
export function lineExtras(line = {}) {
  const out = [];
  const text = (value) => String(value ?? "").trim();
  const brand = text(line.supplierName ?? line.supplier_name);
  if (brand) out.push(brand);
  const profile = [line.profileType ?? line.profile_type, line.profile].map(text).filter(Boolean).join(", ");
  if (profile) out.push(`Profile: ${profile}`);
  // Joined into one phrase, so the shared wording's own capitals go after the
  // first part: "Drilled, 2 hinges, hinged left", not "…, Hinged left". A brand
  // name keeps its capital because it is not one of these words.
  const phrase = (parts) => parts
    .map((part, index) => (index && /^(All|Banded|No|Hinged|Bottom|Top|Standard)\b/.test(part) ? part[0].toLowerCase() + part.slice(1) : part))
    .join(", ");
  const edge = [text(line.edgeMould ?? line.edge_mould), bandedEdgesText(line.bandedEdges ?? line.banded_edges)].filter(Boolean);
  if (edge.length) out.push(`Edge: ${phrase(edge)}`);
  // Only a door is drilled. On anything else "No hinge holes" is not an
  // answer to a question anybody was asked.
  if ((line.productType ?? line.product_type) === "Door") out.push(phrase(hingeCustomerLines(line)));
  const cabinet = text(line.cabinetBrand ?? line.cabinet_brand);
  if (cabinet) out.push(`For ${cabinet}`);
  const note = text(line.notes);
  if (note) out.push(`Note: ${note}`);
  return out;
}

/**
 * One requested line as a single readable sentence.
 *
 * "2 x Door, Decorative Board / 16mm, 700 x 550 mm, Woodmatt Angora Oak,
 *  Polytec, Edge: 1mm Bevel Edge, drilled, 2 hinges, hinged left"
 *
 * For anywhere that reads a request back rather than laying it out in columns:
 * the customer desk, a note, a message. The confirmation email's table is the
 * same pieces, arranged as a table.
 */
export function requestLineText(line = {}) {
  const qty = Number(line.qty) || 1;
  const colour = [line.finish, cleanLineColour(line)].filter(Boolean).join(" ");
  const material = lineMaterial(line);
  const size = lineDimensions(line);
  const head = [
    qty + " x " + lineType(line),
    material === "-" ? "" : material,
    size === "-" ? "" : size,
    colour,
  ].filter(Boolean).join(", ");
  const extras = lineExtras(line);
  return extras.length ? head + ", " + extras.join(", ") : head;
}
