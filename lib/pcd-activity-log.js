export function formatActivityValue(value) {
  if (value === null || value === undefined || value === "") return "blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function formatActivityLabel(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function describeChanges(before = {}, after = {}, labels = {}) {
  return Object.entries(after)
    .filter(([field, value]) => formatActivityValue(before?.[field]) !== formatActivityValue(value))
    .map(([field, value]) => {
      const label = labels[field] || formatActivityLabel(field);
      return `${label}: ${formatActivityValue(before?.[field])} -> ${formatActivityValue(value)}`;
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
