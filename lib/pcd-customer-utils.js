import { ADDRESS_KEYS } from "./pcd-contact-details";

export function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeCustomerPayload(payload = {}, options = {}) {
  // Stored lowercase, always. The address is an IDENTIFIER here: the unique
  // index is on lower(email), findCustomerByEmail matches with ilike, and the
  // mail sync looks customers up by the lowercase address Microsoft gives it.
  // A record stored as Anna.Dokas@woodside.com was invisible to that lookup, so
  // a reply from somebody who had already filled in a form was treated as a
  // stranger and sent to the new senders list.
  const email = cleanText(payload.email ?? payload.customer_email)?.toLowerCase() ?? null;
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

// What a parked change is called on screen. A person deciding whether to take a
// new value should not have to read a column name to do it.
const FIELD_LABELS = {
  name: "Name",
  phone: "Phone",
  company_name: "Company",
  site_address: "Address",
  site_street: "Street",
  site_suburb: "Suburb",
  site_postcode: "Postcode",
};

export function customerFieldLabel(field) {
  return FIELD_LABELS[field] || String(field || "").replace(/_/g, " ");
}

function isBlankValue(value) {
  // "Customer" is the placeholder normalizeCustomerPayload puts in when nobody
  // gave a name, so it counts as blank rather than as something worth keeping.
  return value === null || value === undefined || String(value).trim() === "" || value === "Customer";
}

/**
 * Park a detail that disagrees with the record instead of dropping it.
 *
 * enrich() fills blanks and has always thrown away anything that contradicts a
 * value already there. That default is right: a phone number confirmed by voice
 * must not be overwritten by an older one typed into a form. But the newer
 * value is sometimes the correct one, and it used to vanish with nothing to
 * show for it. It now waits here until somebody chooses on the customer page.
 *
 * Failure is deliberately quiet. This runs inside quote creation and inbound
 * email; a suggestion that cannot be written must never take down the thing
 * that was actually being done. The worst case is the old behaviour, which is
 * that the newer value is not kept.
 */
export async function parkCustomerChanges(supabase, customer, fields, source = {}) {
  if (!supabase || !customer?.id) return [];

  // normalizeCustomerPayload substitutes the email, then the phone, then the
  // word "Customer" when nobody gave a name. That placeholder is not a proposed
  // name and must never be offered as one: a customer with a real name on record
  // who fills in a form without a name field would otherwise be asked, every
  // time, whether their name should be changed to their email address.
  const placeholderNames = new Set(
    [fields.email, fields.phone, "Customer"].filter(Boolean).map((value) => String(value).trim().toLowerCase())
  );

  const rows = [];
  for (const key of ENRICHABLE) {
    const incoming = fields[key];
    const current = customer[key];
    if (!incoming) continue;
    if (isBlankValue(current)) continue;           // a blank is filled, not queried
    if (String(incoming).trim() === String(current).trim()) continue;
    if (key === "name" && placeholderNames.has(String(incoming).trim().toLowerCase())) continue;
    rows.push({
      customer_id: customer.id,
      field: key,
      current_value: String(current),
      proposed_value: String(incoming).trim(),
      source: source.source || "form",
      source_id: source.id || null,
      source_label: source.label || null,
      status: "pending",
    });
  }
  if (!rows.length) return [];

  try {
    // One standing question per field: a customer who submits the same new
    // phone number on three forms should be asked once, and the newest
    // suggestion replaces the standing one rather than queueing behind it.
    //
    // Cleared and re-inserted rather than upserted. The unique index is PARTIAL
    // (where status = 'pending', so a resolved row can sit beside a new one)
    // and Postgres cannot match ON CONFLICT to a partial index. An upsert here
    // fails outright with "no unique or exclusion constraint matching".
    await supabase
      .from("pcd_pending_customer_changes")
      .delete()
      .eq("customer_id", customer.id)
      .eq("status", "pending")
      .in("field", rows.map((row) => row.field));

    const { data, error } = await supabase.from("pcd_pending_customer_changes").insert(rows).select("*");
    if (error) throw error;
    return data || [];
  } catch {
    // Table not migrated yet, or a write that failed. Either way the caller's
    // real work carries on.
    return [];
  }
}

export async function upsertCustomerByEmail(supabase, payload = {}, source = {}) {
  const fields = normalizeCustomerPayload(payload, { fallbackName: true });
  if (!fields.email) {
    // No email means no way to recognise them again, so this is not a customer
    // record worth keeping. The caller decides whether that is an error.
    return null;
  }

  const existing = await findCustomerByEmail(supabase, fields.email);
  if (existing?.id) return enrich(supabase, existing, fields, source);

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
    if (raced?.id) return enrich(supabase, raced, fields, source);
  }
  throw error;
}

async function enrich(supabase, customer, fields, source = {}) {
  const patch = {};
  ENRICHABLE.forEach((key) => {
    const incoming = fields[key];
    const current = customer[key];
    if (incoming && isBlankValue(current) && incoming !== current) patch[key] = incoming;
  });

  // Anything that disagreed with a value already on the record is parked for a
  // person to decide, rather than being silently discarded as it used to be.
  await parkCustomerChanges(supabase, customer, fields, source);

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
