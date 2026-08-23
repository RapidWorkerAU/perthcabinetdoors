// One person, more than one customer record.
//
// WHY. The same person writes from two addresses, or their partner answers on
// their behalf, and the mail sync makes a second customer record because it has
// nothing else to go on. Kristy Smith has a quote, an order and 17 messages
// under her outlook address and another 9 messages under her gmail one. They
// are the same job and the same person, and the board counted her twice.
//
// HOW. NOTHING IS EVER MOVED. A record can be marked as belonging to another,
// and everything that reads a customer resolves through that link. The rows
// stay exactly where they were written, which is what makes unmerging exact
// rather than a best effort: undoing it is deleting the link, and every quote,
// order and message is already sitting where it always was.
//
// The alternative, repointing rows onto the primary and archiving the other
// record, cannot be undone honestly. Anything edited while merged has no way to
// say which record it started on.
//
// ONE LEVEL ONLY. A secondary cannot have secondaries of its own, and you
// cannot merge into a record that is already somebody's secondary. Chains would
// make "who is the primary" a walk instead of a lookup, and the first time one
// formed in the middle of a merge nobody would be able to predict what the
// customer page showed.

/** Is this record somebody's secondary contact? */
export function isSecondary(customer) {
  return Boolean(customer?.merged_into_id);
}

/**
 * The record that owns this one. Returns the customer itself when it is already
 * the primary, and never walks more than one step, because chains are refused
 * at the point of merging.
 */
export function primaryFor(customer, byId) {
  if (!customer) return null;
  const id = customer.merged_into_id;
  if (!id) return customer;
  const map = byId instanceof Map ? byId : new Map((byId || []).map((c) => [c.id, c]));
  return map.get(id) || customer;
}

/** The id everything should be grouped under. */
export function primaryIdFor(customer) {
  return customer?.merged_into_id || customer?.id || null;
}

/**
 * id → primary id, for every record. The one lookup the board and the desk use
 * so two records for one person collapse to a single row.
 */
export function primaryIdIndex(customers = []) {
  const index = new Map();
  for (const customer of customers) {
    if (!customer?.id) continue;
    index.set(customer.id, customer.merged_into_id || customer.id);
  }
  return index;
}

/** Every record linked to this primary, the primary first. */
export function contactsFor(primaryId, customers = []) {
  const all = customers || [];
  const primary = all.filter((c) => c.id === primaryId)[0] || null;
  const others = all.filter((c) => c.merged_into_id === primaryId);
  return primary ? [primary].concat(others) : others;
}

/** Every address that reaches this person, lowercased. */
export function emailsFor(primaryId, customers = []) {
  return contactsFor(primaryId, customers)
    .map((c) => String(c.email || "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Can these two be merged?
 *
 * Refused rather than corrected, because every one of these is a sign that the
 * person doing it has the wrong record in front of them.
 */
export function validateMerge({ secondary, primary, customers = [] }) {
  if (!secondary || !primary) return "Pick both records.";
  if (secondary.id === primary.id) return "That is the same record.";
  if (isSecondary(primary)) {
    return "That record already belongs to somebody else. Merge into the primary contact instead.";
  }
  if (isSecondary(secondary) && secondary.merged_into_id === primary.id) {
    return "These are already merged.";
  }
  const hasOwn = (customers || []).some((c) => c.merged_into_id === secondary.id);
  if (hasOwn) {
    return "That record has contacts of its own. Separate them first, then merge it.";
  }
  return null;
}

// A record nobody has ever quoted, ordered, written to or heard from is a
// mistake rather than a second contact: a typo in an address, or a double
// created by accident. Merging one keeps it forever as a contact that never
// existed. Deleting is only offered when there is genuinely nothing to lose.
export function isEmptyRecord(counts) {
  const c = counts || {};
  return (
    !Number(c.quotes) && !Number(c.orders) && !Number(c.tickets) &&
    !Number(c.messages) && !Number(c.enquiries) && !Number(c.requests)
  );
}

// The same facts on ONE line, for a table cell. describeHistory writes a
// sentence, which stacks and makes a row two lines tall; a column that is going
// to be scanned fifty times wants a shape, not prose.
export function historyLine(counts) {
  const c = counts || {};
  const parts = [
    Number(c.quotes) ? `${c.quotes} quote${c.quotes === 1 ? "" : "s"}` : "",
    Number(c.orders) ? `${c.orders} order${c.orders === 1 ? "" : "s"}` : "",
    Number(c.messages) ? `${c.messages} msg${c.messages === 1 ? "" : "s"}` : "",
    Number(c.requests) ? `${c.requests} request${c.requests === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "nothing";
}

export function describeHistory(counts) {
  const c = counts || {};
  const parts = [
    Number(c.quotes) ? `${c.quotes} quote${c.quotes === 1 ? "" : "s"}` : "",
    Number(c.orders) ? `${c.orders} order${c.orders === 1 ? "" : "s"}` : "",
    Number(c.messages) ? `${c.messages} message${c.messages === 1 ? "" : "s"}` : "",
    Number(c.requests) ? `${c.requests} request${c.requests === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  if (!parts.length) return "nothing on it";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Records that look like the same person, for the merge suggestions.
 *
 * Matched on name only. An address is never a match: no two records share one,
 * and two people at one house genuinely have different addresses. A suggestion
 * is only ever a prompt to look, and the merge itself is always a decision.
 */
export function possibleDuplicates(customers = []) {
  const byName = new Map();
  for (const customer of customers) {
    if (isSecondary(customer)) continue;
    const key = String(customer.name || "").trim().toLowerCase();
    if (!key) continue;
    const list = byName.get(key) || [];
    list.push(customer);
    byName.set(key, list);
  }
  return Array.from(byName.entries())
    .filter(([, list]) => list.length > 1)
    .map(([name, list]) => ({ name, records: list }));
}
