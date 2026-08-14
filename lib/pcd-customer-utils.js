import { ADDRESS_KEYS } from "./pcd-contact-details";

export function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeCustomerPayload(payload = {}, options = {}) {
  const email = cleanText(payload.email ?? payload.customer_email);
  const phone = cleanText(payload.phone ?? payload.customer_phone);
  const fallbackName = options.fallbackName ? email || phone || "Customer" : null;
  const name = cleanText(payload.name ?? payload.customer_name) || fallbackName;

  return {
    name,
    company_name: cleanText(payload.company_name),
    email,
    phone,
    site_address: cleanText(payload.site_address ?? payload.address),
    site_street: cleanText(payload.site_street),
    site_suburb: cleanText(payload.site_suburb),
    site_postcode: cleanText(payload.site_postcode),
    notes: cleanText(payload.notes),
    is_active: payload.is_active ?? true,
  };
}

export function customerFieldsFromPayload(payload = {}) {
  return {
    customer_name: cleanText(payload.customer_name ?? payload.name),
    customer_email: cleanText(payload.customer_email ?? payload.email),
    customer_phone: cleanText(payload.customer_phone ?? payload.phone),
    site_address: cleanText(payload.site_address ?? payload.address),
    site_street: cleanText(payload.site_street),
    site_suburb: cleanText(payload.site_suburb),
    site_postcode: cleanText(payload.site_postcode),
  };
}

// ILIKE treats % and _ as wildcards, so an address containing either would
// match somebody else's record. a_b@x.com matched axb@x.com before this.
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function findCustomerByEmail(supabase, email) {
  if (!email) return null;

  const { data, error } = await supabase
    .from("pcd_customers")
    .select("*")
    .ilike("email", escapeLike(email))
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ONE CUSTOMER PER EMAIL ADDRESS. Everything that can create a customer goes
// through here, so somebody who saves a design today and sends a quote request
// next week lands on the same record rather than a second one.
//
// The database backs this up with a unique index on lower(email) (see
// supabase/quote_project_workflow_setup.sql), which is what makes it safe when
// two requests arrive at once: the loser of that race catches the violation and
// re-reads instead of failing.
//
// Matching an existing record also ENRICHES it. Someone who only left an email
// the first time and a phone number the second should end up with both, but a
// value they already have is never overwritten by a newer, possibly worse one.
// The address parts are enrichable on the same terms as the one-liner: a
// record that arrived with only a suburb from a lead form gains the street and
// postcode the first time somebody supplies them, and a value already on the
// record is never replaced by a newer one.
const ENRICHABLE = ["name", "phone", "site_address", "company_name", ...ADDRESS_KEYS.map((key) => `site_${key}`)];

export async function upsertCustomerByEmail(supabase, payload = {}) {
  const fields = normalizeCustomerPayload(payload, { fallbackName: true });
  if (!fields.email) {
    // No email means no way to recognise them again, so this is not a customer
    // record worth keeping. The caller decides whether that is an error.
    return null;
  }

  const existing = await findCustomerByEmail(supabase, fields.email);
  if (existing?.id) return enrich(supabase, existing, fields);

  const { data, error } = await supabase
    .from("pcd_customers")
    .insert(fields)
    .select("*")
    .single();

  if (!error) return data;

  // 23505 = unique_violation. Another request created them between our read and
  // our write, so take theirs.
  if (error.code === "23505") {
    const raced = await findCustomerByEmail(supabase, fields.email);
    if (raced?.id) return enrich(supabase, raced, fields);
  }
  throw error;
}

async function enrich(supabase, customer, fields) {
  const patch = {};
  ENRICHABLE.forEach((key) => {
    const incoming = fields[key];
    const current = customer[key];
    // Only fill genuine blanks. "Customer" is the placeholder normalize puts in
    // when no name was given, so it counts as blank too.
    const isBlank = current === null || current === undefined || String(current).trim() === "" || current === "Customer";
    if (incoming && isBlank && incoming !== current) patch[key] = incoming;
  });
  if (!Object.keys(patch).length) return customer;

  const { data, error } = await supabase
    .from("pcd_customers")
    .update(patch)
    .eq("id", customer.id)
    .select("*")
    .single();
  // Enrichment is a nicety. If it fails we still have the right customer.
  return error ? customer : data;
}

export async function resolveQuoteCustomer(supabase, payload = {}) {
  if (payload.customer_id) {
    return payload.customer_id;
  }

  const fields = customerFieldsFromPayload(payload);
  if (!fields.customer_name && !fields.customer_email && !fields.customer_phone) {
    return null;
  }

  // With an email, one shared path decides who this is, so a quote request and
  // a saved design can never end up as two records for the same person.
  if (fields.customer_email) {
    const customer = await upsertCustomerByEmail(supabase, {
      name: fields.customer_name,
      email: fields.customer_email,
      phone: fields.customer_phone,
      site_address: fields.site_address,
      site_street: fields.site_street,
      site_suburb: fields.site_suburb,
      site_postcode: fields.site_postcode,
    });
    if (customer?.id) return customer.id;
  }

  // No email. There is nothing to match on, so this is a new record either way.
  const customerPayload = normalizeCustomerPayload(
    {
      name: fields.customer_name,
      email: fields.customer_email,
      phone: fields.customer_phone,
      site_address: fields.site_address,
      site_street: fields.site_street,
      site_suburb: fields.site_suburb,
      site_postcode: fields.site_postcode,
    },
    { fallbackName: true }
  );

  const { data, error } = await supabase.from("pcd_customers").insert(customerPayload).select("*").single();
  if (error) throw error;
  return data?.id || null;
}
