// Drawer runners: a SPEC carried onto the quote, never a cost.
//
// PCD supplies the drawer front, not the box or the runners — so the runner is
// documentation for whoever fits the drawer. That was already the behaviour;
// these tests make it a decision. The one that matters is that an untouched
// runner still produces a spec: the config panel always showed "standard", but
// the importer read the raw field, so a never-touched bank told the fabricator
// nothing at all.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAWER_RUNNER_LABELS, DEFAULT_DRAWER_RUNNER, resolveRunnerType, runnerLabel,
} from "../lib/pcd-drawer-utils.js";

test("an untouched runner resolves to the default the panel shows", () => {
  // The bug: display defaulted to "standard", the import read `cfg.runner_type`
  // raw. A bank whose runner was never touched imported with a blank note.
  assert.equal(resolveRunnerType({}), DEFAULT_DRAWER_RUNNER);
  assert.equal(resolveRunnerType({}), "standard");
  assert.equal(runnerLabel({}), "Standard ball-bearing");
  // Never blank — a missing runner spec is the failure mode here.
  assert.ok(runnerLabel({}).length > 0);
  assert.ok(runnerLabel({ runner_type: "nonsense" }).length > 0);
});

test("an explicit runner is honoured", () => {
  assert.equal(resolveRunnerType({ runner_type: "soft_close_undermount" }), "soft_close_undermount");
  assert.equal(runnerLabel({ runner_type: "soft_close_undermount" }), "Soft-close undermount");
  assert.equal(runnerLabel({ runner_type: "soft_close_side" }), "Soft-close side-mount");
});

test("an unknown runner falls back rather than leaking a raw key", () => {
  // If a stored value isn't in the catalogue, show the default label, not the
  // raw slug — the note goes on a customer-facing quote.
  assert.equal(resolveRunnerType({ runner_type: "blum_legrabox_x" }), "standard");
  assert.equal(runnerLabel({ runner_type: "" }), "Standard ball-bearing");
});

test("the catalogue is the single source of truth", () => {
  // The config panel builds its dropdown from this map and the importer labels
  // from it, so they can't drift. Every key must have a non-empty label.
  const keys = Object.keys(DRAWER_RUNNER_LABELS);
  assert.ok(keys.includes("standard"));
  assert.ok(keys.includes("soft_close_undermount"));
  assert.ok(keys.includes("soft_close_side"));
  assert.ok(keys.every((k) => DRAWER_RUNNER_LABELS[k]?.length > 0));
  // The default must itself be a real catalogue entry.
  assert.ok(DRAWER_RUNNER_LABELS[DEFAULT_DRAWER_RUNNER]);
});
