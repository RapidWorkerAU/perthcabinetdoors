import { createCheckoutSession, siteUrl } from "../../../../lib/pcd-stripe";
import { applyAcceptedVariation } from "../../../../lib/pcd-order-variations";
import { formatMoney, toNumber } from "../../../../lib/pcd-quote-utils";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

const allowedActions = new Set(["approved", "rejected"]);

export async function POST(request) {
  try {
    const payload = await request.json();
    const accessCode = String(payload.code || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
    const action = payload.action;

    if (!accessCode || !allowedActions.has(action)) {
      return Response.json({ ok: false, error: "Invalid variation response." }, { status: 400 });
    }
    if (!String(payload.client_name || "").trim()) {
      return Response.json({ ok: false, error: "Please enter your name first." }, { status: 400 });
    }
    if (action === "rejected" && !String(payload.note || "").trim()) {
      return Response.json({ ok: false, error: "Please include a rejection note." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: variation, error } = await supabase
      .from("pcd_order_variations")
      .select("*, pcd_orders(*)")
      .eq("access_code", accessCode)
      .maybeSingle();
    if (error || !variation) throw error || new Error("Variation not found.");
    if (["approved", "approved_pending_payment", "applied", "rejected", "cancelled"].includes(variation.status)) {
      return Response.json({ ok: false, error: "This variation has already been responded to." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const clientName = String(payload.client_name || "").trim();
    const note = payload.note || null;

    if (action === "rejected") {
      const { error: updateError } = await supabase
        .from("pcd_order_variations")
        .update({ status: "rejected", rejected_at: now })
        .eq("id", variation.id);
      if (updateError) throw updateError;
      await supabase.from("pcd_order_variation_actions").insert({ variation_id: variation.id, action, client_name: clientName, note });
      await logOrderActivity(supabase, {
        order_id: variation.order_id,
        quote_id: variation.pcd_orders?.quote_id || null,
        variation_id: variation.id,
        actor_type: "customer",
        action_type: "variation_rejected",
        title: "Variation rejected by customer",
        description: note,
        metadata: { variation_number: variation.variation_number, client_name: clientName },
      });
      return Response.json({ ok: true });
    }

    await supabase.from("pcd_order_variation_actions").insert({ variation_id: variation.id, action, client_name: clientName, note });
    const topup = toNumber(variation.deposit_topup_required);
    if (topup > 0) {
      const { data: payment, error: paymentError } = await supabase
        .from("pcd_order_payments")
        .insert({
          order_id: variation.order_id,
          variation_id: variation.id,
          payment_type: "deposit",
          amount: topup,
          is_paid: false,
          notes: `Deposit top-up required for ${variation.variation_number}`,
          request_status: "checkout_created",
        })
        .select("*")
        .single();
      if (paymentError) throw paymentError;

      const baseUrl = siteUrl(request.url);
      const session = await createCheckoutSession({
        amount: topup,
        currency: variation.currency || "AUD",
        customerEmail: variation.customer_email || variation.pcd_orders?.customer_email,
        description: `${variation.variation_number} deposit top-up`,
        successUrl: `${baseUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/variations/view?code=${encodeURIComponent(variation.access_code)}`,
        metadata: {
          flow: "variation_deposit_topup",
          order_id: variation.order_id,
          quote_id: variation.pcd_orders?.quote_id || "",
          variation_id: variation.id,
          payment_id: payment.id,
          variation_number: variation.variation_number,
        },
      });

      await supabase
        .from("pcd_order_payments")
        .update({
          request_url: session.url,
          requested_at: now,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || null,
        })
        .eq("id", payment.id);

      await supabase
        .from("pcd_order_variations")
        .update({ status: "approved_pending_payment", approved_at: now })
        .eq("id", variation.id);

      await logOrderActivity(supabase, {
        order_id: variation.order_id,
        quote_id: variation.pcd_orders?.quote_id || null,
        variation_id: variation.id,
        actor_type: "customer",
        action_type: "variation_approved_payment_pending",
        title: "Variation approved pending deposit top-up",
        description: `${variation.variation_number} - ${formatMoney(topup, variation.currency || "AUD")}`,
        metadata: { variation_number: variation.variation_number, payment_id: payment.id, client_name: clientName },
      });

      return Response.json({ ok: true, requiresPayment: true, checkoutUrl: session.url });
    }

    const { error: updateError } = await supabase
      .from("pcd_order_variations")
      .update({ status: "approved", approved_at: now })
      .eq("id", variation.id);
    if (updateError) throw updateError;

    await logOrderActivity(supabase, {
      order_id: variation.order_id,
      quote_id: variation.pcd_orders?.quote_id || null,
      variation_id: variation.id,
      actor_type: "customer",
      action_type: "variation_approved",
      title: "Variation approved by customer",
      description: variation.variation_number,
      metadata: { variation_number: variation.variation_number, client_name: clientName },
    });
    await applyAcceptedVariation(supabase, variation.id, { actorType: "system" });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not record variation response." }, { status: 500 });
  }
}
