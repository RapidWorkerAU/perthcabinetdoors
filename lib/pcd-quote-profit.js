// What a quote is actually worth to the business.
//
// WHY THIS EXISTS. The dashboard showed order and pipeline totals, which is
// revenue, not profit. A $20,000 month of board-heavy jobs and a $20,000 month
// of labour-heavy ones read identically while being worth very different
// amounts.
//
// THE SPLIT. Everything on a quote except the markup and the labour is money
// that leaves the business: board and hardware, consumables, travel, delivery,
// painting, glass, door removal and disposal. What is kept is the markup and
// the labour, because the labour is time PCD works rather than a wage paid out.
//
//   profit ex GST = markup_amount_ex_gst + labour_cost_ex_gst
//
// EX GST, ALWAYS. GST is collected on behalf of the ATO and never belongs to
// the business, so counting it would overstate every figure here. The revenue
// cells on the dashboard are inc GST, which is what they have always been; the
// profit cells say ex GST on their labels so the two are not read as the same
// basis.
//
// WHY THE MARKUP IS NOT DOUBLE COUNTED. material_cost_ex_gst already contains
// the markup: calculateQuoteLine sets a line's material_cost_ex_gst to its full
// line total, markup included, and markup_amount_ex_gst is reported alongside
// as the portion of it that is margin. So the markup is added here exactly
// once, by reading the column that isolates it.
//
// KNOWN UNDERSTATEMENT. Hinge drilling is labour but it is charged through the
// line total and is not stored as its own column on the quote, so it sits in
// the paid-out side. That errs low, which is the right direction for a profit
// figure to be wrong in.

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// The quote columns that are kept rather than paid out.
export const PROFIT_COMPONENTS = ["markup_amount_ex_gst", "labour_cost_ex_gst"];

// Takes a quote row, or anything carrying those two columns. Returns 0 rather
// than null for a quote that has neither, so a total never becomes NaN.
export function quoteProfitExGst(quote) {
  if (!quote) return 0;
  return round(PROFIT_COMPONENTS.reduce((total, column) => total + money(quote[column]), 0));
}

// An order's profit is its quote's profit. Orders store the totals they were
// accepted at but not the cost breakdown behind them, so the quote is the only
// place the split exists.
//
// An order with no quote behind it (raised directly, or whose quote was since
// deleted) returns null rather than 0. Null is not zero here: it means unknown,
// and the dashboard counts those separately instead of quietly reporting a
// profit of nothing on real revenue.
export function orderProfitExGst(order) {
  const quote = Array.isArray(order?.pcd_quotes) ? order.pcd_quotes[0] : order?.pcd_quotes;
  if (!quote) return null;
  return quoteProfitExGst(quote);
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
