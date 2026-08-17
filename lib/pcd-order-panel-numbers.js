// Stable panel numbers for the production sheet.
//
// The number beside a panel ends up stuck to physical timber, so it cannot be a
// position in a list. Removing one panel by variation and reprinting would
// otherwise shift every number after it, and a label already on a piece would
// point at the wrong row.
//
// A number is assigned once, the first time a production document is generated
// for that panel, and stored against the order. A panel added later takes the
// next free number. A removed panel's number is retired rather than reused, so
// an old label can never come to mean something else.
//
// Numbers are handed out in the order the rows are passed in, which is the
// order the sheet prints them: everything cut in house, then everything made to
// order. So a fresh order reads 1 to N down the page.
//
// They do not re-sort later. If a panel is moved from in-house to a supplier it
// keeps its number, so the two tables can end up interleaved (1, 2, 3, 5 in one
// and 4, 6 in the other). That is the price of a number that stays true to the
// label already stuck on the timber, and it is the right trade.

const MISSING_TABLE = /pcd_order_panel_numbers/i;

// A panel key is only unique inside its own line item: two cabinets both have a
// "left side panel". Numbers are scoped to the order, so they are keyed by the
// item as well, or two cabinets share a number and their labels lie.
export function panelNumberKey(itemId, panelKey) {
  return `${itemId || "none"}|${panelKey}`;
}

const numberKey = panelNumberKey;

function isMissingTableError(error) {
  const message = String(error?.message || "");
  return (error?.code === "42P01" || error?.code === "PGRST205") && MISSING_TABLE.test(message);
}

/**
 * Assigns numbers to any panels that do not have one yet, and returns a map of
 * panel key to number covering every row passed in.
 *
 * Rows are the production rows in the order they are built, each carrying the
 * panelKey that identifies it within the order.
 *
 * If the table has not been installed yet the sheet still prints, falling back
 * to positional numbering, because a missing migration should not stop the
 * workshop getting its paperwork.
 */
export async function ensurePanelNumbers(supabase, orderId, rows = []) {
  const keys = rows.map((row) => row.panelKey).filter(Boolean);
  if (!keys.length) return { numbers: new Map(), stable: true };

  const { data: existing, error } = await supabase
    .from("pcd_order_panel_numbers")
    .select("order_line_item_id, panel_key, panel_no")
    .eq("order_id", orderId);

  if (error) {
    if (isMissingTableError(error)) return { numbers: positionalNumbers(rows), stable: false };
    throw error;
  }

  const numbers = new Map(
    (existing || []).map((row) => [numberKey(row.order_line_item_id, row.panel_key), row.panel_no])
  );
  // The next free number counts past every number ever issued for this order,
  // including ones whose panel has since been removed.
  let next = (existing || []).reduce((highest, row) => Math.max(highest, row.panel_no), 0) + 1;

  const inserts = [];
  rows.forEach((row) => {
    if (!row.panelKey) return;
    const key = numberKey(row.itemId, row.panelKey);
    if (numbers.has(key)) return;
    numbers.set(key, next);
    inserts.push({
      order_id: orderId,
      order_line_item_id: row.itemId || null,
      panel_key: row.panelKey,
      panel_no: next,
    });
    next += 1;
  });

  if (inserts.length) {
    const { error: insertError } = await supabase.from("pcd_order_panel_numbers").insert(inserts);
    if (insertError) {
      if (isMissingTableError(insertError)) return { numbers: positionalNumbers(rows), stable: false };
      throw insertError;
    }
  }

  return { numbers, stable: true };
}

// Only used when the table is not installed. Numbering by position is exactly
// what the stored numbers exist to avoid, so this is a fallback, not a mode.
function positionalNumbers(rows) {
  const numbers = new Map();
  rows.forEach((row, index) => {
    if (row.panelKey) numbers.set(numberKey(row.itemId, row.panelKey), index + 1);
  });
  return numbers;
}

/**
 * Stamps each row with its number. Rows without a key keep none: a piece a
 * pending variation only proposes is not a panel on the order yet, so it has
 * nothing to be numbered.
 */
export function applyPanelNumbers(rows = [], numbers = new Map()) {
  return rows.map((row) => ({
    ...row,
    panelNo: row.panelKey ? numbers.get(numberKey(row.itemId, row.panelKey)) ?? null : null,
  }));
}
