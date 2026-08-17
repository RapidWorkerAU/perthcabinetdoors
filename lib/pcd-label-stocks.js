// The label stocks we print on.
//
// A page has to BE the size of the label loaded in the machine: the Brother
// driver compares the two and refuses the job when they disagree, which is what
// the "roll of labels or tape inside the machine does not match" dialog is.
//
// Continuous tape is cut to whatever the content needs. A die-cut label is a
// fixed size, so the content sits at the top and the rest is blank label, which
// is somewhere to write on rather than wasted.
//
// Kept in its own module with no dependencies, because the admin screen needs
// the list to build its picker and must not pull the PDF engine, and node:fs
// with it, into the browser bundle.

export const LABEL_STOCKS = {
  "62-continuous": { key: "62-continuous", label: "62mm continuous roll", widthMm: 62, heightMm: null },
  "62x90": { key: "62x90", label: "62 x 90mm label", widthMm: 62, heightMm: 90 },
  "62x100": { key: "62x100", label: "62 x 100mm label", widthMm: 62, heightMm: 100 },
};

// The Masthead layout is drawn for a 62 x 90mm label: the open middle that
// carries the cut size is the spare height on that stock, not padding.
export const DEFAULT_LABEL_STOCK = "62x90";

export function resolveLabelStock(stock) {
  return LABEL_STOCKS[stock] || LABEL_STOCKS[DEFAULT_LABEL_STOCK];
}
