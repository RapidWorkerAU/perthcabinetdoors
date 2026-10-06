import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../lib/pcd-activity-log";
import { saveOrderHeader } from "../../../../../lib/pcd-order-header-save";
import { linedUpWords, reviewRequestForOrder } from "../../../../../lib/pcd-review-request-run";
import { lastContactForOrders, updateClock, UPDATE_STATUSES } from "../../../../../lib/pcd-alfred-updates";
import { getAlfredSettings } from "../../../../../lib/pcd-alfred-settings";

async function alfredPostedFor(supabase, order) {
  try {
    if (!UPDATE_STATUSES.includes(order.status) || !order.customer_id) return null;
    const { settings } = await getAlfredSettings(supabase);
    const last = await lastContactForOrders(supabase, [order]);
    const clock = updateClock(order, last.get(order.id), settings.update_gap_days);
    const [{ data: draft }, { data: question }] = await Promise.all([
      supabase.from("pcd_alfred_drafts").select("id").eq("order_id", order.id).eq("kind", "update").eq("status", "waiting").limit(1).maybeSingle(),
      supabase.from("pcd_alfred_questions").select("id, question").eq("order_id", order.id).eq("status", "open").limit(1).maybeSingle(),
    ]);
    return { ...clock, gap: settings.update_gap_days, enabled: settings.enabled && settings.jobs.updates, draftId: draft?.id || null, question: question || null };
  } catch {
    return null;
  }
}

async function orderIdFromParams(params) {
  const resolved = await params;
  return resolved?.id;
}

async function loadOrder(supabase, id) {
  const { data, error } = await supabase
    .from("pcd_orders")
    .select("*, pcd_order_line_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    throw error || new Error("Order not found.");
  }

  // Loaded alongside the order so the panel tabs can mark a row without a
  // second round trip, and so the Issues section arrives already filled.
  const { data: issues } = await supabase
    .from("pcd_order_issues")
    .select("*")
    .eq("order_id", id)
    .order("raised_at", { ascending: false });
  data.pcd_order_issues = issues || [];

  const quoteLineIds = (data.pcd_order_line_items || [])
    .map((item) => item.quote_line_item_id)
    .filter(Boolean);
  let configsByLineId = new Map();

  if (quoteLineIds.length) {
    const { data: cabinetConfigs } = await supabase
      .from("pcd_cabinet_configs")
      .select("*")
      .in("line_item_id", quoteLineIds);
    configsByLineId = new Map((cabinetConfigs || []).map((config) => [config.line_item_id, config]));
    data.pcd_order_line_items = (data.pcd_order_line_items || []).map((item) => ({
      ...item,
      // Snapshot first, live join only for orders raised before snapshots.
      cabinet_config: item.cabinet_config_snapshot || configsByLineId.get(item.quote_line_item_id) || null,
    }));
  }

  // Stored panel numbers, so the production tab shows the same numbers the
  // printed sheet and the labels carry. They are assigned the first time a
  // production document is generated, so a panel can legitimately have none yet.
  // order_line_item_id is part of the key: a panel key is only unique inside
  // its own item, so two cabinets both have a "left side panel".
  const { data: panelNumbers } = await supabase
    .from("pcd_order_panel_numbers")
    .select("order_line_item_id, panel_key, panel_no")
    .eq("order_id", id);
  data.panel_numbers = panelNumbers || [];

  if (data.quote_id) {
    const { data: quote } = await supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*)")
      .eq("id", data.quote_id)
      .maybeSingle();
    if (quote?.pcd_quote_line_items?.length) {
      quote.pcd_quote_line_items = quote.pcd_quote_line_items.map((line) => ({
        ...line,
        cabinet_config: configsByLineId.get(line.id) || null,
      }));
    }
    data.pcd_quote = quote || null;
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("pcd_order_payments")
    .select("*")
    .eq("order_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (paymentsError) {
    data.pcd_order_payments = [];
  } else {
    data.pcd_order_payments = payments || [];
  }

  const { data: variations, error: variationsError } = await supabase
    .from("pcd_order_variations")
    .select("*, pcd_order_variation_lines(*)")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  if (variationsError) {
    data.pcd_order_variations = [];
  } else {
    data.pcd_order_variations = variations || [];
  }

  const { data: quoteRequests } = data.quote_id
    ? await supabase
        .from("pcd_quote_requests")
        .select("id")
        .eq("converted_quote_id", data.quote_id)
    : { data: [] };

  const quoteRequestIds = (quoteRequests || []).map((request) => request.id);
  const activityQueries = [
    supabase.from("pcd_order_activity").select("*").eq("order_id", id),
  ];

  if (data.quote_id) {
    activityQueries.push(supabase.from("pcd_order_activity").select("*").eq("quote_id", data.quote_id));
  }

  if (quoteRequestIds.length) {
    activityQueries.push(supabase.from("pcd_order_activity").select("*").in("quote_request_id", quoteRequestIds));
  }

  const activityResults = await Promise.all(activityQueries);
  const activityMap = new Map();
  activityResults.forEach((result) => {
    (result.data || []).forEach((activity) => activityMap.set(activity.id, activity));
  });
  data.pcd_order_activity = Array.from(activityMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Where the Google review request is up to, worked out by the same rules the
  // daily job sends by. Null on a database without the migration.
  data.review_request = await reviewRequestForOrder(supabase, data);

  // Where this order stands against the longest gap between updates, and any
  // of Alfred's work waiting on it. Null on a database without his tables.
  data.alfred_posted = await alfredPostedFor(supabase, data);

  return data;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    await context.supabase
      .from("pcd_orders")
      .update({ admin_viewed_at: new Date().toISOString() })
      .eq("id", id)
      .is("admin_viewed_at", null);

    const order = await loadOrder(context.supabase, id);
    return Response.json({ ok: true, order });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load order." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    const payload = await request.json();
    // The save itself is lib/pcd-order-header-save.js, shared with Alfred.
    let saved;
    try {
      saved = await saveOrderHeader(context.supabase, id, payload, { actorType: "admin" });
    } catch (error) {
      if (!error?.status) throw error;
      return Response.json(
        { ok: false, error: error.message, ...(error.clashes ? { clash: true, clashes: error.clashes } : {}) },
        { status: error.status }
      );
    }
    const { beforeOrder, updates } = saved;

    let order = await loadOrder(context.supabase, id);

    // THE REVIEW REQUEST, SAID ON THE TIMELINE. Marking it Complete lines one
    // up; moving it away before it went takes it down again. Nothing is sent
    // from here. See lib/pcd-review-requests.js.
    const wasComplete = beforeOrder?.status === "complete";
    const isComplete = updates.status === "complete";
    if (updates.status && wasComplete !== isComplete && !order.review_request_sent_at) {
      let words = "";
      if (isComplete) {
        words = linedUpWords(order.review_request);
      } else {
        const before = await reviewRequestForOrder(context.supabase, {
          ...beforeOrder,
          pcd_order_payments: order.pcd_order_payments,
        });
        if (["waiting", "due", "owing", "no_email"].includes(before?.key)) {
          words = "Google review request taken down, because the order is no longer Complete.";
        }
      }
      if (words) {
        await logOrderActivity(context.supabase, {
          order_id: id,
          quote_id: beforeOrder?.quote_id || null,
          actor_type: "admin",
          action_type: isComplete ? "review_request_lined_up" : "review_request_taken_down",
          title: isComplete ? "Google review request lined up" : "Google review request taken down",
          description: words,
        });
        order = await loadOrder(context.supabase, id);
      }
    }

    return Response.json({ ok: true, order });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update order." }, { status: 500 });
  }
}
