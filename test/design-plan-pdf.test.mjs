// Smoke tests for the design-plan PDF assembler — it emits a binary buffer, so
// these assert it produces a valid PDF for both the legacy single-room shape
// and the new multi-room shape, and that more rooms means a bigger document.
import test from "node:test";
import assert from "node:assert/strict";
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
