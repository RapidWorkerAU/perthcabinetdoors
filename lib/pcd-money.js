// HOW MONEY IS ROUNDED. ONE ANSWER, FOR EVERYTHING THAT HOLDS A FIGURE.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Found in the Pass 3 audit, 22 September 2026. There were fourteen separate
// rounding expressions across the money libraries, in two variants: some added
// Number.EPSILON before rounding and some did not.
//
// They are not the same function. The quote totals used the first and the
// credits, the payments, the refunds and the board money used the second, so
// the same underlying figure could come out a cent apart depending on which
// module happened to round it. A cent apart is exactly what fails the line sum
// check on a tax invoice.
//
// ── WHY NEITHER OF THE OLD VERSIONS IS USED HERE ─────────────────────────────
//
// The first attempt at this fix was to keep the Number.EPSILON version, on the
// grounds that it was the one that got 1.005 right. Measuring it rather than
// assuming showed it is wrong far more often than it looks:
//
//     over 200,000 halfway values
//       Math.round((v + Number.EPSILON) * 100) / 100   wrong 9,158 times
//       the version below                              wrong 0 times
//
// Number.EPSILON is the gap between doubles AT MAGNITUDE ONE. Money is not at
// magnitude one. By the time a figure reaches 8.165 the real gap is far wider
// than one epsilon, so the nudge no longer reaches the boundary and 8.165 rounds
// down to 8.16. It happened to work on the small examples everybody tests with,
// which is the worst way for something to be wrong.
//
// ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────────
//
// 1.005 cannot be written exactly in binary. What is stored is a hair under it,
// so `1.005 * 100` is 100.49999999999999 and rounding takes it down to $1.00 for
// a figure everybody reading it calls $1.01.
//
// toFixed(2) on the scaled value throws away exactly that binary noise, because
// it formats the number the way a person would read it, and it does it at the
// right magnitude rather than at magnitude one. 816.4999999999999 becomes
// "816.50" becomes 816.5 becomes 817.
//
// Half goes AWAY FROM ZERO, not upwards. Math.round sends -0.5 to -0, so a
// refund of -1.005 would round to -1.00 while a charge of 1.005 rounds to 1.01,
// and the same job could then disagree with itself by a cent depending on which
// direction the money was travelling.

/**
 * A money figure, to the cent, with half going away from zero.
 *
 * Anything that is not a finite number is 0, because every caller of this is
 * summing towards a total and one NaN poisons the whole column silently. A
 * missing figure is nothing, which is the honest reading.
 */
export function roundMoney(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  const cents = Math.round(Number((Math.abs(number) * 100).toFixed(2)));
  const rounded = cents / 100;
  return number < 0 ? -rounded : rounded;
}
