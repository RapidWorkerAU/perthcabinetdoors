// Small pieces the quote builder and the shop's product pages share.

import { hingeMiddlesFor } from "@/lib/pcd-quote-request-payload";

// A NUMBER BOX IGNORES THE SCROLL WHEEL.
//
// In Chrome, scrolling while the pointer rests on a focused number box steps
// its value, so a door typed as 600 high could go out as 575, and a hinge typed
// at 100 as 75, with nobody touching the keyboard. Letting go of the box on the
// first wheel event keeps the page scrolling and the number exactly as typed.
export function ignoreWheel(event) {
  event.currentTarget.blur();
}

/*
 * WHERE THE CUPS ARE, for the drawing, measured up from the bottom.
 *
 * The form asks for the top cup as a distance DOWN from the top, because that
 * is how somebody with a tape measures it. The drawing wants everything from
 * one datum, so the top one is turned round here. Blank throughout means our
 * standard positions, and the drawing spaces them itself.
 */
export function cupsForDrawing(item) {
  const fromBottom = Number(item.hingeFromBottomMm) || 0;
  const fromTop = Number(item.hingeFromTopMm) || 0;
  const height = Number(item.height) || 0;
  const middles = hingeMiddlesFor(item);
  if (!fromBottom && !fromTop && !middles.length) return [];
  const cups = [];
  if (fromBottom > 0) cups.push(fromBottom);
  cups.push(...middles);
  if (fromTop > 0 && height > fromTop) cups.push(height - fromTop);
  return cups;
}
