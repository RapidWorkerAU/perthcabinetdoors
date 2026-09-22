// RENDERING A PAGE THE WAY NEXT DOES, so a test can open one.
//
// ── WHY A PAGE NEEDS MORE THAN A COMPONENT ───────────────────────────────────
//
// test/renders.test.mjs renders the quote editor with nothing but props, and
// that works because the editor asks for nothing from its surroundings. A page
// under app/(site) does: the first thing the customer's quote page does is call
// `useSearchParams()` to read its access code, and outside Next that returns
// null, so the page throws "Cannot read properties of null (reading 'get')"
// before it renders a single character.
//
// The fix is not to fake the module. Next exports the real contexts those hooks
// read from, so this puts real values into them and the component runs the
// genuine `useSearchParams`, the genuine `usePathname` and the genuine
// `useRouter`. Nothing here replaces anything React or Next actually does.
//
// ── WHAT THIS CAN AND CANNOT SHOW ────────────────────────────────────────────
//
// `renderToString` never runs effects. Every page in this codebase loads its
// data in a `useEffect`, so what comes back is the page BEFORE its data
// arrives: the loading state, an empty form, a spinner.
//
// That is not the whole job and it is not nothing. It is the state every single
// visitor sees for the first moment of every visit, it is where the September
// outage threw, and it exercises every module the page imports. A page that
// cannot render here is broken for everybody.
//
// Rendering a page WITH its data needs effects to run, which needs a real DOM.
// See the note at the bottom of this file before adding one.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext, PathParamsContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";

/** A router that records what was asked of it rather than doing it. */
export function recordingRouter() {
  const calls = [];
  const note = (name) => (...args) => { calls.push({ name, args }); };
  return {
    calls,
    push: note("push"),
    replace: note("replace"),
    refresh: note("refresh"),
    back: note("back"),
    forward: note("forward"),
    prefetch: note("prefetch"),
  };
}

/**
 * Render a client page to HTML, with the surroundings Next would give it.
 *
 * `search` is the query string as an object, so a page that reads ?code=ABC
 * gets one. `pathname` and `params` are there for pages that read them.
 */
export function renderPage(Component, { props = {}, search = {}, pathname = "/", params = {}, router } = {}) {
  const searchParams = new URLSearchParams(
    Object.entries(search).map(([key, value]) => [key, String(value)])
  );

  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router || recordingRouter() },
      createElement(
        PathnameContext.Provider,
        { value: pathname },
        createElement(
          PathParamsContext.Provider,
          { value: params },
          createElement(
            SearchParamsContext.Provider,
            { value: searchParams },
            createElement(Component, props)
          )
        )
      )
    )
  );
}

/**
 * Answer every fetch the page makes from a table of routes, for the length of
 * one call.
 *
 * Nothing fetches during `renderToString`, because effects do not run, so this
 * is here for the day something does and for tests that call a loader directly.
 * A route that is asked for and not listed FAILS the test rather than returning
 * empty: a page quietly rendering its "no data" state because the test forgot
 * to stub a route is exactly the kind of test that passes while the page is
 * broken.
 */
export async function withFetch(routes, run) {
  const real = globalThis.fetch;
  const asked = [];

  globalThis.fetch = async (input) => {
    const url = String(input?.url || input);
    asked.push(url);
    const match = Object.keys(routes).find((path) => url.includes(path));
    if (!match) throw new Error(`the page asked for ${url}, which this test did not stub`);
    const body = routes[match];
    return {
      ok: true,
      status: 200,
      json: async () => (typeof body === "function" ? body() : body),
      text: async () => JSON.stringify(typeof body === "function" ? body() : body),
    };
  };

  try {
    return { result: await run(), asked };
  } finally {
    globalThis.fetch = real;
  }
}

// ── IF YOU COME HERE WANTING TO RENDER A PAGE WITH ITS DATA ──────────────────
//
// You need effects to run, which needs react-dom/client and a DOM, which means
// adding jsdom or happy-dom as a dev dependency. That is the normal way to do
// it and it is not a large change, but it IS a new dependency in a project that
// deliberately keeps few, so it is a decision rather than a detail.
//
// Before reaching for it, check whether the thing you want to prove can be
// proved without a page at all. Most of what matters on these pages is a
// decision made in lib/, and a test that calls that function directly is faster,
// clearer and does not depend on a DOM at all. Render tests are for "does this
// page run", not for every rule it obeys.
