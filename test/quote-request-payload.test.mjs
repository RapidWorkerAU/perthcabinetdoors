/*
 * WHAT GOES TO /api/quote-requests.
 *
 * The rule under all of it: only send an answer to a question we actually put.
 * A banding answer on a wrapped front, or hinge positions on a line nobody
 * ticked for drilling, reaches the workshop as an instruction anyway. That is
 * how a door with no holes in it ends up on a sheet with hinge positions on it.
 *
 * There used to be two of these, one inline in the builder and one in
 * lib/pcd-quote-steps.js that nothing outside its own tests ever called. The
 * builder's was the one that ran. Sending moved to /request-quote/send, so it
 * moved here, and the unused one is gone rather than left to be found and
 * trusted by whoever comes next.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  detailProblems,
  hasLineValue,
  hingeMiddlesFor,
  quoteRequestLine,
  quoteRequestPayload,
} from "../lib/pcd-quote-request-payload.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const door = (over = {}) => ({
  id: "l1",
  type: "Door",
  material: "Decorative Board",
  thickness: "18mm",
  finish: "Matt",
  colour: "Classic White",
  supplierName: "Polytec",
  height: "720",
  width: "397",
  qty: "2",
  ...over,
});

// ── ONLY WHERE IT WAS ASKED ──────────────────────────────────────────────────

test("a line nobody ticked for drilling carries no hinge anything", () => {
  // The failure this stops: somebody ticks it, types the positions, unticks it,
  // and the measurements go to the bench anyway.
  const line = quoteRequestLine(door({ preDrill: false, hingeQty: "3 hinges", hingeSide: "Left", holeType: "Blum Inserta", hingeFromBottomMm: "110" }));
  assert.equal(line.hingeHoles, false);
  assert.equal(line.hingeQty, "");
  assert.equal(line.hingeSide, "");
  assert.equal(line.holeType, "");
  assert.equal(line.hingeFromBottomMm, "");
  assert.deepEqual(line.hingeMiddlesMm, []);
});

test("a drilled door carries all of it", () => {
  const line = quoteRequestLine(door({ preDrill: true, hingeQty: "2 hinges", hingeSide: "Left", holeType: "Blum Inserta" }));
  assert.equal(line.hingeHoles, true);
  assert.equal(line.hingeQty, "2 hinges");
  assert.equal(line.hingeSide, "Left");
  assert.equal(line.holeType, "Blum Inserta");
});

test("only a door is drilled, whatever the row happens to be holding", () => {
  // A door that becomes a panel keeps its old answers in the form's state. They
  // are not answers to any question a panel is asked.
  const line = quoteRequestLine(door({ type: "Panel", preDrill: true, hingeQty: "2 hinges" }));
  assert.equal(line.hingeHoles, false);
  assert.equal(line.hingeQty, "");
});

test("nobody asked about banding is different from none of the four", () => {
  assert.equal(quoteRequestLine(door()).bandedEdges, undefined, "not asked");
  assert.deepEqual(quoteRequestLine(door({ bandedEdges: [] })).bandedEdges, [], "asked, and told to leave them raw");
  assert.deepEqual(quoteRequestLine(door({ bandedEdges: ["Top"] })).bandedEdges, ["Top"]);
});

// ── THE FINISH IS NOT PART OF THE COLOUR ─────────────────────────────────────
//
// It used to be glued onto the front of the colour here ("Matt - Classic
// White"), which put the finish in the colour column all the way through to the
// quote editor. The colour picker could then not match it back to a library
// row, so the line arrived unpriced and unselectable.

test("the finish goes across as the finish", () => {
  const line = quoteRequestLine(door());
  assert.equal(line.finish, "Matt");
  assert.equal(line.colour, "Classic White");
});

test("the exact library row travels, so pricing is not a name match", () => {
  const line = quoteRequestLine(door({ colourLibraryId: "abc-123" }));
  assert.equal(line.colourLibraryId, "abc-123");
  assert.equal(line.supplierName, "Polytec", "two suppliers can share a colour name");
});

// ── WHAT A LINE IS CALLED ────────────────────────────────────────────────────

test("a hardware line reads as what they picked", () => {
  // It said "Hardware", and somebody then had to email and ask which handles.
  const line = quoteRequestLine({ type: "Hardware", hardwareName: "Blum 110 clip top", hardwareId: "h1", qty: 8 });
  assert.equal(line.productName, "Blum 110 clip top");
  assert.equal(line.hardwareCatalogueId, "h1");
  assert.equal(line.qty, 8);
});

test("a scribe arrives as a scribe", () => {
  // Six different things all read "Panel" without it.
  assert.equal(quoteRequestLine(door({ type: "Panel", panelUse: "Scribe" })).panelUse, "Scribe");
});

// ── NUMBERS ──────────────────────────────────────────────────────────────────

test("a size that is not a size is left off rather than sent as zero", () => {
  const line = quoteRequestLine(door({ height: "", width: "nonsense" }));
  assert.equal(line.height, undefined);
  assert.equal(line.width, undefined);
});

test("a quantity is always at least one", () => {
  for (const qty of ["", 0, -3, "nonsense", null, undefined]) {
    assert.equal(quoteRequestLine(door({ qty })).qty, 1, `qty ${JSON.stringify(qty)}`);
  }
  assert.equal(quoteRequestLine(door({ qty: "4" })).qty, 4);
});

// ── THE CUPS ─────────────────────────────────────────────────────────────────

test("the positions shown on the drawing are the positions we send", () => {
  // Until somebody types one, the evenly spaced cups they were looking at are
  // what goes to the bench, so the door made is the door on screen.
  const spread = hingeMiddlesFor({ height: "2100", hingeQty: "3 hinges", hingeFromBottomMm: "110", hingeFromTopMm: "110" });
  assert.equal(spread.length, 1);
  assert.ok(spread[0] > 110 && spread[0] < 1990);
});

test("once one is typed by hand, that is what we send", () => {
  const typed = hingeMiddlesFor({
    height: "2100",
    hingeQty: "3 hinges",
    hingeFromBottomMm: "110",
    hingeFromTopMm: "110",
    hingeMiddlesTouched: true,
    hingeMiddlesMm: ["900"],
  });
  assert.deepEqual(typed, [900]);
});

test("a blank one typed by hand is dropped rather than sent as a hole at zero", () => {
  const typed = hingeMiddlesFor({
    height: "2100",
    hingeQty: "4 hinges",
    hingeFromBottomMm: "110",
    hingeFromTopMm: "110",
    hingeMiddlesTouched: true,
    hingeMiddlesMm: ["900", ""],
  });
  assert.deepEqual(typed, [900]);
});

// ── THE WHOLE REQUEST ────────────────────────────────────────────────────────

test("a blank starter row is not an item somebody asked us to price", () => {
  const payload = quoteRequestPayload({
    items: [door(), { id: "blank", type: "", material: "" }],
    details: { firstName: "Sarah", email: "sarah@example.com" },
  });
  assert.equal(payload.lines.length, 1);
  assert.equal(hasLineValue({ type: "", material: "" }), false);
  assert.equal(hasLineValue({ type: "Door" }), true);
});

test("the name goes across as one name", () => {
  const payload = quoteRequestPayload({ items: [], details: { firstName: "Sarah", lastName: "Jones" } });
  assert.equal(payload.customerName, "Sarah Jones");
  assert.equal(quoteRequestPayload({ items: [], details: { firstName: "Sarah" } }).customerName, "Sarah");
});

test("it is marked as coming from the request form", () => {
  assert.equal(quoteRequestPayload({}).source, "request_quote");
});

// ── WHAT STOPS IT BEING SENT ─────────────────────────────────────────────────

test("the missing details are named one by one", () => {
  // "Please check the form" is not something anybody can act on.
  assert.deepEqual(Object.keys(detailProblems({})).sort(), ["email", "firstName", "phone"]);
  assert.deepEqual(detailProblems({ firstName: "Sarah", email: "s@e.com", phone: "0400" }), {});
  assert.deepEqual(Object.keys(detailProblems({ firstName: "   ", email: "s@e.com", phone: "0400" })), ["firstName"]);
});

// ── ONE ANSWER, NOT TWO ──────────────────────────────────────────────────────

test("what it sends is what the endpoint says it takes", () => {
  // The form and the route have to agree on the names or a field is dropped in
  // silence at the boundary. Zod strips what it was not told about, which is
  // how panel_use and the banded edges were lost twice before anybody noticed.
  const route = read("app/api/quote-requests/route.js");
  const schema = route.slice(route.indexOf("const lineSchema"), route.indexOf("const quoteRequestSchema"));
  const line = quoteRequestLine(
    door({
      preDrill: true,
      holeType: "Blum Inserta",
      hingeSide: "Left",
      hingeQty: "4 hinges",
      hingeFromBottomMm: "110",
      hingeFromTopMm: "110",
      bandedEdges: ["Top"],
      panelUse: "",
      note: "match the existing run",
      cabinetBrand: "IKEA Metod",
      hardwareId: "h1",
      colourLibraryId: "c1",
      profileType: "Shaker",
      profile: "Amsterdam",
      edgeMould: "Bevel",
    })
  );
  for (const field of Object.keys(line)) {
    assert.ok(schema.includes(`${field}:`), `the endpoint has no ${field}`);
  }
});

test("nothing else builds a request line of its own", () => {
  const send = read("app/(site)/request-quote/send/QuoteSendClient.js");
  assert.match(send, /quoteRequestPayload\(\{ items: lines, details \}\)/);

  const form = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  assert.ok(!form.includes("hardwareCatalogueId: item.hardwareId"), "the builder kept its own copy");
  assert.ok(!form.includes('source: "request_quote"'), "the builder still sends");

  const steps = read("lib/pcd-quote-steps.js");
  assert.ok(!steps.includes("requestLinePayload"), "the unused second answer is still there to be trusted");
});
