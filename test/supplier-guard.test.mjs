// THE BRAND RULE ON THE SERVER.
//
// The dropdowns are the ease. This is the guarantee, and it has to hold for the
// paths that are not the dropdowns: a stale tab, a replayed request, a line
// copied off an older quote, an import.
//
// A mixed line is not visibly wrong anywhere downstream. The quote shows a real
// colour and a real profile, the order carries both, the production sheet prints
// both, and the first thing that says "these cannot go together" is the factory.
// So the refusal has to happen at the write.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSupplierGuard, firstSupplierConflict } from "../lib/pcd-supplier-guard.js";

const COLOURS = [
  { name: "Classic White", supplier_name: "Polytec", material_type: "Decorative Board", is_active: true },
  { name: "Char Oak", supplier_name: "Polytec", material_type: "Thermolaminate", is_active: true },
  { name: "Riverstone", supplier_name: "Laminex", material_type: "Thermolaminate", is_active: true },
];

const PROFILES = [
  { kind: "door", supplier_name: "Polytec", category: "Alpine", name: "Alpine 3", is_active: true },
  { kind: "door", supplier_name: "Laminex", category: "Series 1", name: "Wave", is_active: true },
  { kind: "edge", supplier_name: "Polytec", category: "Decorative Board", name: "1mm Square Edge", is_active: true },
];

// A stand-in for the two library reads. The real ones take a supabase client;
// what matters to the guard is the rows, so the fake supplies them directly.
function fakeSupabase({ colours = COLOURS, profiles = PROFILES } = {}) {
  let colourReads = 0;
  let profileReads = 0;
  const client = {
    from(table) {
      const rows = table === "pcd_colour_library" ? colours : profiles;
      if (table === "pcd_colour_library") colourReads += 1;
      else profileReads += 1;
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
    counts: () => ({ colourReads, profileReads }),
  };
  return client;
}

test("a Laminex colour under a Polytec profile is refused", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  const problems = check({ supplier_name: "Polytec", colour: "Riverstone", profile: "Alpine 3" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Riverstone is a Laminex colour, not Polytec\./);
});

test("a Polytec profile on a Laminex line is refused", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  const problems = check({ supplier_name: "Laminex", colour: "Riverstone", profile: "Alpine 3" });
  assert.match(problems[0], /Alpine 3 is a Polytec profile, not Laminex\./);
});

// The reason the edge field is hidden rather than shown empty on all three
// screens. A request that carries one anyway is refused rather than silently
// dropping the edge, which would ship a door the customer did not order.
test("an edge on a brand that makes none is refused", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  const problems = check({ supplier_name: "Laminex", colour: "Riverstone", edge_mould: "1mm Square Edge" });
  assert.match(problems[0], /Laminex does not make edge profiles/);
});

test("a line that agrees with itself passes", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  assert.deepEqual(check({ supplier_name: "Polytec", colour: "Char Oak", profile: "Alpine 3", edge_mould: "1mm Square Edge" }), []);
});

// The brand became required for new work only. An older line without one is not
// a conflict, it is a line from before the rule, and refusing it would block
// every edit to historic work.
test("a line with no brand recorded is left alone", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  assert.deepEqual(check({ colour: "Riverstone", profile: "Alpine 3" }), []);
});

// A price adjustment or a job cost carries no board fields at all.
test("a line with no board fields passes without a special case", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  assert.deepEqual(check({ supplier_name: "Polytec", title: "Price adjustment" }), []);
});

// A colour we have never heard of is somebody asking for something we do not
// stock yet. That is a conversation, not a mixed line, and refusing it here
// would say the wrong thing.
test("an unknown colour is not called another brand's", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  assert.deepEqual(check({ supplier_name: "Polytec", colour: "Something We Do Not Stock" }), []);
});

// Both libraries are small and every line is checked against the same two.
test("the libraries are read once for the whole request, not once per line", async () => {
  const client = fakeSupabase();
  const check = await createSupplierGuard(client);
  const lines = Array.from({ length: 10 }, () => ({ supplier_name: "Polytec", colour: "Char Oak" }));
  lines.forEach((line) => check(line));
  const { colourReads, profileReads } = client.counts();
  assert.equal(colourReads, 1, "ten lines must not be ten library reads");
  assert.equal(profileReads, 1);
});

// ── reporting ──────────────────────────────────────────────────────────────

test("the first problem is reported with the line it is on", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  const found = firstSupplierConflict(
    [
      { supplier_name: "Polytec", colour: "Char Oak" },
      { supplier_name: "Polytec", colour: "Riverstone" },
    ],
    check,
    (line, index) => `Line ${index + 1}`
  );
  assert.equal(found.index, 1);
  assert.equal(found.label, "Line 2");
  assert.match(found.problem, /Riverstone is a Laminex colour/);
});

test("all-clean lines report nothing", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  assert.equal(firstSupplierConflict([{ supplier_name: "Polytec", colour: "Char Oak" }], check), null);
});

test("no lines at all is not a failure", async () => {
  const check = await createSupplierGuard(fakeSupabase());
  assert.equal(firstSupplierConflict(null, check), null);
  assert.equal(firstSupplierConflict([], check), null);
});

// ── the writes that must go through it ─────────────────────────────────────

const ROUTES = [
  ["app/api/quote-requests/route.js", "the public quote request"],
  ["app/api/admin/quotes/[id]/_quote-line-save.js", "every quote line, whichever route wrote it"],
  ["app/api/admin/orders/[id]/variations/[variationId]/lines/route.js", "adding a variation line"],
  ["app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js", "editing a variation line"],
];

ROUTES.forEach(([path, what]) => {
  test(`${what} is checked before it is written`, () => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /createSupplierGuard/, `${path} writes a line without the brand check`);
  });
});

// A change action inherits every field the caller left out from the order line
// it acts on, so checking only the payload would miss a mix made half of new
// input and half of old.
test("a variation edit is checked against the merged line, not the fields that arrived", () => {
  const source = readFileSync(
    new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /\(\{ \.\.\.before, \.\.\.updates \}\)/);
});

test("a variation add is checked against the row, which is what lands in the order", () => {
  const source = readFileSync(
    new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/route.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /refuseMixedBrands\(context\.supabase, row\)/);
});

// The refusal is the customer's to fix, so it must not read as a server fault.
test("a mixed line refuses with 400, not 500", () => {
  const save = readFileSync(new URL("../app/api/admin/quotes/[id]/_quote-line-save.js", import.meta.url), "utf8");
  assert.match(save, /refusal\.status = 400/);
  const requests = readFileSync(new URL("../app/api/quote-requests/route.js", import.meta.url), "utf8");
  assert.match(requests, /Please reselect that line and try again[\s\S]{0,220}status: 400/);
});
