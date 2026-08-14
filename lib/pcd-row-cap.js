// How tall a list is allowed to get before it scrolls inside itself.
//
// WHY THIS EXISTS. A quote with thirty line items turned the Quote Items panel
// into one endless section, pushing the totals and the Approve button so far
// down the page that the customer had to scroll past everything to answer.
// The list now stops at a set number of rows and scrolls; the page still
// scrolls as it always did.
//
// The height is measured from the rows that are actually on the page rather
// than assumed, because a quote line is as tall as the detail it carries: a
// plain panel is one line, a thermolaminated door with a profile and hinge
// drilling is several. A fixed row height would slice the last row in half on
// one quote and leave a gap on the next.
//
// Separated from the component so the arithmetic can be tested, which is where
// the mistakes live: the gaps between rows, and the fact that an off-screen
// copy of the same list measures zero.

// rowHeights: the measured height of each row that should be visible, in order.
// gap:        the space between rows, for a list laid out as a grid. A table
//             has none.
// headHeight: a sticky table header, which sits inside the scrolling box and
//             therefore counts toward the height.
//
// Returns null when there is nothing sensible to cap at, which leaves the list
// at its natural height rather than collapsing it.
export function rowCapHeight({ rowHeights = [], gap = 0, headHeight = 0, visibleRows = 5 } = {}) {
  if (!Number.isFinite(visibleRows) || visibleRows < 1) return null;
  // Nothing past the cap means nothing to hide, so no scrollbox and no fixed
  // height. Exactly at the cap counts as nothing to hide: a list of five is not
  // a long section, and boxing it would add a scrollbar that never scrolls.
  if (rowHeights.length <= visibleRows) return null;

  const visible = rowHeights.slice(0, visibleRows);
  const rows = visible.reduce((sum, height) => sum + (Number(height) || 0), 0);
  // n rows have n-1 gaps between them, not n.
  const gaps = (Number(gap) || 0) * (visibleRows - 1);
  const total = rows + gaps + (Number(headHeight) || 0);

  // Zero means the list is not on screen. The same lines are rendered twice, as
  // a table and as mobile cards, and whichever one the breakpoint has hidden
  // measures nothing. Capping that at zero would be meaningless now and wrong
  // the moment the window is resized past the breakpoint.
  return total > 0 ? Math.round(total) : null;
}
