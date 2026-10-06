// LINES WHOSE BOARD IS NOT IN THE LIBRARY.
//
// The line gate (lib/pcd-line-gate.js) stops a new board that is not in the
// colour library being written from now on. It deliberately leaves alone what
// was saved before it existed, because refusing to save a quantity change over
// a colour typed two years ago would punish the wrong person. This finds those
// older lines so they can be fixed by hand, which is the rule that was agreed:
// report them with a link, change nothing on its own.
//
// Only work that is still live: quotes somebody could still send or accept, and
// orders still being made. A board on an archived quote or a finished order is
// history, not something anybody is about to build.
//
// Pure, so it is tested without a database. The page loads the rows.

export const LIVE_QUOTE_STATUSES = ["draft", "sent", "viewed", "awaiting_deposit"];
export const LIVE_ORDER_STATUSES = ["pending_deposit", "active", "on_hold"];

/**
 * @param check  a line gate from createLineGate
 * @param data   { quotes, quoteLines, orders, orderLines }
 * @returns rows { kind, recordId, ref, customer, lineNo, board, problem, href }
 */
export function boardsNotInLibrary(check, { quotes = [], quoteLines = [], orders = [], orderLines = [] } = {}) {
  const rows = [];
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const judge = (line) => {
    // As if new: every board field is checked, which is what "is this a real
    // board" means. Spelling the gate would tidy on save is not a fault.
    const { faults } = check(line, null);
    return faults.find((fault) => fault.field !== "brand") || faults[0] || null;
  };

  const boardWords = (line) =>
    [line.supplier_name, line.material, line.thickness, line.finish, line.colour].filter((part) => String(part || "").trim()).join(" ");

  const lineNumbers = (lines) => {
    const numbers = new Map();
    const byParent = new Map();
    lines.forEach((line) => {
      const key = line.quote_id || line.order_id;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(line);
    });
    byParent.forEach((list) => {
      list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((line, index) => numbers.set(line.id, index + 1));
    });
    return numbers;
  };

  const quoteNumbers = lineNumbers(quoteLines);
  quoteLines.forEach((line) => {
    const quote = quoteById.get(line.quote_id);
    if (!quote) return;
    const fault = judge(line);
    if (!fault) return;
    rows.push({
      kind: "Quote",
      recordId: quote.id,
      ref: quote.quote_number || "Draft quote",
      customer: quote.customer_name || "",
      lineNo: quoteNumbers.get(line.id) || 0,
      board: boardWords(line),
      problem: fault.message,
      href: `/admin/quotes/${quote.id}`,
    });
  });

  const orderNumbers = lineNumbers(orderLines);
  orderLines.forEach((line) => {
    const order = orderById.get(line.order_id);
    if (!order) return;
    const fault = judge(line);
    if (!fault) return;
    rows.push({
      kind: "Order",
      recordId: order.id,
      ref: order.order_number || "Order",
      customer: order.customer_name || "",
      lineNo: orderNumbers.get(line.id) || 0,
      board: boardWords(line),
      problem: fault.message,
      href: `/admin/orders/${order.id}`,
    });
  });

  // Orders first: they are being built. Then by reference and line.
  return rows.sort((a, b) =>
    a.kind === b.kind ? (a.ref === b.ref ? a.lineNo - b.lineNo : String(a.ref).localeCompare(String(b.ref))) : a.kind === "Order" ? -1 : 1
  );
}
