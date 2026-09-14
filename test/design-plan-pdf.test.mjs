// Smoke tests for the design-plan PDF assembler — it emits a binary buffer, so
// these assert it produces a valid PDF for both the legacy single-room shape
// and the new multi-room shape, and that more rooms means a bigger document.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateDesignPlanPdf } from "../lib/pcd-design-plan-pdf.js";

const room = (name, over = {}) => ({ id: name, name, width_mm: 3000, depth_mm: 2000, height_mm: 2400, ...over });
const cabinet = (over = {}) => ({
  wall: "top", item_type: "base_cabinet", width_mm: 600, height_mm: 720, depth_mm: 560,
  material: "decorative board", finish: "Woodmatt", colour: "Ecru Oak", front_type: "doors", ...over,
});

function isPdf(buf) {
  assert.ok(buf && buf.length > 0, "produced a buffer");
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-", "starts with the PDF magic");
}

test("legacy single-room shape still generates a PDF", () => {
  const buf = generateDesignPlanPdf({
    project: { name: "Smith Kitchen" },
    room: room("Kitchen"),
    items: [cabinet()],
    options: { colourMode: "real" },
  });
  isPdf(buf);
});

test("multi-room shape generates a PDF", () => {
  const buf = generateDesignPlanPdf({
    project: { name: "Smith Reno" },
    rooms: [
      { room: room("Kitchen"), items: [cabinet()], captures: {}, palette: [] },
      { room: room("Laundry"), items: [cabinet({ colour: "White" })], captures: {}, palette: [] },
    ],
    options: { colourMode: "line" },
  });
  isPdf(buf);
});

test("more rooms produce a larger document (more pages)", () => {
  const one = generateDesignPlanPdf({ project: { name: "P" }, rooms: [{ room: room("A"), items: [cabinet()] }] });
  const three = generateDesignPlanPdf({
    project: { name: "P" },
    rooms: [
      { room: room("A"), items: [cabinet()] },
      { room: room("B"), items: [cabinet()] },
      { room: room("C"), items: [cabinet()] },
    ],
  });
  isPdf(one);
  isPdf(three);
  assert.ok(three.length > one.length, "three rooms is larger than one");
});

test("empty input is rejected into a single valid (mostly cover) PDF", () => {
  // No rooms array and no single-room fields — the normaliser falls back to one
  // empty room, which still yields a cover + notes document rather than a throw.
  const buf = generateDesignPlanPdf({ project: { name: "Empty" } });
  isPdf(buf);
});

// ── THE EXPORT CAPTURES THE DRAWING, NOT THE FIRST SVG IT FINDS ─────────────
//
// 13 September 2026. Every elevation page of an exported plan came out as one
// giant pixelated left arrow. The capture asked its container for "svg", and
// the first svg in an elevation is the 14px arrow on the toolbar's Floor Plan
// button, which was then scaled up to fill an A4 page. The drawing itself was
// three elements further down and never looked at.
//
// So both drawings are named, and the export asks for them by name. Anything
// added to a toolbar in future cannot get in front of them again.

test("the plan and the elevation drawings are asked for by name", () => {
  const modal = readFileSync(new URL("../app/admin/design/_components/DesignPlanExportModal.js", import.meta.url), "utf8");
  assert.match(modal, /querySelector\("svg\[data-plan-drawing\]"\)/);
  assert.match(modal, /querySelector\("svg\[data-elevation-drawing\]"\)/);
  // And never by "whichever svg is first".
  assert.ok(!/querySelector\("svg"\)/.test(modal), "no bare svg lookup is left");

  const canvas = readFileSync(new URL("../app/admin/design/_components/DesignCanvas.js", import.meta.url), "utf8");
  const elevation = readFileSync(new URL("../app/admin/design/_components/FrontElevationView.js", import.meta.url), "utf8");
  assert.match(canvas, /data-plan-drawing="true"/, "the plan drawing carries the name");
  assert.match(elevation, /data-elevation-drawing="true"/, "and so does the elevation drawing");
});

test("the capture stage renders no toolbar to be captured", () => {
  const modal = readFileSync(new URL("../app/admin/design/_components/DesignPlanExportModal.js", import.meta.url), "utf8");
  const stage = modal.slice(modal.indexOf("<FrontElevationView"));
  assert.match(stage.slice(0, stage.indexOf("/>")), /chrome=\{false\}/);
});
