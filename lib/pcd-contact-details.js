// The details we must hold before a quote can be accepted.
//
// WHY THIS EXISTS. Accepting a quote asked for a name typed into a box and
// nothing else, so jobs reached the delivery run with no address and no mobile
// number. These six fields are now required at acceptance, pre-filled from
// whatever we already hold.
//
// ONE DEFINITION, BOTH ENDS. The customer page uses this to decide what to
// flag and whether to enable the button; the action route uses the same
// functions to refuse an acceptance that is missing anything. A client-side
// check on its own is a suggestion, not a rule.

export const DETAIL_FIELDS = [
  { key: "name", label: "Customer", summaryLabel: "Customer" },
  { key: "email", label: "Email", summaryLabel: "Email" },
  { key: "mobile", label: "Mobile", summaryLabel: "Mobile" },
  { key: "street", label: "Street address", summaryLabel: "Site address" },
  { key: "suburb", label: "Suburb", summaryLabel: "Site address" },
  { key: "postcode", label: "Postcode", summaryLabel: "Site address" },
];

// The three that make up the one Site address row in the summary.
export const ADDRESS_KEYS = ["street", "suburb", "postcode"];

// THE ONE DEFINITION OF AN ADDRESS FIELD. Every screen that asks for an
// address, admin or customer facing, renders from this list, so the same three
// boxes are asked for in the same order with the same labels wherever the
// address is captured. Before this, acceptance asked for three parts and every
// admin screen asked for one free text line, which meant a staff member and a
// customer filling in the same address produced two different records.
//
// The lead forms are deliberately not part of this. Asking for a full address
// before there is a job is the wrong question; a suburb is enough to price
// delivery, and it flows into the suburb box here when the quote is raised.
export const ADDRESS_FIELDS = [
  { key: "street", label: "Street address", placeholder: "14 Rokeby Road", autoComplete: "address-line1" },
  { key: "suburb", label: "Suburb", placeholder: "Subiaco", autoComplete: "address-level2" },
  {
    key: "postcode",
    label: "Postcode",
    placeholder: "6008",
    autoComplete: "postal-code",
    // Typed as the literal rather than plain string so the TypeScript screens
    // can pass it straight to an input without casting.
    inputMode: /** @type {const} */ ("numeric"),
  },
];

function text(value) {
  return String(value ?? "").trim();
}

// Deliberately permissive on shape, strict on emptiness. A required field that
// accepts "n/a" solves nothing, but a validator that rejects a real address
// because of a hyphen is worse than no validator at all.
export function validateDetail(key, value) {
  const v = text(value);
  if (!v) return "Required to schedule delivery and install.";

  if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
    return "That does not look like an email address.";
  }
  // Australian mobile or landline. Separators are stripped BEFORE matching
  // rather than allowed between digits, because people space a +61 number as
  // "+61 412 345 678" and a pattern that only tolerates gaps after the leading
  // digits rejected it. Blocking a real customer from accepting is a far worse
  // failure than letting an odd-looking number through.
  if (key === "mobile") {
    const digits = v.replace(/[\s()-]/g, "");
    if (!/^(\+?61|0)[2-478]\d{8}$/.test(digits)) return "Enter an Australian mobile or landline.";
  }
  if (key === "postcode" && !/^\d{4}$/.test(v)) return "Postcode is four digits.";
  if (key === "street" && v.length < 5) return "Enter the full street address.";
  if (key === "name" && v.length < 2) return "Enter the name on the job.";
  return "";
}

// { key: message } for everything wrong. Empty means ready to accept.
export function validateDetails(details = {}) {
  const errors = {};
  DETAIL_FIELDS.forEach(({ key }) => {
    const message = validateDetail(key, details[key]);
    if (message) errors[key] = message;
  });
  return errors;
}

export function detailsAreComplete(details) {
  return Object.keys(validateDetails(details)).length === 0;
}

// The single-line form, which is what site_address has always held and what
// every existing consumer (orders, the admin list, the PDF) reads.
export function formatSiteAddress(details = {}) {
  const street = text(details.street);
  const tail = [text(details.suburb), text(details.postcode)].filter(Boolean).join(" ");
  return [street, tail].filter(Boolean).join(", ");
}

// Pull the parts back out of a stored one-liner, so a record written before the
// structured columns existed still pre-fills the three fields instead of
// showing them blank and asking for them again.
//
// Handles "14 Rokeby Road, Subiaco 6008" and "14 Rokeby Road, Subiaco, WA 6008".
// Anything it cannot read confidently goes in the street field, where the
// customer can see it and correct it, rather than being silently dropped.
export function parseSiteAddress(value) {
  const raw = text(value);
  if (!raw) return { street: "", suburb: "", postcode: "" };

  const postcode = (raw.match(/(\d{4})\s*$/) || [])[1] || "";
  let rest = postcode ? raw.slice(0, raw.lastIndexOf(postcode)).trim() : raw;
  rest = rest.replace(/[,\s]+$/, "").replace(/\b(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i, "").replace(/[,\s]+$/, "");

  const parts = rest.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { street: parts.slice(0, -1).join(", "), suburb: parts[parts.length - 1], postcode };
  }
  return { street: parts[0] || "", suburb: "", postcode };
}

// The three boxes, filled in from a stored record. Reads the structured columns
// first and falls back to splitting the one-liner, so a record written before
// those columns existed, or by a screen that only ever wrote the one-liner,
// still opens with its parts in the right boxes instead of asking again.
//
// Takes any record with the site_* columns: a customer, a quote, or an order.
export function addressFromRecord(record) {
  const structured = {
    street: text(record?.site_street),
    suburb: text(record?.site_suburb),
    postcode: text(record?.site_postcode),
  };
  if (structured.street || structured.suburb || structured.postcode) return structured;
  return parseSiteAddress(record?.site_address);
}

// What every screen writes when it saves an address. The joined one-liner goes
// in as well as the parts, because everything downstream still reads it: the
// quote PDF, the order, the admin list. Writing the parts without it would
// leave those showing the old address.
export function addressColumns(address = {}) {
  return {
    site_address: formatSiteAddress(address),
    site_street: text(address.street),
    site_suburb: text(address.suburb),
    site_postcode: text(address.postcode),
  };
}

// True when there is nothing in any of the three boxes, which is how an admin
// screen decides whether to overwrite what is already on the record.
export function addressIsEmpty(address = {}) {
  return !ADDRESS_KEYS.some((key) => text(address[key]));
}

// What the customer page starts with. The customer record wins where it has a
// value, because it is the one we keep current; the quote's own snapshot is the
// fallback for older quotes raised before the customer existed.
export function prefillDetails({ customer, quote } = {}) {
  const pick = (a, b) => text(a) || text(b);
  const fromCustomer = addressFromRecord(customer);
  const address = ADDRESS_KEYS.some((key) => fromCustomer[key])
    ? fromCustomer
    : addressFromRecord(quote);

  return {
    name: pick(customer?.name, quote?.customer_name),
    email: pick(customer?.email, quote?.customer_email),
    mobile: pick(customer?.phone, quote?.customer_phone),
    street: address.street,
    suburb: address.suburb,
    postcode: address.postcode,
  };
}

// Trimmed, ready to store. Never called with anything that has not passed
// validateDetails first.
export function normaliseDetails(details = {}) {
  const out = {};
  DETAIL_FIELDS.forEach(({ key }) => { out[key] = text(details[key]); });
  return out;
}
