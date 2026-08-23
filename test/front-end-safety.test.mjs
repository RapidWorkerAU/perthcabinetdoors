// THE PUBLIC SIDE, WHERE A BUG IS A REPUTATION.
//
// Three things a customer can send us from the website: an enquiry, a quote
// request from the form, and a design from the planner. Each of them saves a
// record and then sends emails, and each of them has to be honest about what
// happened.
//
// These cover the two ways that went wrong: telling somebody their message
// failed when we had it, and letting them build something we cannot make.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areasForPart, PUBLIC_PARTS, readPartBoard, writePartBoard } from "../lib/pcd-public-config.js";
import { attemptSend, customerNoticeFor, reportSendFailures } from "../lib/pcd-notify.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── "we could not send your message" when we had it ────────────────────────
//
// All three saved the record and THEN sent email, throwing if a send failed.
// The throw became a 500 and the form said "Could not send". The customer sends
// it again, or gives up and rings somebody else. The worst version needed
// nothing to be wrong: our own notification went out fine, only the customer's
// confirmation copy bounced, and we still said the whole thing failed.

test("a thrown send is caught, not propagated", async () => {
  const result = await attemptSend("business", async () => {
    throw new Error("network down");
  });
  assert.deepEqual(result, { label: "business", ok: false, error: "network down" });
});

// Resend resolves with { error } rather than throwing, so catching only throws
// would let a real failure through as a success.
test("a send that resolves with an error is a failure too", async () => {
  const result = await attemptSend("customer", async () => ({ error: { message: "bounced" } }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "bounced");
});

test("a send that worked is a success", async () => {
  const result = await attemptSend("business", async () => ({ data: { id: "x" } }));
  assert.deepEqual(result, { label: "business", ok: true });
});

test("failures are reported for us and returned, never thrown", () => {
  const errors = [];
  const original = console.error;
  console.error = (message) => errors.push(message);
  try {
    const failures = reportSendFailures("enquiry", [
      { label: "business", ok: true },
      { label: "customer", ok: false, error: "bounced" },
    ]);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].label, "customer");
    assert.equal(errors.length, 1, "and it has to be findable in the logs");
    assert.match(errors[0], /customer email did not send/);
  } finally {
    console.error = original;
  }
});

// Their own copy failing is worth saying: they will be watching for it, and its
// absence would otherwise look like we ignored them. Our notification failing is
// not their problem, and the record is on the admin screen either way.
test("the customer is told only about the email that was theirs", () => {
  assert.match(customerNoticeFor([{ label: "customer", ok: false, error: "x" }]), /we have your details/);
  assert.equal(customerNoticeFor([{ label: "business", ok: false, error: "x" }]), "");
  assert.equal(customerNoticeFor([]), "");
});

test("none of the three public forms can fail after saving the record", () => {
  [
    ["app/api/enquiries/route.js", "the enquiry form"],
    ["app/api/quote-requests/route.js", "the quote request form"],
    ["app/api/public/design/[code]/submit/route.js", "the design planner"],
  ].forEach(([path, what]) => {
    const source = read(path);
    assert.match(source, /reportSendFailures/, `${what} still lets an email failure reach the customer`);
    assert.match(source, /customerNoticeFor/, `${what} does not tell the customer when their copy failed`);
  });
});

// The library used to throw from inside the send. A caller that forgot to catch
// would put the bug straight back.
test("the shared sender returns its failures rather than throwing them", () => {
  const source = read("lib/pcd-quote-request.js");
  assert.match(source, /results\.push\(await attemptSend\("business"/);
  assert.match(source, /results\.push\(await attemptSend\("customer"/);
  assert.doesNotMatch(source, /throw new Error\(businessEmail\.error/);
  assert.doesNotMatch(source, /throw new Error\(customerEmail\.error/);
});

// ── a door that cannot be made ─────────────────────────────────────────────
//
// The planner asked board, thickness, profile, edge, then colour. Brand arrived
// with the colour, at the END, so the profile and the edge were both chosen
// before anybody knew whose range they had to come from. A Laminex colour under
// a Polytec edge was a few clicks away, and neither half is wrong on its own.

// It is asked straight after the board, ahead of the thickness as well.
// Somebody who wants Laminex and picks 21mm first would reach the brand step,
// find no Laminex, and conclude we do not sell it. The truth is only that
// they chose a thickness Laminex does not make, and putting the brand first
// means the wrong turn is not there to take.
test("the planner asks the brand before everything the brand decides", () => {
  const areas = areasForPart({ id: "x", item_type: "base_cabinet" }, "doors", []).map((area) => area.id);
  const brand = areas.indexOf("brand");
  assert.ok(brand > -1, "there has to be a brand step at all");
  assert.ok(brand > areas.indexOf("board"), "but after the board it applies to");
  ["thickness", "profile", "edge", "colour"].forEach((later) => {
    const index = areas.indexOf(later);
    if (index > -1) assert.ok(index > brand, `${later} must be chosen after the brand, not before it`);
  });
});

// Each area names what it waits for, which is what makes the order enforced
// rather than merely suggested.
test("the thickness, the profile and the edge all wait behind the brand", () => {
  const areas = areasForPart({ id: "x", item_type: "base_cabinet" }, "doors", []);
  const by = Object.fromEntries(areas.map((area) => [area.id, area]));
  assert.equal(by.brand.needs, "board");
  assert.equal(by.thickness.needs, "brand");
  if (by.profile) assert.equal(by.profile.needs, "thickness");
  if (by.edge) assert.equal(by.edge.needs, by.profile ? "profile" : "thickness");
});

// A benchtop is not something we make, so it has no brand, profile or edge.
test("a benchtop is not asked for a brand it does not have", () => {
  const areas = areasForPart({ id: "x", item_type: "base_cabinet" }, "benchtop", []).map((area) => area.id);
  assert.ok(areas.length, "benchtop is a real part, so an empty list means the test is asking the wrong thing");
  assert.ok(!areas.includes("brand"), "a benchtop has no brand to choose");
  assert.ok(!areas.includes("edge"));
});

// A part is finished when it has a board, a thickness and a colour. Adding the
// brand step must not make every design already saved look unfinished.
test("a part that already has a brand reads as answered", () => {
  const item = {
    id: "x",
    item_type: "base_cabinet",
    door_style: { material: "thermolaminate", thickness_mm: 18, supplier: "Polytec", colour: "Char Oak" },
  };
  const areas = areasForPart(item, "doors", []);
  const brand = areas.find((area) => area.id === "brand");
  assert.ok(brand, "doors have a brand step");
  assert.equal(brand.answered, true, "a design saved before this step existed must not read as unfinished");
});

// ── the planner's lists follow the brand ───────────────────────────────────

const PART_WINDOW = read("app/(site)/design/PartConfigWindow.js");

test("the colour, the shapes and the edges all narrow to the chosen brand", () => {
  assert.match(PART_WINDOW, /coloursInStockForBrand\(rows, materialLabel, thicknessMm, supplier\)/);
  // The shapes are READ from the library for this brand, not filtered out of
  // Polytec's hardcoded list. A filter can only subtract: of Laminex's 27 shapes
  // exactly one shares a name with a Polytec one, so the old intersection left a
  // Laminex board offering that single shape, under a Polytec range chip.
  assert.match(PART_WINDOW, /profilesForSupplier\(asSelectionRows\(profileRows\), \{/);
  assert.doesNotMatch(PART_WINDOW, /brandProfileNames/, "the intersection is gone, not just unused");
  assert.match(PART_WINDOW, /const edges = brandMakesEdges \? edgesFor\(materialLabel\) : \[\]/);
});

// Laminex makes no edges. Saying so is the truth; an empty grid reads as broken.
test("a brand that makes no edges says so rather than showing nothing", () => {
  assert.match(PART_WINDOW, /does not make edge profiles, so there is nothing to choose here/);
});

test("a brand that makes no shapes says so too", () => {
  assert.match(PART_WINDOW, /does not make a shaped face on this board/);
});

// A failed catalogue read must not silently delete two steps.
test("an unread catalogue leaves the steps alone rather than emptying them", () => {
  assert.match(PART_WINDOW, /!supplier \|\| !profileRows\s*\n\s*\? true/);
  // The shapes fall back to the hardcoded list when the library could not be
  // read, rather than to an empty grid that reads as "this brand makes none".
  assert.match(PART_WINDOW, /: profileTypesInStock\(rows, materialLabel, thicknessMm\)\.flatMap/);
  assert.match(PART_WINDOW, /if \(!res\.ok \|\| !data\?\.ok\) return null/, "a bad response is not an empty catalogue");
});

// Changing brand has to take the other brand's choices with it, including the
// one a panel keeps somewhere else.
test("changing brand clears what the new one cannot make", () => {
  assert.match(PART_WINDOW, /\{ clearProfile: true, clearEdge: true \}/);
  assert.match(
    PART_WINDOW,
    /if \(def\.panelKey\) setPanelOpt\(\{ profile_type: "", profile: "" \}\)/,
    "a panel keeps its profile in panel_options, which writeBoard does not reach"
  );
});

// Brand is a step now. A "clear filters" that also reset it would undo an answer
// two steps up from a control that looks like it only touches the list below.
test("clearing the colour filters does not silently change the brand", () => {
  assert.doesNotMatch(PART_WINDOW, /setBrand\("all"\)/);
});

// ── the server still refuses a mixed line ──────────────────────────────────
//
// The steps above mean a customer is never offered the invalid combination. This
// is for everything that is not the steps: a tab open from before the change, or
// a request replayed by hand.

test("the planner's submit is guarded, not only its screens", () => {
  const source = read("app/api/public/design/[code]/submit/route.js");
  assert.match(source, /createSupplierGuard/);
  assert.match(source, /firstSupplierConflict\(lines, checkSupplier/);
  assert.match(source, /status: 400/);
});

// ── NO PART MAY HAVE A STEP IT CANNOT ANSWER ───────────────────────────────
//
// This caught a dead end while it was being written, and it is the reason the
// brand step is not simply added to everything.
//
// A shelf keeps its board in shelf_material / shelf_colour, and the carcass
// keeps its own in material / colour. Neither of those shapes has a supplier
// field. Asking those parts for a brand gave them a step whose answer could not
// be saved: it never read as answered, and the edge and the colour behind it
// stayed locked. The part became impossible to finish, with nothing on screen
// to say why.
//
// They lose nothing by being skipped, because neither offers a profile or an
// edge, so there is no second range for their colour to be mixed with.

test("every part that is asked for a brand can actually store one", () => {
  const stuck = [];
  PUBLIC_PARTS.forEach((def) => {
    const item = { id: "x", item_type: "base_cabinet" };
    const asked = areasForPart(item, def.key, []).some((area) => area.id === "brand");
    if (!asked) return;
    const written = writePartBoard(item, def.key, { material: "m", colour: "c", supplier: "Polytec", thickness_mm: 18 });
    const back = readPartBoard({ ...item, ...written }, def.key);
    if (!back.supplier) stuck.push(def.key);
  });
  assert.deepEqual(stuck, [], "these parts ask for a brand they cannot save, so they can never be finished");
});

// The other half of the same rule: a step nothing depends on is fine, but a step
// something waits for must be reachable.
test("nothing waits on a step that part was never given", () => {
  PUBLIC_PARTS.forEach((def) => {
    const areas = areasForPart({ id: "x", item_type: "base_cabinet" }, def.key, []);
    const ids = new Set(areas.map((area) => area.id));
    areas.forEach((area) => {
      if (!area.needs) return;
      assert.ok(ids.has(area.needs), `${def.key}: "${area.id}" waits for "${area.needs}", which it never gets`);
    });
  });
});

// ── THE NOTICE HAS TO REACH THE PERSON IT IS ABOUT ─────────────────────────
//
// Returning it from the route and never rendering it would be the same bug in a
// quieter form: they are told everything went fine, and then no email arrives.

test("every public form shows the notice next to its success message", () => {
  [
    ["app/(site)/contact/ContactFormClient.js", "the contact form"],
    ["app/(site)/request-quote/RequestQuoteFormClient.js", "the quote request form"],
    ["app/(site)/launch/page.js", "the launch page enquiry"],
  ].forEach(([path, what]) => {
    assert.match(read(path), /result\.notice/, `${what} drops the notice on the floor`);
  });
  assert.match(read("app/(site)/design/PublicDesignClient.js"), /setNotice\(res\.notice \|\| ""\)/);
});

// It is a success, not a failure: we have their message either way.
test("a bounced confirmation is not shown as an error", () => {
  const planner = read("app/(site)/design/PublicDesignClient.js");
  assert.match(planner, /if \(res\?\.ok\) \{\s*\n\s*setNotice/, "the notice belongs on the ok path");
  assert.match(planner, /setStep\("choose"\); setError\(""\); setNotice\(""\); \}/, "and is cleared for the next send");
});

// ── A HANDLER THAT CANNOT RUN ──────────────────────────────────────────────
//
// Undoing a settlement called setIsSaving, which does not exist in that file.
// It threw a ReferenceError on the first line, before the request was made, so
// the button did nothing at all and the console said why to nobody.
//
// Lint calls this no-undef and it is worth keeping at zero: an undefined
// identifier in a click handler is always a button that does not work.

test("no click handler calls a setter its file does not have", () => {
  const order = read("app/admin/orders/[id]/OrderDetail.js");
  assert.doesNotMatch(order, /\bsetIsSaving\(/, "setIsSaving is not defined in OrderDetail");
  assert.match(order, /setSavingPaymentId\(payment\.id\)[\s\S]{0,600}Could not undo this settlement/);
});
