// One loader, two themes.
//
// The cabinet-build loader was written for the public site and its rules lived
// in app/(site)/frontend.css, which the admin does not load. The admin design
// tool needs the same loader on a near-black stage. Copying the rules into an
// admin stylesheet would have been the quick answer and the wrong one: two
// copies drift the first time either is touched, and then the "same" animation
// is not the same any more.
//
// So the rules moved next to the component, which imports them itself, and the
// dark theme redefines colour tokens and nothing else. These tests hold that
// line: same geometry, same thresholds, same timing, colours the only
// difference.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const CSS = read("components/public/pcd-loader.css");
const COMPONENT = read("components/public/PcdLoader.js");
const FRONTEND = read("app/(site)/frontend.css");

// ── one copy of the rules ───────────────────────────────────────────────────

test("the loader rules live with the component, not in the site stylesheet", () => {
  assert.match(COMPONENT, /import "\.\/pcd-loader\.css"/, "the component carries its own styles");
  assert.ok(!/^\.pcdLoader\s*\{/m.test(FRONTEND), "frontend.css must not define the loader any more");
  assert.ok(!/^\.pcdBuild/m.test(FRONTEND), "nor any of its parts");
});

test("no admin stylesheet has grown a second copy", () => {
  ["app/admin/design/design.module.css", "app/admin/design/design.mobile.module.css", "app/admin/admin-content.module.css"]
    .forEach((path) => {
      assert.ok(!read(path).includes("pcdBuild"), `${path} must not redefine the loader`);
    });
});

// ── the two themes differ in colour only ────────────────────────────────────

function block(name) {
  const match = CSS.match(new RegExp(`\\${name}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${name} must exist`);
  return match[1];
}

function declaredProperties(body) {
  // Custom properties carry capitals (--pcdLoaderGround), so the character
  // class has to allow them or every token silently fails to match and the
  // checks below pass on an empty list.
  return (body.match(/^\s*(--?[a-zA-Z-]+)\s*:/gm) || []).map((line) => line.trim().replace(/\s*:$/, ""));
}

test("the dark theme sets colour tokens and nothing else", () => {
  // A layout or timing property here would mean the two themes had started to
  // become different loaders.
  declaredProperties(block(".pcdLoader--dark")).forEach((property) => {
    assert.ok(property.startsWith("--pcdLoader"), `dark must not set ${property}`);
  });
});

test("every token the loader reads has a dark value", () => {
  // A token defined only in light would fall through and render a light part on
  // a black stage.
  const lightTokens = declaredProperties(block(".pcdLoader")).filter((p) => p.startsWith("--pcdLoader"));
  const darkTokens = declaredProperties(block(".pcdLoader--dark"));
  assert.ok(lightTokens.length >= 12, "the loader is fully tokenised");
  lightTokens.forEach((token) => {
    assert.ok(darkTokens.includes(token), `${token} has no dark value`);
  });
});

test("no part paints a colour outside the tokens", () => {
  // A literal here would survive the theme swap and stay light on dark.
  const partRules = CSS.match(/^\.pcdBuild(Carcass|Front|Kick|Detail|Swing)\s*\{[^}]*\}/gm) || [];
  assert.equal(partRules.length, 5, "all five drawn parts");
  partRules.forEach((rule) => {
    assert.ok(!/#[0-9a-f]{3,6}/i.test(rule), `hard-coded colour in: ${rule}`);
  });
});

test("the dark ground is transparent, not a black of its own", () => {
  // The admin loader always sits inside a shell that has already painted the
  // stage, and the desktop and mobile shells are two different near-blacks.
  assert.match(block(".pcdLoader--dark"), /--pcdLoaderGround:\s*transparent/);
});

test("the light theme still works without the site stylesheet loaded", () => {
  // The admin does not load frontend.css, so every var() reading a site token
  // needs a literal fallback or the cabinet renders invisible.
  const lightBody = block(".pcdLoader");
  const siteVars = lightBody.match(/var\(--pcd-[a-z-]+[^)]*\)/g) || [];
  assert.ok(siteVars.length, "the light theme does read the site tokens");
  siteVars.forEach((usage) => {
    assert.match(usage, /,\s*[^)]+\)/, `${usage} has no fallback`);
  });
});

// ── the animation is shared, not duplicated ─────────────────────────────────

test("still nothing loops", () => {
  assert.ok(!/@keyframes/.test(CSS), "no keyframes, so there is nothing to restart or flicker");
  assert.ok(!/animation\s*:/.test(CSS), "and no animation shorthand either");
});

test("reduced motion is honoured for both themes at once", () => {
  // The rule targets the shared part classes, so it cannot apply to one theme
  // and not the other.
  const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.pcdBuildPart \{ transition: none; \}/);
  assert.ok(!reduced.includes("--dark"), "not theme specific");
});

// ── where it is used ────────────────────────────────────────────────────────

test("the admin design tool uses the loader, on dark", () => {
  ["app/admin/design/_components/DesignProgram.js", "app/admin/design/_components/DesignProgramMobile.js"]
    .forEach((path) => {
      const src = read(path);
      assert.match(src, /import PcdLoader from/, `${path} must import the loader`);
      assert.match(src, /theme="dark"/, `${path} must ask for the dark theme`);
      assert.ok(!/Loading design project…|>Loading…</.test(src), `${path} still has a plain text loading state`);
      assert.ok(!/Loading 3D view…/.test(src), `${path} still has a plain text 3D loading state`);
    });
});

test("the public site does not ask for the dark theme", () => {
  assert.ok(!read("app/(site)/design/PublicDesignClient.js").includes('theme="dark"'));
});

test("light stays the default, so no existing use changes", () => {
  assert.match(COMPONENT, /theme = "light"/);
  assert.match(COMPONENT, /theme === "dark" \? " pcdLoader--dark" : ""/);
});

// ── one loading state everywhere ─────────────────────────────────────────────
//
// Every page used to write its own line of grey text. They are all the same
// cabinet now, and these hold that: a page that grows a new "Loading..." has
// gone back to looking half rendered rather than working.

const ADMIN_LOADING = read("components/admin/AdminLoading.js");

test("the admin loader is the same component, not a second one", () => {
  assert.match(ADMIN_LOADING, /import PcdLoader from "\.\.\/public\/PcdLoader"/);
  assert.match(ADMIN_LOADING, /variant="content"/);
});

test("the admin loader fills the content area and centres both ways", () => {
  // The shell gives <main> a definite height, so min-h-full resolves against
  // it. Without the centring the cabinet sits at the top left of the area.
  assert.match(ADMIN_LOADING, /min-h-full/);
  assert.match(ADMIN_LOADING, /items-center/);
  assert.match(ADMIN_LOADING, /justify-center/);
});

test("the content variant is transparent, sized for a whole page", () => {
  // The admin shell has already painted its own background. A cream ground of
  // the loader's own would show as a rectangle over it.
  const content = CSS.match(/\.pcdLoader-content\s*\{([^}]*)\}/);
  assert.ok(content, "the content variant exists");
  assert.ok(!/background/.test(content[1]), "it must not paint a ground of its own");
  assert.match(CSS, /\.pcdLoader-content \.pcdLoaderInner \{ width: min\(/);
});

test("no admin page is still writing its own loading text", () => {
  [
    "app/admin/orders/OrdersManager.tsx",
    "app/admin/orders/[id]/OrderDetail.js",
    "app/admin/orders/[id]/variations/[variationId]/VariationEditor.js",
    "app/admin/quotes/QuotesTable.tsx",
    "app/admin/quotes/[id]/QuoteEditor.js",
    "app/admin/enquiries/EnquiriesManager.tsx",
    "app/admin/quote-requests/QuoteRequestsManager.tsx",
    "app/admin/hardware/HardwareManager.js",
    "app/admin/benchtop-materials/BenchtopMaterialsManager.js",
    "app/admin/projects/ProjectsManager.js",
    "app/admin/projects/[id]/ProjectDetail.js",
    "app/admin/business-defaults/BusinessDefaultsManager.js",
  ].forEach((path) => {
    const src = read(path);
    assert.ok(!/>\s*Loading[^<]*<\/|"Loading[^"]*\.\.\."/.test(src), `${path} still has a text loading state`);
    assert.match(src, /AdminLoading/, `${path} must use the shared loader`);
  });
});

test("the shared tables build the cabinet rather than faking rows", () => {
  // Skeleton rows are a different answer to the same question, and having both
  // means the wait looks like two different products depending on the page.
  ["components/ui/DataTable.tsx", "components/ui/AdminDataTable.tsx"].forEach((path) => {
    const src = read(path);
    assert.match(src, /AdminLoading/, `${path} must use the shared loader`);
    assert.ok(!/SkeletonText/.test(src), `${path} still renders skeleton rows`);
  });
});

test("the customer facing pages wait the same way", () => {
  [
    "app/(site)/quotes/QuoteApprovalClient.js",
    "app/(site)/quotes/view/page.js",
    "app/(site)/variations/VariationApprovalClient.js",
    "app/(site)/variations/view/page.js",
    "app/(site)/project/ProjectViewClient.tsx",
  ].forEach((path) => {
    const src = read(path);
    assert.match(src, /PcdLoader/, `${path} must use the loader`);
    assert.ok(!/>\s*Loading[^<]*\.\.\./.test(src), `${path} still has a text loading state`);
    assert.ok(!/theme="dark"/.test(src), `${path} must not ask for the dark theme`);
  });
});
