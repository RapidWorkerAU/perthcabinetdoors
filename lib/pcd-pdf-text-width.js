// HOW WIDE A PIECE OF TEXT ACTUALLY IS.
//
// WHY THIS EXISTS. Everything drawn in this codebase measures text as
// `length * size * 0.52`, a flat rate per character. That is fine for deciding
// where to wrap a paragraph and wrong for anything that has to LINE UP: an "i"
// is 222 units wide in Helvetica and an "m" is 833, so two right-aligned lines
// of different words end at two different places. On the tax invoice that
// showed as a business address block that did not sit flush with the column of
// figures under it.
//
// These are the real Helvetica and Helvetica-Bold advance widths from the Adobe
// font metrics, in units of 1/1000 em, which is what the PDF base fourteen
// fonts actually use. Measuring with them makes right alignment exact.

const REGULAR = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

const BOLD = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584,
};

// Every digit is the same width in both faces, which is what lets a column of
// figures line up at all. Kept as the fallback so an unknown character is
// measured as something reasonable rather than as nothing.
const FALLBACK = 556;

/** Width of `value` in points, at `size`, in the face given. */
export function textWidth(value, size, { bold = false } = {}) {
  const table = bold ? BOLD : REGULAR;
  let units = 0;
  for (const character of String(value ?? "")) {
    units += table[character] ?? FALLBACK;
  }
  return (units / 1000) * size;
}

/** The x a piece of text has to start at to END at `rightX`. */
export function rightAlignedX(value, size, rightX, options) {
  return rightX - textWidth(value, size, options);
}
