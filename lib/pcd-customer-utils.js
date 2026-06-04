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
  };
}

export async function findCustomerByEmail(supabase, email) {
  if (!email) return null;

  const { data, error } = await supabase
    .from("pcd_customers")
    .select("*")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function resolveQuoteCustomer(supabase, payload = {}) {
  if (payload.customer_id) {
    return payload.customer_id;
  }

  const fields = customerFieldsFromPayload(payload);
  if (!fields.customer_name && !fields.customer_email && !fields.customer_phone) {
    return null;
  }

  const existingCustomer = await findCustomerByEmail(supabase, fields.customer_email);
  if (existingCustomer?.id) {
    return existingCustomer.id;
  }

  const customerPayload = normalizeCustomerPayload(
    {
      name: fields.customer_name,
      email: fields.customer_email,
      phone: fields.customer_phone,
      site_address: fields.site_address,
    },
    { fallbackName: true }
  );

  const { data, error } = await supabase.from("pcd_customers").insert(customerPayload).select("*").single();
  if (error) throw error;
  return data?.id || null;
}
