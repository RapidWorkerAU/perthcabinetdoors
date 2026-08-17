import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import {
  makeVariationAccessCode,
  makeVariationNumber,
} from "../../../../../../lib/pcd-order-variations";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
import { roundMoney, toNumber } from "../../../../../../lib/pcd-quote-utils";

async function orderIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function POST(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    const { data: order, error: orderError } = await context.supabase
      .from("pcd_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError || !order) throw orderError || new Error("Order not found.");

    // A variation is a priced document that goes to a customer, so it follows
    // the same settings a quote does. This file used to read no business
    // defaults at all: it hardcoded the currency, the GST rate and the terms,
    // so a business that changed its GST rate got correct quotes and wrong
    // variations, and its variation wording could not be changed anywhere.
    const businessDefaults = await getBusinessDefaults(context.supabase);

    const { data: variation, error } = await context.supabase
      .from("pcd_order_variations")
      .insert({
        order_id: order.id,
        variation_number: makeVariationNumber(),
        access_code: makeVariationAccessCode(),
        title: "Order Variation",
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        site_address: order.site_address,
        currency: businessDefaults.currency,
        gst_rate: businessDefaults.gst_rate,
        revised_order_total_inc_gst: order.total_inc_gst,
        deposit_required: Boolean(order.deposit_required),
        deposit_percent: order.deposit_required && toNumber(order.deposit_amount) && toNumber(order.total_inc_gst)
          ? Math.min(100, roundMoney((toNumber(order.deposit_amount) / toNumber(order.total_inc_gst)) * 100))
          : 50,
        terms: businessDefaults.variation_terms || null,
      })
      .select("*, pcd_order_variation_lines(*)")
      .single();
    if (error) throw error;

    await logOrderActivity(context.supabase, {
      order_id: order.id,
      quote_id: order.quote_id || null,
      variation_id: variation.id,
      actor_type: "admin",
      action_type: "variation_created",
      title: "Variation created",
      description: variation.variation_number,
      metadata: { variation_number: variation.variation_number },
    });

    return Response.json({ ok: true, variation });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create variation." }, { status: 500 });
  }
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_order_variations")
      .select("*, pcd_order_variation_lines(*)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, variations: data || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load variations." }, { status: 500 });
  }
}
