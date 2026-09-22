// A VALUE READ BEFORE THE LINE THAT CREATES IT.
//
// ── WHY THIS RULE EXISTS ─────────────────────────────────────────────────────
//
// On 21 September 2026 every quote in the admin was a dead page. One block in
// QuoteEditor.js sat twenty-nine lines above the `totals` it named:
//
//     const creditApplied = useMemo(
//       () => applyCredits(heldCredits, totals.total_inc_gst),
//       [heldCredits, totals.total_inc_gst]          // <- read on this line
//     );
//     ...
//     const totals = useMemo(...)                    // <- created here
//
// A dependency array is an ordinary array literal. It is built the moment that
// line runs, not later when the page is drawn, so this threw
// "Cannot access 'totals' before initialization" before the first render
// finished. The same edit left a credit lookup below its first use in
// pcd-site-measure-booking.js, which killed a refunded site measure
// cancellation.
//
// Nothing caught either one. `next build` compiled both, all 3265 tests passed,
// and `no-undef` found nothing, because `no-undef` only reports a name that
// exists nowhere. These names exist. They are just not ready yet.
//
// ── WHY NOT THE STOCK RULE ───────────────────────────────────────────────────
//
// ESLint ships `no-use-before-define`, and it cannot be switched on here: it
// reports about 130 places in this codebase where a function mentions something
// declared lower down. Those are all fine, because the function is not called
// until after the declaration has run. Shipping 130 errors would mean turning
// the rule off again within a day.
//
// So this reports only the fatal case: a read that genuinely runs before its own
// declaration, with no function boundary in between to defer it. That came back
// clean across the whole repository on the day it was written, which is what
// makes it safe to have as an error.
//
// ── WHAT IT DELIBERATELY DOES NOT REPORT ─────────────────────────────────────
//
//   A name used inside a function that is called later. The whole 130.
//   A `var`, which is hoisted and initialised to undefined rather than throwing.
//   A function declaration, which is fully hoisted.
//   An export specifier, because `export { a }` above `const a` is legal.

/** The nearest scope that actually runs as a unit: a function, or the file. */
function runningScopeOf(scope) {
  let current = scope;
  while (current && current.type !== "function" && current.type !== "module" && current.type !== "global") {
    current = current.upper;
  }
  return current;
}

export const noReadBeforeDeclared = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Report a let/const read that runs before its own declaration, which throws at runtime and takes the whole page down.",
    },
    schema: [],
    messages: {
      readBeforeDeclared:
        "'{{name}}' is read here but not created until line {{line}}, and nothing defers this read. " +
        "At runtime this throws \"Cannot access '{{name}}' before initialization\" and the page shows " +
        "an application error. Move this below line {{line}}.",
    },
  },

  create(context) {
    const source = context.sourceCode;

    return {
      "Program:exit"() {
        const reported = new Set();

        const walk = (scope) => {
          for (const reference of scope.references) {
            const variable = reference.resolved;
            if (!variable || !variable.defs.length) continue;

            const definition = variable.defs[0];
            // Only let and const sit in the dead zone. A `var` is hoisted to
            // undefined and a function declaration is hoisted whole.
            if (definition.type !== "Variable") continue;
            if (definition.parent.kind === "var") continue;

            const declared = definition.name;
            // Written later in the file than the declaration, so it cannot run first.
            if (reference.identifier.range[0] >= declared.range[0]) continue;
            // `export { a }` above `const a` is legal and does not read anything.
            if (reference.identifier.parent?.type === "ExportSpecifier") continue;
            // A function boundary between the two means the read is deferred
            // until that function is called, which is after the declaration.
            if (runningScopeOf(reference.from) !== runningScopeOf(variable.scope)) continue;

            const at = reference.identifier.range[0];
            if (reported.has(at)) continue;
            reported.add(at);

            context.report({
              node: reference.identifier,
              messageId: "readBeforeDeclared",
              data: { name: variable.name, line: String(declared.loc.start.line) },
            });
          }

          scope.childScopes.forEach(walk);
        };

        walk(source.getScope(source.ast));
      },
    };
  },
};

const plugin = { rules: { "no-read-before-declared": noReadBeforeDeclared } };

export default plugin;
