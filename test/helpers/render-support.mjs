// WHAT A TEST NEEDS IN ORDER TO ACTUALLY RENDER A PAGE.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// On 21 September 2026 every quote in the admin was a dead page, and all 3,265
// tests passed. They passed because 113 of the 178 test files read source code
// as TEXT rather than running it, and not one test in the suite had ever
// rendered a component. A page guaranteed to throw on open was invisible to the
// whole suite.
//
// Nothing in the existing harness could render one, because a component is not
// plain JavaScript that Node can load:
//
//   1. It is JSX, which Node's parser rejects outright.
//   2. It imports stylesheets, which Node cannot load at all.
//   3. It imports through the "@/..." alias, which only the bundler understands.
//   4. It imports .ts and .tsx files, which Node cannot parse either.
//
// This adds the four things, and nothing else.
//
// ── WHY THE TRANSFORM IS SCOPED TO app/ AND components/ ──────────────────────
//
// Everything under lib/ is plain JavaScript that Node already loads, and 3,265
// existing tests depend on it loading exactly as it does today. Putting those
// files through a compiler to no purpose would slow every test and risk
// changing behaviour the suite has been trusting for months. So the transform
// only touches the two folders that hold components.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
//
// Not a bundler, and not a browser. A render here proves the component can be
// built and produces HTML. It does not prove anything about how it looks, and a
// test must never assert on a class name, because the stylesheet is a stub.
// See test/helpers/css-stub.mjs.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CSS_STUB = new URL("./css-stub.mjs", import.meta.url).href;

// The order the bundler tries, so a folder import lands on the same file.
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

/** Everything the compiler has to handle rather than Node. */
const COMPILED = /\.(tsx?|jsx)$/;

/** The two folders that hold components, as file URLs. */
const COMPONENT_FOLDERS = [
  pathToFileURL(resolvePath(ROOT, "app")).href,
  pathToFileURL(resolvePath(ROOT, "components")).href,
];

function isComponentFile(url) {
  return COMPONENT_FOLDERS.some((folder) => url.startsWith(folder));
}

function firstExisting(basePath) {
  for (const extension of EXTENSIONS) {
    const candidate = basePath + extension;
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  // A stylesheet is not a module. Hand back the stub for every shape of one.
  if (/\.(css|scss|sass)$/.test(specifier)) {
    return { url: CSS_STUB, format: "module", shortCircuit: true };
  }

  // "@/components/ui/Modal" is the alias jsconfig.json sets up, and it means
  // the repository root. Node knows nothing about it.
  if (specifier.startsWith("@/")) {
    const found = firstExisting(resolvePath(ROOT, specifier.slice(2)));
    if (found) return { url: found, format: "module", shortCircuit: true };
  }

  try {
    return await next(specifier, context);
  } catch (error) {
    // A relative import with no extension, which the bundler resolves and Node
    // does not. The existing hook covers ".js"; this covers the rest, including
    // a folder with an index file in it.
    if (specifier.startsWith(".") && context.parentURL) {
      const from = dirname(fileURLToPath(context.parentURL));
      const found = firstExisting(resolvePath(from, specifier));
      if (found) return { url: found, format: "module", shortCircuit: true };
    }
    // "next/link" and its siblings. Next ships them as real files that Node can
    // load, but its package manifest does not list them for Node, so the bare
    // name fails and the same name with .js works. The bundler never has to ask.
    if (!specifier.startsWith(".") && !/\.[cm]?jsx?$/.test(specifier)) {
      try {
        return await next(`${specifier}.js`, context);
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

export async function load(url, context, next) {
  const needsCompiling = COMPILED.test(url) || (url.endsWith(".js") && isComponentFile(url));
  if (!url.startsWith("file:") || !needsCompiling) return next(url, context);

  const source = await readFile(fileURLToPath(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      // Left as ES modules on purpose. Turning these into CommonJS would change
      // how a circular import between two components behaves, which is exactly
      // the kind of difference that makes a test lie.
      module: ts.ModuleKind.ESNext,
      // The modern transform, so a component does not need React in scope.
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      esModuleInterop: true,
      isolatedModules: true,
    },
  });

  return { format: "module", source: outputText, shortCircuit: true };
}
