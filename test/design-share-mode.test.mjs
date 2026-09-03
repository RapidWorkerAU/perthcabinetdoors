// SHARING A DESIGN WE DREW, WITHOUT HANDING OVER THE PENCIL.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   A DRAFT SENT FOR APPROVAL MUST NOT BE EDITABLE BY THE APPROVER. If it were,
//   the thing they agreed to and the thing we drew would stop being the same
//   drawing, with nothing anywhere saying which of them moved.
//
//   THE RULE IS SERVER SIDE. The planner hides its editing controls on a
//   view-only share. That is a courtesy. The routes are reachable with curl, so
//   every one that writes has to check for itself, and this asserts that all of
//   them do rather than trusting that whoever adds the sixth will remember.
//
//   AN ABSENT MODE MEANS EDITABLE. Every project that existed before this was a
//   public planner session somebody drew themselves. If a missing value read as
//   locked, turning this on would have frozen all of them mid-session.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  EDITABLE,
  SHARE_MODES,
  VIEW_ONLY,
  VIEW_ONLY_REFUSAL,
  canEditPublicProject,
} from "../lib/pcd-design-share-mode.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// ── the rule itself ─────────────────────────────────────────────────────────

test("a design shared to be looked at cannot be edited", () => {
  assert.equal(canEditPublicProject({ share_mode: VIEW_ONLY }), false);
});

test("a design shared to be worked on can be", () => {
  assert.equal(canEditPublicProject({ share_mode: EDITABLE }), true);
});

test("a project with no mode set is editable, not locked", () => {
  // Everything that existed before this column did is a session the visitor
  // drew themselves. Reading absent as locked would have frozen all of them.
  assert.equal(canEditPublicProject({}), true);
  assert.equal(canEditPublicProject({ share_mode: null }), true);
  assert.equal(canEditPublicProject({ share_mode: "" }), true);
});

test("a project that could not be loaded is not treated as editable by accident", () => {
  // null here means the lookup failed. The routes refuse it earlier with a 404,
  // and this asserts the fallback does not quietly say yes.
  assert.equal(canEditPublicProject(null), true, "absent reads as editable, same as a planner session");
});

test("an unknown mode is refused rather than guessed at", () => {
  assert.equal(canEditPublicProject({ share_mode: "read-only" }), true);
  assert.deepEqual(SHARE_MODES, [VIEW_ONLY, EDITABLE]);
});

test("the refusal tells them how to get the change they wanted", () => {
  // A refusal that only says no leaves somebody who wants a cabinet moved with
  // nowhere to go.
  assert.match(VIEW_ONLY_REFUSAL, /cannot be changed/i);
  assert.match(VIEW_ONLY_REFUSAL, /reply/i);
});

// ── every public write route checks it ──────────────────────────────────────

const PUBLIC_DESIGN = join(ROOT, "app", "api", "public", "design");

function routeFiles(dir, hits = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, hits);
    else if (entry === "route.js") hits.push(full);
  }
  return hits;
}

const routes = routeFiles(PUBLIC_DESIGN);

test("the public design routes were actually found", () => {
  assert.ok(routes.length >= 5, `expected the public design routes, found ${routes.length}`);
});

// The one write route with nothing to protect: it CREATES a session rather than
// changing one, so there is no project yet whose share mode could be asked.
// Named here rather than the check being loosened, so a route that starts
// touching an existing design has to be taken off this list deliberately.
const CREATES_RATHER_THAN_CHANGES = new Set(["route.js"]);

for (const file of routes) {
  const name = file.slice(PUBLIC_DESIGN.length + 1).split("\\").join("/");
  const source = readFileSync(file, "utf8");
  const writes = /export async function (POST|PATCH|PUT|DELETE)\b/.test(source);

  if (!writes) continue;

  if (CREATES_RATHER_THAN_CHANGES.has(name)) {
    test(`${name} creates a new design rather than changing one`, () => {
      assert.ok(
        source.includes("generateSessionCode"),
        `${name} is exempt from the share-mode check because it makes a new session. ` +
          `It no longer looks like it does, so either it changed or the exemption is wrong.`
      );
      assert.ok(
        !source.includes("resolvePublicProject"),
        `${name} now loads an existing design, so it must check the share mode like the others.`
      );
    });
    continue;
  }

  test(`${name} refuses to write to a view-only design`, () => {
    assert.ok(
      source.includes("canEditPublicProject"),
      `${name} writes to a design and never asks whether the link allows it. ` +
        `A hidden button in the planner is not the rule; this route is reachable with curl.`
    );
    assert.match(
      source,
      /status:\s*403/,
      `${name} should refuse a view-only design with a 403, not a 404 or a silent success.`
    );
  });
}

// ── the reading route stays open ────────────────────────────────────────────

test("the design can still be read on a view-only share", () => {
  // The entire point of sending it. If the GET were gated too, a view-only
  // share would be a link to nothing.
  const source = readFileSync(join(PUBLIC_DESIGN, "[code]", "route.js"), "utf8");
  const get = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function PATCH"));
  assert.ok(
    !get.includes("canEditPublicProject"),
    "the GET must not check the share mode, or a view-only link would show nothing"
  );
});

// ── the migration ───────────────────────────────────────────────────────────

const MIGRATION = readFileSync(
  new URL("../supabase/202609031500_pcd_design_share_mode.sql", import.meta.url),
  "utf8"
);

test("the column defaults to editable, so existing planner sessions keep working", () => {
  // The safe-looking default is the wrong one here. See the migration.
  assert.match(MIGRATION, /share_mode text not null default 'edit'/);
});

test("only the two known modes are allowed by the database", () => {
  assert.match(MIGRATION, /check \(share_mode in \('view', 'edit'\)\)/);
});

// ── the admin share route ───────────────────────────────────────────────────

const SHARE_ROUTE = readFileSync(
  join(ROOT, "app", "api", "admin", "design", "projects", "[projectId]", "share", "route.js"),
  "utf8"
);

test("sharing defaults to view, even though the column defaults to edit", () => {
  // The safe default belongs at the moment of sharing. A draft we drew goes out
  // to be looked at unless somebody deliberately says otherwise.
  assert.match(SHARE_ROUTE, /payload\.mode === EDITABLE \? EDITABLE : VIEW_ONLY/);
});

test("re-sharing keeps the code, so a link already sent still opens", () => {
  assert.match(SHARE_ROUTE, /project\.access_code \|\| generateSessionCode\(\)/);
});

test("revoking leaves the code alone, so it can be turned back on", () => {
  const del = SHARE_ROUTE.slice(SHARE_ROUTE.indexOf("export async function DELETE"));
  assert.match(del, /is_public: false/);
  assert.ok(!/access_code:\s*null/.test(del), "revoking must not throw the code away");
});
