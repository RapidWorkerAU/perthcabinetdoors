// THE BRAND RULE, ENFORCED ON THE WAY IN.
//
// A door is one brand's colour pressed onto that brand's profile. The ranges
// cannot be mixed, and Laminex makes no edge profiles at all.
//
// Three screens build lines: the public quote form, the quote editor and the
// variation editor. All three narrow their dropdowns by the brand on the line,
// so in normal use nothing invalid can be picked. This is the check behind them,
// for everything that is not normal use: a stale tab open from before the change
// landed, a request replayed by hand, a line copied from an older quote, an
// import. The dropdowns are the ease; this is the guarantee.
//
// ── WHY IT READS THE LIBRARIES RATHER THAN A LIST ───────────────────────────
//
// The brands come from the colours and profiles we actually stock, so adding
// Formica is adding its rows. Nothing here names a brand.
//
// ── WHY ONE READ PER REQUEST ────────────────────────────────────────────────
//
// Both libraries are small and every line is checked against the same two, so
// they are loaded once and handed to each line. The per-line alternative made a
// ten-line request do ten full library reads, which is the same mistake the
// board cost resolver was written to undo.

import { getDatabaseColourRows } from "./pcd-colour-library";
import { getProfileLibraryRows } from "./pcd-profile-library";
import { supplierConflicts } from "./pcd-supplier-selection";

/**
 * Load both catalogues once, ready to check lines against.
 *
 * Returns a function, not the rows, so callers cannot accidentally check
 * against one library and forget the other.
 */
export async function createSupplierGuard(supabase) {
  const [colourRows, profileRows] = await Promise.all([
    getDatabaseColourRows(supabase, { activeOnly: true }),
    getProfileLibraryRows(supabase),
  ]);

  return function checkLine(line) {
    return supplierConflicts(line, { colourRows, profileRows });
  };
}

/**
 * The first problem across a set of lines, as a sentence and the line it is on.
 *
 * Null when every line is consistent. Stops at the first: the person fixes one
 * line, sends again, and hears about the next. A list of six problems across
 * four lines is harder to act on than one at a time, and in practice a mixed
 * request is nearly always mixed the same way throughout.
 *
 * Silent about a line with no brand recorded. The brand became required only for
 * new work, and an older line without one is not a conflict, it is a line from
 * before the rule. supplierConflicts returns nothing for those.
 */
export function firstSupplierConflict(lines, checkLine, labelFor) {
  const list = Array.isArray(lines) ? lines : [];
  for (let index = 0; index < list.length; index += 1) {
    const problems = checkLine(list[index]);
    if (problems.length) {
      const label = labelFor ? labelFor(list[index], index) : `Line ${index + 1}`;
      return { index, label, problem: problems[0], problems };
    }
  }
  return null;
}
