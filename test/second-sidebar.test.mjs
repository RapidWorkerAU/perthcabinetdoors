// THE SECOND SIDEBAR.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Four places carry a second sidebar: the quote builder, the order page,
// account settings, and the two grouped sections (Reporting and Option
// Libraries) that share one component. They are meant to be one pattern, so
// that somebody moving between an order and a report is not relearning where
// things are.
//
// Reporting's was written from scratch rather than copied, and came out close
// enough to look right on its own screen and obviously wrong the moment you
// clicked between the two: 208 wide against 220, a #dbd8cc border against
// #edf4eb, a heavier header, and coloured dots that exist nowhere else.
//
// THAT IS THE FAILURE MODE THIS CATCHES. Not a broken page. A page that looks
// fine alone and makes the product feel assembled from parts the moment it sits
// next to its neighbour. Nothing in a build or a render notices it.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
// The grouped sections share ONE component rather than a copy each. The two
// inline ones match it. If the pattern changes it changes everywhere, or
// nowhere.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const SHARED = read("app/admin/_components/SecondarySidebar.tsx");
const PANELS = {
  "quote builder": read("app/admin/quotes/[id]/QuoteEditor.js"),
  "order page": read("app/admin/orders/[id]/OrderDetail.js"),
  "account settings": read("app/admin/_components/AccountSettingsForm.tsx"),
  "the shared component": SHARED,
};

// The marks every one of them carries.
const MARKS = [
  ["a 220 wide panel", /w-\[220px\]/],
  ["the pale green right border", /border-r border-\[#edf4eb\]/],
  ["on white", /bg-white/],
  ["a nav of tightly stacked rows", /p-3 flex flex-col gap-\[2px\]/],
  ["the active row in pale green", /bg-\[#edf4eb\] text-\[#1c2b1e\]/],
  ["and the rest grey until hovered", /text-\[#5a5a52\] hover:bg-\[#f5f8f4\]/],
];

Object.entries(PANELS).forEach(([name, source]) => {
  test(`${name} uses the shared pattern`, () => {
    MARKS.forEach(([what, pattern]) => {
      assert.match(source, pattern, `${name} is missing ${what}`);
    });
  });
});

test("the plain row is identical to the quote builder's and the order page's", () => {
  // Account settings is deliberately left out: its rows carry icon squares and
  // are a pixel taller for it. The rest are plain text rows.
  const ROW = /px-3 py-\[9px\] rounded-\[6px\] w-full text-left text-\[13px\] font-medium transition-colors/;
  ["quote builder", "order page", "the shared component"].forEach((name) => {
    assert.match(PANELS[name], ROW, `${name} does not use the plain row`);
  });
});

test("the header is the same block as the order page's", () => {
  // A small uppercase eyebrow over the name, then a way back. Not a bold title
  // with a count under it, which is what Reporting had.
  const EYEBROW = /text-\[11px\] font-semibold uppercase tracking-wider text-\[#8b8a81\]/;
  const NAME = /text-\[15px\] font-semibold text-\[#1a1a18\] truncate/;
  const BACK = /text-\[12px\] text-\[#6b9e61\] hover:underline/;
  [PANELS["order page"], SHARED].forEach((source) => {
    assert.match(source, EYEBROW);
    assert.match(source, NAME);
    assert.match(source, BACK);
  });
});

test("nothing was invented for one screen alone", () => {
  assert.ok(!/rounded-full/.test(SHARED), "coloured dots are not part of the pattern");
  assert.ok(!/shadow-\[inset/.test(SHARED), "an inset rule is not how an active row is marked");
  assert.ok(!/border-\[#dbd8cc\]/.test(SHARED), "the panel border is #edf4eb, not the table border");
  assert.ok(!/w-\[208px\]/.test(SHARED), "the panel is 220 wide like the others");
});

test("every grouped section is still reachable on a phone", () => {
  // The desktop panel is hidden below md, so hiding it and adding nothing would
  // leave no way to open a second screen on a phone.
  assert.match(SHARED, /hidden md:flex/, "the panel is desktop only");
  assert.match(SHARED, /md:hidden/, "so something has to take its place");
  assert.match(SHARED, /overflow-x-auto/, "and it scrolls rather than wrapping");
});

test("the grouped sections share the component rather than copying it", () => {
  // Two uses were the point at which copying it a third time would have started
  // the drift over again.
  const shells = ["app/admin/reporting/ReportingShell.tsx", "app/admin/option-libraries/LibrariesShell.tsx"];
  shells.forEach((path) => {
    const source = read(path);
    assert.match(source, /from '\.\.\/_components\/SecondarySidebar'/, `${path} must use the shared sidebar`);
    assert.ok(!/w-\[220px\]/.test(source), `${path} must not draw its own panel`);
  });

  // And no fifth copy has appeared under app/admin.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      const source = readFileSync(full, "utf8");
      const rel = full.slice(root.length + 1).replace(/\\/g, "/");
      const known = [
        "app/admin/_components/SecondarySidebar.tsx",
        "app/admin/_components/AccountSettingsForm.tsx",
        "app/admin/quotes/[id]/QuoteEditor.js",
        "app/admin/orders/[id]/OrderDetail.js",
      ];
      if (/border-r border-\[#edf4eb\]/.test(source) && /w-\[220px\]/.test(source) && !known.includes(rel)) {
        offenders.push(rel);
      }
    }
  };
  walk(join(root, "app/admin"));
  assert.deepEqual(offenders, [], `these draw their own second sidebar instead of using the shared one: ${offenders.join(", ")}`);
});

// ── the four libraries behind one row ───────────────────────────────────────

const SHELL = read("app/admin/_components/AdminShell.tsx");
const LIBRARIES = read("app/admin/option-libraries/LibrariesShell.tsx");
const LIBRARY_ROUTES = [
  "/admin/options",
  "/admin/profiles",
  "/admin/benchtop-materials",
  "/admin/hardware",
];

test("the four libraries are one row in the main rail", () => {
  assert.match(SHELL, /label: 'Option Libraries'/);
  ["'Board Library'", "'Profile Library'", "'Benchtop Library'", "'Hardware Library'"].forEach((label) => {
    assert.ok(!SHELL.includes(`label: ${label}`), `${label} should no longer be its own row in the rail`);
  });
  // But all four are still listed in the second sidebar.
  LIBRARY_ROUTES.forEach((route) => {
    assert.ok(LIBRARIES.includes(route), `${route} is missing from the libraries sidebar`);
  });
});

test("the row stays lit on all four libraries, not just the first", () => {
  // Each library kept its own address, so they share no path prefix. Without
  // `covers` the rail would look inactive on three of the four pages it owns.
  assert.match(SHELL, /covers\?: string\[\]/, "NavItem must carry the extra routes");
  assert.match(SHELL, /covers: \['\/admin\/profiles', '\/admin\/benchtop-materials', '\/admin\/hardware'\]/);
  assert.match(SHELL, /isActive\(pathname, item\.href, item\.covers\)/, "and every call site must pass it");
  assert.ok(
    !/isActive\(pathname, item\.href\)(?!,)/.test(SHELL),
    "a call site that forgets covers leaves the row dark on three pages"
  );
});

test("no library route moved, so nothing linking to one broke", () => {
  LIBRARY_ROUTES.forEach((route) => {
    const page = join(root, "app", route.replace("/admin/", "admin/"), "page.js");
    assert.ok(readFileSync(page, "utf8").includes("LibrariesShell"), `${route} must render inside the shell`);
  });
});

// ── financials is a report ──────────────────────────────────────────────────

const REPORTING = read("app/admin/reporting/ReportingShell.tsx");

test("financials sits in the reporting sidebar, not in the main rail", () => {
  // It was its own row directly beside Reporting, which is two rows for one
  // idea. It is a report, so it is listed with the reports.
  assert.match(REPORTING, /href: '\/admin\/financials', label: 'Financials'/);
  assert.ok(
    !/label: 'Financials'/.test(SHELL),
    "Financials should no longer be its own row in the rail"
  );
});

test("the reporting row stays lit while you are on financials", () => {
  // /admin/financials shares no prefix with /admin/reporting, so without this
  // the rail goes dark on the report people open most.
  assert.match(SHELL, /covers: \['\/admin\/financials'\]/);
});

test("the financials route did not move", () => {
  const page = read("app/admin/financials/page.tsx");
  assert.match(page, /ReportingShell/, "it renders inside the reporting shell");
  assert.ok(!/AdminShell/.test(page), "and not the bare admin shell as well");
});

// ── settings sits with log out ──────────────────────────────────────────────

test("settings is below the divider, directly above log out", () => {
  // It is about your own account rather than about the work, so it does not
  // belong in the scrolling list of sections. Down here it also stays put when
  // that list scrolls.
  assert.match(SHELL, /const FOOTER_ITEMS: NavItem\[\] = \[\s*\n\s*\{ label: 'Settings'/);

  // Scoped to NAV_ITEMS alone. Settings legitimately appears again further down
  // in BOTTOM_MORE, the phone sheet, which has no divider to pin it under.
  const navList = SHELL.slice(SHELL.indexOf("const NAV_GROUPS"), SHELL.indexOf("const NAV_ITEMS"));
  assert.ok(
    !navList.includes("label: 'Settings'"),
    "Settings must not still be in the scrolling nav list"
  );

  // Rendered inside the footer block, before the log out button.
  const footer = SHELL.slice(SHELL.indexOf("{/* Footer."), SHELL.indexOf("{/* Collapse toggle */}"));
  assert.ok(footer.includes("FOOTER_ITEMS.map"), "the footer renders the pinned items");
  assert.ok(
    footer.indexOf("FOOTER_ITEMS.map") < footer.indexOf("onClick={onLogout}"),
    "settings comes above log out, not below it"
  );
});

test("the phone sheet keeps settings in the same company", () => {
  // The sheet has no divider to sit under, so the order carries the grouping:
  // last in the list, directly above the log out button beneath it.
  const more = SHELL.slice(SHELL.indexOf("const BOTTOM_MORE"), SHELL.indexOf("// ── Page title lookup"));
  const labels = [...more.matchAll(/label: '([^']+)'/g)].map(hit => hit[1]);
  assert.equal(labels[labels.length - 1], "Settings", "settings is the last row before log out");
  assert.ok(!labels.includes("Financials"), "financials is reached through Reporting here too");
});

// ── work management ─────────────────────────────────────────────────────────

const WORK = read("app/admin/work-management/WorkShell.tsx");

test("the board and the calendar are one row under Dashboard", () => {
  // Both answer the question of what is happening now, and the rail is a list
  // of parts of the business rather than of screens.
  assert.match(SHELL, /label: 'Work Management'/);
  const nav = SHELL.slice(SHELL.indexOf("const NAV_GROUPS"), SHELL.indexOf("const NAV_ITEMS"));
  assert.ok(!nav.includes("label: 'The Board'"), "the board is no longer its own row");
  assert.ok(!nav.includes("label: 'Calendar'"), "and neither is the calendar");

  // Directly under Dashboard, which is where it was asked to sit.
  const labels = [...nav.matchAll(/label: '([^']+)'/g)].map(hit => hit[1]);
  assert.equal(labels[0], "Dashboard");
  assert.equal(labels[1], "Work Management");
});

test("the row stays lit on the calendar as well as the board", () => {
  assert.match(SHELL, /label: 'Work Management'[^}]*covers: \['\/admin\/calendar'\]/);
});

test("neither route moved", () => {
  ["/admin/board", "/admin/calendar"].forEach(route => {
    assert.ok(WORK.includes(route), `${route} must be listed in the work sidebar`);
  });
  assert.match(read("app/admin/board/page.tsx"), /WorkShell/);
  assert.match(read("app/admin/calendar/page.js"), /WorkShell/);
  // The mobile bottom bar still links straight at the board, which is the most
  // used screen in the admin and should stay one tap away.
  assert.match(SHELL, /const BOTTOM_PRIMARY[\s\S]*?label: 'Board',\s+href: '\/admin\/board'/);
});

test("work management uses the shared sidebar, not a copy", () => {
  assert.match(WORK, /from '\.\.\/_components\/SecondarySidebar'/);
  assert.ok(!/w-\[220px\]/.test(WORK), "it must not draw its own panel");
});

test("the board finally has a breadcrumb", () => {
  // It had no PAGE_TITLES entry, so the busiest screen in the admin has always
  // read "Admin" in the topbar.
  assert.match(SHELL, /'\/admin\/board':\s+'The Board'/);
});

// ── the rail is grouped ─────────────────────────────────────────────────────

test("the rail is grouped under quiet headings", () => {
  // Eleven rows in one column is a list you read every time rather than a shape
  // you learn.
  const groups = SHELL.slice(SHELL.indexOf("const NAV_GROUPS"), SHELL.indexOf("const NAV_ITEMS"));
  ["Day to day", "Winning work", "Insight", "Set up"].forEach((heading) => {
    assert.ok(groups.includes(`heading: '${heading}'`), `${heading} must be a group`);
  });

  // Dashboard is above the first heading, ungrouped: it is the way back rather
  // than a part of the business.
  assert.match(groups, /heading: null,\s*\n\s*items: \[\{ label: 'Dashboard'/);
});

test("a heading is a signpost, not a row", () => {
  // Anything louder competes with the items under it, which are the things you
  // actually click.
  const nav = SHELL.slice(SHELL.indexOf("{/* Nav."), SHELL.indexOf("{/* Footer."));
  assert.match(nav, /text-\[10px\] font-semibold uppercase tracking-\[0\.1em\]/, "small, spaced and quiet");
  assert.match(nav, /color: TEXT_SUBTLE/, "and the faintest text colour the rail has");
});

test("collapsed to the icon rail, the grouping survives without the words", () => {
  // There is no room for a heading at 56px, so a hairline rule carries the same
  // break rather than the groups silently merging into one list.
  const nav = SHELL.slice(SHELL.indexOf("{/* Nav."), SHELL.indexOf("{/* Footer."));
  assert.match(nav, /collapsed \? \(\s*\n\s*<div className="mx-3 my-2 h-px"/);
});

test("nothing was dropped when the rail was grouped", () => {
  // The flat list became five groups by hand, which is exactly the edit where a
  // row goes missing and nobody notices for a month.
  const groups = SHELL.slice(SHELL.indexOf("const NAV_GROUPS"), SHELL.indexOf("const NAV_ITEMS"));
  [
    "Dashboard", "Work Management", "Customers", "Enquiries", "Quote Requests",
    "Quotes", "Orders", "Reporting", "Design Tool", "Products", "Option Libraries",
  ].forEach((label) => {
    assert.ok(groups.includes(`label: '${label}'`), `${label} is missing from the rail`);
  });

  // And the flattened list is still what the notification panel reads.
  assert.match(SHELL, /const NAV_ITEMS: NavItem\[\] = NAV_GROUPS\.flatMap\(group => group\.items\)/);
});
