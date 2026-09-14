/**
 * HOW MANY COLUMNS A ROW OF CARDS SHOULD HAVE, GIVEN HOW MANY CARDS THERE ARE.
 *
 * WHY THIS IS NOT JUST A NUMBER IN THE STYLESHEET. A column count written in
 * CSS is a guess about a list that lives in a page file, and the two drift the
 * moment anybody adds or removes an item. That has now happened twice on the
 * same site: four hinge cards in a three column grid left one stranded on a
 * second row, and four process steps in a three column grid did the same thing
 * on /kitchen-refresh while the six steps on /bespoke sat correctly at three by
 * two. The class is shared, so no single number in the CSS can be right for
 * both. Deriving it removes the guess.
 *
 * THE RULE: the largest column count, up to `max`, that divides the item count
 * exactly. A last row shorter than the ones above it is what reads as a
 * mistake, so we only ever pick a count that leaves no remainder.
 *
 *   4 items -> 4     6 items -> 3     8 items -> 4     9 items -> 3
 *
 * A count with no divisor in range cannot come out even, so the tie-break is
 * the fullest last row: five items go three and two rather than four and one,
 * seven go four and three rather than three, three and one. A short last row is
 * fine, a last row holding a single card is what looks like a mistake.
 *
 * `max` defaults to 4 because a card inside the 1020px content column needs
 * roughly 230px to hold a heading and two lines, and five would not.
 *
 * Feed the result to a CSS custom property. The stylesheet keeps the media
 * queries, which set grid-template-columns directly and so still win at narrow
 * widths whatever this returns:
 *
 *   <ol className={styles.process} style={{ "--cols": evenColumns(STEPS.length) }}>
 *   .process { grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); }
 */
export function evenColumns(count, max = 4) {
  const items = Math.max(0, Math.floor(Number(count) || 0));
  if (items <= 1) return 1;

  const ceiling = Math.min(max, items);
  for (let columns = ceiling; columns > 1; columns -= 1) {
    if (items % columns === 0) return columns;
  }

  // Nothing divides it. Take the widest last row going, and the most columns
  // among equals, which keeps the block from growing taller than it needs to.
  let best = 1;
  let bestRemainder = 0;
  for (let columns = 2; columns <= ceiling; columns += 1) {
    const remainder = items % columns;
    if (remainder > bestRemainder) {
      best = columns;
      bestRemainder = remainder;
    }
  }
  return best;
}
