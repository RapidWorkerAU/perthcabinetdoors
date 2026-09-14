/*
 * THE REQUEST SOMEBODY IS PART WAY THROUGH WRITING.
 *
 * Building a request is three pages now: the builder, the list, and who they
 * are. Three pages is three component trees, so the list has to live somewhere
 * that survives the walk between them. This is what makes pressing "Review my
 * list" show the list instead of an empty page.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A fake browser, because the store is written against one. Fresh per test, so
// one test cannot leave a list lying around for the next.
function browser(seed) {
  const store = seed === undefined ? {} : { "pcd.quote-draft.v1": seed };
  globalThis.window = {
    localStorage: {
      getItem: (key) => store[key] ?? null,
      setItem: (key, value) => {
        store[key] = value;
      },
      removeItem: (key) => {
        delete store[key];
      },
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return store;
}

// Module state is per import, and the store hydrates once. A cache buster gives
// each test its own store rather than one they all share.
let seq = 0;
async function freshStore(seed) {
  browser(seed);
  seq += 1;
  return import(`../lib/pcd-quote-draft.js?t=${seq}`);
}

const LINE = { id: "l1", type: "Door", material: "Decorative Board", height: "720", width: "397", qty: 2 };

// ── WE HAVE NOT LOOKED IS NOT IT IS EMPTY ────────────────────────────────────
//
// A server render has no localStorage, so the first paint of the list page is
// always an empty list whatever the customer actually has. Without something
// telling those apart, somebody with nine doors is told their list is empty for
// as long as it takes to hydrate, and that is the one sentence on that page
// they have to be able to believe.

test("a draft that has been read says so, and one that has not does not", async () => {
  const { readQuoteDraft } = await freshStore(JSON.stringify({ lines: [LINE], details: {} }));
  assert.equal(readQuoteDraft().ready, true);
  assert.equal(readQuoteDraft().lines.length, 1);
});

test("an empty browser is still a browser we have looked in", async () => {
  const { readQuoteDraft } = await freshStore();
  const draft = readQuoteDraft();
  assert.equal(draft.ready, true, "nothing stored is an answer, not the absence of one");
  assert.deepEqual(draft.lines, []);
});

test("and the pages hold their empty state until it is", () => {
  ["app/(site)/request-quote/list/QuoteListClient.js", "app/(site)/request-quote/send/QuoteSendClient.js"].forEach(
    (path) => {
      assert.match(read(path), /if \(!draft\.ready\) return/, `${path} claims the list is empty before looking`);
    }
  );
});

// ── WHAT IT KEEPS ────────────────────────────────────────────────────────────

test("the builder hands over its lines and they come back whole", async () => {
  const { readQuoteDraft, writeQuoteLines } = await freshStore();
  writeQuoteLines([LINE]);
  assert.deepEqual(readQuoteDraft().lines, [LINE]);
});

test("nonsense on the disk is read as an empty list rather than thrown", async () => {
  const { readQuoteDraft } = await freshStore("{ not json");
  assert.deepEqual(readQuoteDraft().lines, []);
  assert.equal(readQuoteDraft().ready, true);
});

test("something of the right shape but the wrong type does not get through", async () => {
  const { readQuoteDraft } = await freshStore(JSON.stringify({ lines: "three doors", details: 7 }));
  assert.deepEqual(readQuoteDraft().lines, []);
  assert.deepEqual(readQuoteDraft().details, {});
});

test("details survive a failed send, so nobody types their email twice", async () => {
  const { readQuoteDraft, writeQuoteDetails } = await freshStore();
  writeQuoteDetails({ firstName: "Sarah", email: "sarah@example.com" });
  writeQuoteDetails({ phone: "0400 000 000" });
  assert.deepEqual(readQuoteDraft().details, {
    firstName: "Sarah",
    email: "sarah@example.com",
    phone: "0400 000 000",
  });
});

// ── WHAT THE LIST PAGE MAY CHANGE ────────────────────────────────────────────
//
// A quantity and a removal, and nothing else. Anything more is a second copy of
// the rules about what a thermolaminate front may be asked, and the builder is
// where those live.

test("the list page can change a quantity", async () => {
  const { readQuoteDraft, setLineQty, writeQuoteLines } = await freshStore();
  writeQuoteLines([LINE, { ...LINE, id: "l2" }]);
  setLineQty("l1", 5);
  assert.equal(readQuoteDraft().lines[0].qty, 5);
  assert.equal(readQuoteDraft().lines[1].qty, 2, "and leaves the others alone");
});

test("a quantity is never zero or a fraction of a door", async () => {
  const { readQuoteDraft, setLineQty, writeQuoteLines } = await freshStore();
  writeQuoteLines([LINE]);
  for (const [given, expected] of [[0, 1], [-4, 1], ["", 1], ["nonsense", 1], [2.6, 3], ["7", 7]]) {
    setLineQty("l1", given);
    assert.equal(readQuoteDraft().lines[0].qty, expected, `qty ${JSON.stringify(given)}`);
  }
});

test("the list page can remove a line", async () => {
  const { readQuoteDraft, removeLine, writeQuoteLines } = await freshStore();
  writeQuoteLines([LINE, { ...LINE, id: "l2" }]);
  removeLine("l1");
  assert.deepEqual(readQuoteDraft().lines.map((line) => line.id), ["l2"]);
});

test("it offers no way to change anything else", () => {
  const store = read("lib/pcd-quote-draft.js");
  const exported = [...store.matchAll(/export function (\w+)/g)].map((match) => match[1]);
  assert.deepEqual(exported.sort(), [
    "clearQuoteDraft",
    "draftItemCount",
    "readQuoteDraft",
    "removeLine",
    "setLineQty",
    "useQuoteDraft",
    // The count for the badge in the nav. A read, not a way to change anything.
    "useQuoteDraftCount",
    "writeQuoteDetails",
    "writeQuoteLines",
  ]);
});

// ── SENT IS NOT A DRAFT ──────────────────────────────────────────────────────

test("sending clears it, so pressing back cannot send it twice", async () => {
  const { clearQuoteDraft, readQuoteDraft, writeQuoteDetails, writeQuoteLines } = await freshStore();
  writeQuoteLines([LINE]);
  writeQuoteDetails({ email: "sarah@example.com" });
  clearQuoteDraft();
  assert.deepEqual(readQuoteDraft().lines, []);
  assert.deepEqual(readQuoteDraft().details, {}, "and their details go with it");
});

test("the send page clears it before it leaves the page", () => {
  const send = read("app/(site)/request-quote/send/QuoteSendClient.js");
  const cleared = send.indexOf("clearQuoteDraft()");
  const pushed = send.indexOf("router.push(");
  assert.ok(cleared > -1 && pushed > -1);
  assert.ok(cleared < pushed, "a draft still on disk after the redirect is one somebody can send again");
});

// ── COUNTING ─────────────────────────────────────────────────────────────────

test("the count is doors, not lines", async () => {
  const { draftItemCount } = await freshStore();
  assert.equal(draftItemCount([{ qty: 2 }, { qty: 8 }, { qty: 1 }]), 11);
  assert.equal(draftItemCount([{ qty: "" }, {}]), 2, "a line with no quantity is still one thing");
  assert.equal(draftItemCount(null), 0);
});

// ── THE BUILDER'S SIDE OF IT ─────────────────────────────────────────────────

test("the builder restores what it had before it imports anything on top", () => {
  const form = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  const restore = form.indexOf("const kept = readQuoteDraft().lines");
  const importList = form.indexOf('const code = params.get("list")');
  assert.ok(restore > -1 && importList > -1);
  assert.ok(restore < importList, "an imported cabinet is new and belongs after what is already there");
});

test("Edit on the list page opens that line, not a blank one", () => {
  // The builder no longer lists anything, so landing on a blank row after
  // pressing Edit would leave somebody with no way back to the door they meant.
  const list = read("app/(site)/request-quote/list/QuoteListClient.js");
  assert.match(list, /href=\{`\/request-quote\?edit=\$\{encodeURIComponent\(line\.id\)\}`\}/);

  const form = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  assert.match(form, /const editing = params\.get\("edit"\)/);
  assert.match(
    form,
    /setEditingId\(kept\.some\(\(line\) => line\.id === editing\) \? editing : null\)/,
    "an id for a line that is not there must not open an empty editor"
  );
});

// ── THE BADGE IN THE NAV ─────────────────────────────────────────────────────
//
// It counted the configurator's inbox only. The builder DRAINS that inbox on
// mount and clears it, so adding a door on /request-quote left the badge
// showing nothing: the one place somebody most expects a running count is the
// one place it never appeared.

// THE BADGE MOVED OUT OF THE NAV AND INTO ONE BASKET.
//
// The header used to carry a My list button and a Cart button side by side.
// It now carries a single "Your items" basket, which is the arrangement chosen
// deliberately, so these assertions follow it to components/public/
// PublicItemsPanel.js. What they are guarding has not changed: the count has to
// come from the store the builder actually writes to, and the way to the list
// has to be the list page.
test("the basket counts both stores, because from outside it is one list", () => {
  const panel = read("components/public/PublicItemsPanel.js");
  // The original fault: it counted the configurator's inbox, which the builder
  // drains on mount, so adding a door on /request-quote left the badge at
  // nothing. Counting the draft itself is what fixed it.
  assert.match(panel, /import \{ draftItemCount, useQuoteDraft \} from "@\/lib\/pcd-quote-draft"/);
  assert.match(panel, /const quoteCount = draftItemCount\(quoteLines\)/);
  assert.match(panel, /const cartCount = cartPieceCount\(cartLines\)/);
  assert.match(panel, /const total = quoteCount \+ cartCount/, "one basket, so the badge is one number");
});

test("and once there is a real list page, the badge goes there", () => {
  // A drawer over the top of the list page would be showing somebody their list
  // twice, in two different shapes. The drawer is gone; the panel is a way in
  // to the page rather than a second copy of it.
  const panel = read("components/public/PublicItemsPanel.js");
  assert.match(panel, /href="\/request-quote\/list"/);
  assert.equal(
    existsSync(new URL("../components/public/QuoteListDrawer.js", import.meta.url)),
    false,
    "the drawer must stay gone"
  );
});

test("the builder does not list the request a second time", () => {
  // The list is a page of its own. Two of them means the one somebody edits is
  // not necessarily the one they are looking at.
  const form = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  ["productSummaryTable", "productCardList", "productTableWrap", "productLineCard"].forEach((cls) => {
    assert.ok(!form.includes(cls), `the old ${cls} is still under the builder`);
  });
  assert.match(form, /href="\/request-quote\/list"/, "and it says where the list actually is");
});

test("the builder will not write an empty list over a full one on its first render", () => {
  // The trap: on the first commit the builder holds one blank starter row and
  // the restore has not run. An unguarded mirror fires in that gap and wipes
  // the list of somebody who walked to the list page and pressed back.
  const form = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  assert.match(form, /if \(mountedItemsRef\.current === null\) \{\s*\n\s*mountedItemsRef\.current = items;\s*\n\s*return;/);
  assert.match(form, /if \(items === mountedItemsRef\.current\) return;/);
});

test("only saved lines are handed over", () => {
  // A half typed row is not on their list yet, and showing it there as an item
  // would be counting a question as an answer.
  const form = read("app/(site)/request-quote/RequestQuoteFormClient.js");
  assert.match(form, /writeQuoteLines\(items\.filter\(\(row\) => row\.saved\)/);
});
