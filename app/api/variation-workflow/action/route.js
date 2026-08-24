import { createCheckoutSession, siteUrl } from "../../../../lib/pcd-stripe";
import { applyAcceptedVariation } from "../../../../lib/pcd-order-variations";
import { formatMoney, toNumber } from "../../../../lib/pcd-quote-utils";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { approvalEvidence } from "../../../../lib/pcd-approval-evidence";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

const allowedActions = new Set(["approved", "rejected"]);

/**
 * The customer's response, plus what the variation SAID when they gave it.
 *
 * One writer for both the approve and the reject path, so the two cannot drift
 * into recording different things about the same kind of event.
 *
 * Best-effort on the evidence: a customer's response must never fail because a
 * column is not there yet, so a rejected insert is retried without it and said
 * out loud.
 */
async function recordVariationAction(supabase, { variation, action, clientName, note, request, accessCode }) {
  const row = { variation_id: variation.id, action, client_name: clientName, note };
  const evidence = approvalEvidence({
    request,
    lines: variation.pcd_order_variation_lines || [],
    totals: variation,
    accessCode,
  });
  const { error } = await supabase.from("pcd_order_variation_actions").insert({ ...row, evidence });
  if (!error) return;
  const { error: retryError } = await supabase.from("pcd_order_variation_actions").insert(row);
  if (retryError) throw retryError;
  console.error(
    "[variation-workflow] pcd_order_variation_actions.evidence is missing, so this response was recorded " +
      "without any record of what the customer actually agreed to. Run " +
      "supabase/202608221200_pcd_approval_evidence.sql."
  );
}

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
      .select("*, pcd_orders(*), pcd_order_variation_lines(*)")
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
      // Same claim as the approval below: a rejection must not overwrite an
      // override that replaced the version being rejected.
      const { error: updateError } = await supabase
        .from("pcd_order_variations")
        .update({ status: "rejected", rejected_at: now })
        .eq("status", variation.status)
        .eq("id", variation.id);
      if (updateError) throw updateError;
      await recordVariationAction(supabase, { variation, action, clientName, note, request, accessCode });
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

    await recordVariationAction(supabase, { variation, action, clientName, note, request, accessCode });
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

    // Claimed on the status we read, so an admin override that pulled this
    // variation back to draft while the customer had it open cannot be
    // overwritten by an approval of the version it replaced. Whichever lands
    // first wins, decided by the database rather than by timing.
    //
    // This matters more here than on a quote: applyAcceptedVariation below
    // rewrites the order's lines, so approving a superseded variation would put
    // changes nobody agreed to straight into the workshop.
    const { data: claimed, error: updateError } = await supabase
      .from("pcd_order_variations")
      .update({ status: "approved", approved_at: now })
      .eq("id", variation.id)
      .eq("status", variation.status)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!claimed) {
      return Response.json(
        {
          ok: false,
          error:
            "This variation was changed while you had it open, so it could not be approved. Please contact us and we will send you the current version.",
        },
        { status: 409 }
      );
    }

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
    // APPROVING IS TWO THINGS, AND THE SECOND ONE USED TO BE ABLE TO VANISH.
    //
    // The status is claimed first so two approvals cannot race, then the
    // variation is applied: its lines are written onto the order and the order
    // totals move. If applying threw, the catch below answered the customer
    // with a 500 and the variation was left saying "approved" with the order
    // untouched. Nothing retried it and nothing said so, so the job carried on
    // at the old price and the balance owing was wrong on every screen.
    //
    // Now the failure is recorded on the variation. The customer is told their
    // answer is in, which is true, and the order page and the board can both
    // see that something is owed a repair. See applyAcceptedVariation.
    try {
      await applyAcceptedVariation(supabase, variation.id, { actorType: "system" });
    } catch (applyError) {
      console.error("[variation] approved but not applied:", applyError?.message || applyError);
      await supabase
        .from("pcd_order_variations")
        .update({ apply_error: applyError?.message || "Could not apply this variation to the order." })
        .eq("id", variation.id);
      await logOrderActivity(supabase, {
        order_id: variation.order_id,
        variation_id: variation.id,
        actor_type: "system",
        action_type: "variation_apply_failed",
        title: "Variation approved but not applied",
        description:
          `${variation.variation_number} was approved by the customer and could not be written onto the order: ` +
          `${applyError?.message || "unknown error"}. The order still shows the old figures.`,
      });
      // The customer's answer IS recorded, so they are not asked to do it again.
      return Response.json({ ok: true, applied: false });
    }
    return Response.json({ ok: true, applied: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not record variation response." }, { status: 500 });
  }
}
