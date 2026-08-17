// Stable panel numbers.
//
// The number beside a panel ends up stuck to physical timber. Every case here
// is a way that number could come to point at the wrong piece: renumbering
// after a removal, reusing a retired number, or renumbering because a panel
// moved between the two tables.
import test from "node:test";
import assert from "node:assert/strict";
import { applyPanelNumbers, ensurePanelNumbers, panelNumberKey } from "../lib/pcd-order-panel-numbers.js";

// A stand-in for the panel number table, enforcing the same two unique indexes
// the migration creates.
function fakeSupabase(initial = []) {
  const rows = [...initial];
  return {
    rows,
    from(table) {
      assert.equal(table, "pcd_order_panel_numbers");
      return {
        select() {
          return {
            eq: (_column, orderId) => Promise.resolve({
              data: rows.filter((row) => row.order_id === orderId),
              error: null,
            }),
          };
        },
        insert(newRows) {
          newRows.forEach((row) => {
            // The two unique indexes the migrations create: one number per
            // panel, and one panel per number. A panel is the key scoped to its
            // line item, because a key alone is only unique inside one item.
            const clashKey = rows.find((r) =>
              r.order_id === row.order_id &&
              r.order_line_item_id === row.order_line_item_id &&
              r.panel_key === row.panel_key);
            const clashNo = rows.find((r) => r.order_id === row.order_id && r.panel_no === row.panel_no);
            assert.ok(!clashKey, `panel ${row.order_line_item_id}/${row.panel_key} assigned twice`);
            assert.ok(!clashNo, `panel_no ${row.panel_no} assigned twice`);
            rows.push(row);
          });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const row = (panelKey, itemId = "item-1") => ({ panelKey, itemId });

test("numbers are handed out down the sheet on a fresh order", () => {
  const db = fakeSupabase();
  return ensurePanelNumbers(db, "order-1", [row("line:a"), row("line:b"), row("line:c")])
    .then(({ numbers, stable }) => {
      assert.equal(stable, true);
      assert.deepEqual([...numbers.entries()], [[panelNumberKey("item-1","line:a"), 1], [panelNumberKey("item-1","line:b"), 2], [panelNumberKey("item-1","line:c"), 3]]);
    });
});

test("a second run returns the same numbers and writes nothing new", async () => {
  const db = fakeSupabase();
  const rows = [row("line:a"), row("line:b")];
  await ensurePanelNumbers(db, "order-1", rows);
  const before = db.rows.length;
  const { numbers } = await ensurePanelNumbers(db, "order-1", rows);

  assert.equal(db.rows.length, before, "nothing reassigned");
  assert.deepEqual([...numbers.entries()], [[panelNumberKey("item-1","line:a"), 1], [panelNumberKey("item-1","line:b"), 2]]);
});

test("removing a panel does not renumber the ones after it", async () => {
  // This is the whole point. If number 3 became number 2 when panel 2 was
  // dropped, every label already stuck on timber would start lying.
  const db = fakeSupabase();
  await ensurePanelNumbers(db, "order-1", [row("line:a"), row("line:b"), row("line:c")]);

  const { numbers } = await ensurePanelNumbers(db, "order-1", [row("line:a"), row("line:c")]);
  assert.equal(numbers.get(panelNumberKey("item-1", "line:a")), 1);
  assert.equal(numbers.get(panelNumberKey("item-1", "line:c")), 3, "c keeps the number already on its label");
});

test("a retired number is never handed to a different panel", async () => {
  const db = fakeSupabase();
  await ensurePanelNumbers(db, "order-1", [row("line:a"), row("line:b")]);

  // b is removed by a variation, then a new panel is added by another.
  const { numbers } = await ensurePanelNumbers(db, "order-1", [row("line:a"), row("line:new")]);
  assert.equal(numbers.get(panelNumberKey("item-1", "line:new")), 3, "takes the next free number, not the retired 2");
});

test("a panel moving between the two tables keeps its number", async () => {
  // Fulfilment changing is a planning decision, not a new panel. The piece is
  // the same piece and its label is already printed.
  const db = fakeSupabase();
  await ensurePanelNumbers(db, "order-1", [row("line:a"), row("line:b")]);

  // b is now supplier made, so it comes through in the second group instead.
  const { numbers } = await ensurePanelNumbers(db, "order-1", [row("line:b"), row("line:a")]);
  assert.equal(numbers.get(panelNumberKey("item-1", "line:b")), 2, "unchanged by the reorder");
  assert.equal(numbers.get(panelNumberKey("item-1", "line:a")), 1);
});

test("orders do not share a numbering", async () => {
  const db = fakeSupabase();
  await ensurePanelNumbers(db, "order-1", [row("line:a")]);
  const { numbers } = await ensurePanelNumbers(db, "order-2", [row("line:a")]);
  assert.equal(numbers.get(panelNumberKey("item-1", "line:a")), 1, "each order starts at 1");
});

test("a sheet still prints if the table has not been installed", async () => {
  // A missing migration should not stop the workshop getting its paperwork. It
  // falls back to position, and says so, rather than failing.
  const db = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({
          data: null,
          error: { code: "42P01", message: 'relation "public.pcd_order_panel_numbers" does not exist' },
        }),
      }),
    }),
  };
  const { numbers, stable } = await ensurePanelNumbers(db, "order-1", [row("line:a"), row("line:b")]);
  assert.equal(stable, false);
  assert.deepEqual([...numbers.entries()], [[panelNumberKey("item-1","line:a"), 1], [panelNumberKey("item-1","line:b"), 2]]);
});

test("two cabinets with the same panel name get different numbers", async () => {
  // A real sheet printed 14 and 15 twice, once under an oven cabinet and again
  // under a tall cabinet. Panel keys are only unique inside their own item, so
  // both cabinets produced "cabinet:0:left-side-panel:0" and shared a number.
  const db = fakeSupabase();
  const oven = { panelKey: "cabinet:0:left-side-panel:0", itemId: "oven" };
  const tall = { panelKey: "cabinet:0:left-side-panel:0", itemId: "tall" };

  const { numbers } = await ensurePanelNumbers(db, "order-1", [oven, tall]);
  const ovenNo = numbers.get(panelNumberKey("oven", oven.panelKey));
  const tallNo = numbers.get(panelNumberKey("tall", tall.panelKey));

  assert.ok(ovenNo && tallNo, "both are numbered");
  assert.notEqual(ovenNo, tallNo, "and the two panels do not share a number");
  assert.deepEqual(applyPanelNumbers([oven, tall], numbers).map((row) => row.panelNo), [ovenNo, tallNo]);
});

test("a proposed piece has no key, so it is never numbered", () => {
  const rows = applyPanelNumbers(
    [row("line:a"), { unnumbered: true }],
    new Map([[panelNumberKey("item-1","line:a"), 7]])
  );
  assert.equal(rows[0].panelNo, 7);
  assert.equal(rows[1].panelNo, null);
});
