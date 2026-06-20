const MONEY_FIELD_PATTERN = /(amount|cost|total|subtotal|gst|rate|price|payment|deposit|markup)/i;

const FRIENDLY_ACTIVITY_LABELS = {
  subtotal_ex_gst: "Subtotal ex GST",
  gst_amount: "GST",
  total_inc_gst: "Total inc GST",
  delivery_cost_ex_gst: "Delivery cost ex GST",
  travel_cost_ex_gst: "Travel cost ex GST",
  installation_cost_ex_gst: "Consumables ex GST",
  material_cost_ex_gst: "Materials and hardware",
  labour_cost_ex_gst: "Labour cost",
  worker_hourly_rate: "Hourly rate",
  markup_amount_ex_gst: "Markup",
  markup_percent: "Markup percentage",
  client_notes: "Client notes",
  internal_notes: "Internal notes",
  customer_name: "Customer",
  customer_email: "Email",
  customer_phone: "Phone",
  site_address: "Site address",
  project_name: "Project",
  target_completion_date: "Target completion",
  fulfilment_method: "Fulfilment method",
  production_stage: "Production stage",
  supplier_name: "Supplier",
  supplier_order_ref: "Supplier reference",
  supplier_ordered_at: "Supplier ordered date",
  supplier_eta: "Supplier ETA",
  board_required: "Board required",
  board_ordered: "Board ordered",
  board_available: "Board available",
  payment_type: "Payment type",
  is_paid: "Payment status",
  paid_at: "Date paid",
};

function isNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function formatActivityValue(value, field = "") {
  if (value === null || value === undefined || value === "") return "blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (MONEY_FIELD_PATTERN.test(field) && isNumericValue(value)) {
    if (/percent/i.test(field)) return `${Number(value).toFixed(2).replace(/\.00$/, "")}%`;
    return `$${Number(value).toFixed(2)}`;
  }
  return String(value);
}

export function formatActivityLabel(value) {
  if (FRIENDLY_ACTIVITY_LABELS[value]) return FRIENDLY_ACTIVITY_LABELS[value];
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\bgst\b/gi, "GST")
    .replace(/\bex\b/gi, "ex")
    .replace(/\binc\b/gi, "inc")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bEx\b/g, "ex")
    .replace(/\bInc\b/g, "inc");
}

export function describeChanges(before = {}, after = {}, labels = {}) {
  return Object.entries(after)
    .filter(([field, value]) => formatActivityValue(before?.[field], field) !== formatActivityValue(value, field))
    .map(([field, value]) => {
      const label = labels[field] || formatActivityLabel(field);
      return `${label} changed from ${formatActivityValue(before?.[field], field)} to ${formatActivityValue(value, field)}`;
    });
}

export async function logOrderActivity(supabase, activity) {
  if (!supabase || !activity?.title || !activity?.action_type) return null;

  try {
    const { data, error } = await supabase
      .from("pcd_order_activity")
      .insert({
        order_id: activity.order_id || null,
        quote_id: activity.quote_id || null,
        quote_request_id: activity.quote_request_id || null,
        actor_type: activity.actor_type || "system",
        action_type: activity.action_type,
        title: activity.title,
        description: activity.description || null,
        metadata: activity.metadata || {},
        event_key: activity.event_key || null,
        created_at: activity.created_at || undefined,
      })
      .select("*")
      .maybeSingle();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
