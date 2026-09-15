// WHERE AN ORDER IS UP TO.
//
// The pill in the orders list. Each case here is a job that read wrong before:
// in-house panels reading as undecided, a finished job reading as waiting to go
// out, and materials past their ETA with nothing on the list saying so.

import test from "node:test";
import assert from "node:assert/strict";

import { orderPanels, orderStage } from "../lib/pcd-order-stage.js";

const TODAY = "2026-09-15";
const planned = { status: "active", scheduled_start_date: "2026-09-01", target_completion_date: "2026-10-30" };
const line = (fields) => ({ status: "Not Ordered", production_stage: "Not Started", ...fields });
const plans = (...entries) => Object.fromEntries(entries.map((entry, i) => [`p${i}`, entry]));
const at = (lines, context = {}) => orderStage(planned, lines, { today: TODAY, ...context });

test("who makes it is read from the line when the plan only holds a stage", () => {
  // Simon Green: made in house on the line, the plan only ever had a stage written to it.
  const lines = [line({ fulfilment_method: "in_house", panel_planning: plans({ production_stage: "Not Started" }) })];
  assert.equal(orderPanels(lines[0])[0].fulfilment_method, "in_house");
  assert.equal(at(lines).key, "ready_to_start");
});

test("the plan still wins where it has an answer", () => {
  const lines = [line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Ordered" }) })];
  assert.equal(orderPanels(lines[0])[0].status, "Ordered");
});

test("an undecided panel is job planning", () => {
  assert.equal(at([line({})]).key, "planning");
});

test("board still to buy for an in-house panel counts as a panel to order", () => {
  const lines = [
    line({ fulfilment_method: "supplier_ready_made" }),
    line({ fulfilment_method: "in_house", panel_planning: plans({ board_required: true }) }),
  ];
  const stage = at(lines);
  assert.equal(stage.key, "materials");
  assert.equal(stage.label, "2 panels to order");
});

test("a supplier ETA that has passed without arrival is check materials", () => {
  const lines = [line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Ordered", supplier_eta: "2026-09-12" }) })];
  const stage = at(lines);
  assert.equal(stage.key, "check_materials");
  assert.match(stage.why, /12 September/);
});

test("an ETA of today is not late yet", () => {
  const lines = [line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Ordered", supplier_eta: TODAY }) })];
  assert.equal(at(lines).key, "with_supplier");
});

test("board past its ETA with the panel still not started is check materials", () => {
  const lines = [line({ fulfilment_method: "in_house", panel_planning: plans({ board_required: true, supplier_ordered_at: "2026-09-01", supplier_eta: "2026-09-10" }) })];
  assert.equal(at(lines).key, "check_materials");
});

test("received means it came, so it is not late, but it is not made until checked", () => {
  const lines = [line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Received", supplier_eta: "2026-09-01" }) })];
  assert.equal(at(lines).key, "in_production");
});

test("every panel checked is ready to deliver, or to install when one is booked", () => {
  const lines = [line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Checked" }) })];
  assert.equal(at(lines).key, "ready_to_deliver");
  assert.equal(at(lines, { installBooked: true }).key, "ready_to_install");
});

test("a panel at ready for install makes the job ready to install", () => {
  const lines = [
    line({ fulfilment_method: "in_house", panel_planning: plans({ production_stage: "Ready for Install" }) }),
    line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Checked" }) }),
  ];
  assert.equal(at(lines).key, "ready_to_install");
});

test("everything installed or complete on an open order is ready to close off", () => {
  // Tori Pree: sixteen panels complete, order still active, used to read as ready to deliver.
  const lines = [line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Complete" }, { status: "Installed" }) })];
  assert.equal(at(lines).key, "ready_to_close");
});

test("our bench working beats waiting on a supplier", () => {
  const lines = [
    line({ fulfilment_method: "in_house", panel_planning: plans({ production_stage: "Cutting" }) }),
    line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Ordered" }) }),
  ];
  assert.equal(at(lines).key, "in_production");
});

test("materials ready is ready to start, not in production", () => {
  const lines = [line({ fulfilment_method: "in_house", panel_planning: plans({ production_stage: "Materials Ready" }) })];
  assert.equal(at(lines).key, "ready_to_start");
});

test("an issue shows where the job is up to beside it", () => {
  const lines = [line({ fulfilment_method: "supplier_ready_made", panel_planning: plans({ status: "Checked" }) })];
  const stage = at(lines, { openIssues: 1 });
  assert.equal(stage.key, "issue");
  assert.equal(stage.alongside.key, "ready_to_deliver");
  assert.equal(stage.alongside.overdue, false);
});
