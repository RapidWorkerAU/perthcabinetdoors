// APPROVE A VARIATION ON THE CUSTOMER'S BEHALF.
//
// The change was agreed on site or over the phone, the piece has to be cut to a
// different size than the order says, and waiting for somebody to open an email
// link means the workshop cuts it wrong or does not cut it at all.
//
// This is the variation twin of accepting a quote for the customer, and it asks
// for the same three things before it will do anything: WHO agreed, HOW they
// said so, and WHY this is not going through the normal route. None of them is
// paperwork. An approval recorded with nobody's name against it cannot be told
// apart from somebody clicking the wrong button, and the whole value of an
// override is the record it leaves.
//
// ── IT IS A NARROW DOOR, NOT A BACK DOOR ─────────────────────────────────────
//
// Only a size change, on lines already on the order, at the price the order
// already holds. Everything else is refused here and goes to the customer. The
// rule, and every reason a variation fails it, lives in
// lib/pcd-variation-override.js, and the screen checks the same rule with the
// same function before it even offers the button.
//
// Checked here as well, and against the database rather than against whatever
// the browser sent, because a rule enforced only in a browser is not a rule.
//
// ── NOTHING IS EMAILED ───────────────────────────────────────────────────────
//
// Deliberately. The customer already agreed to this in person; an automated
// "thanks for approving" for something they never pressed approve on reads as a
// machine telling them what they did. The change shows up in the weekly update
// if one is sent, which is a person deciding to tell them.

import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { approvalEvidence } from "../../../../../../../../lib/pcd-approval-evidence";
import { ACCEPTANCE_CHANNEL_KEYS, acceptanceChannelLabel } from "../../../../../../../../lib/pcd-acceptance-channels";
import { applyAcceptedVariation } from "../../../../../../../../lib/pcd-order-variations";
import { OVERRIDE_RULE_SENTENCE, overrideApprovalEligibility } from "../../../../../../../../lib/pcd-variation-override";

/** The statuses that mean this variation has already been answered. */
const ANSWERED = ["approved", "approved_pending_payment", "applied", "rejected", "cancelled"];

async function loadForOverride(supabase, orderId, variationId) {
  const { data: variation, error } = await supabase
    .from("pcd_order_variations")
    .select("*, pcd_orders(id, quote_id), pcd_order_variation_lines(*)")
    .eq("id", variationId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!variation) return { variation: null, orderLines: [] };

  const { data: orderLines, error: linesError } = await supabase
    .from("pcd_order_line_items")
    .select("*")
    .eq("order_id", orderId);
  if (linesError) throw linesError;

  return { variation, orderLines: orderLines || [] };
}

/**
 * Can this variation be approved here, and what would it do?
 *
 * The screen works this out for itself off data it already holds, so this is
 * not what draws the button. It is what the modal confirms against immediately
 * before anybody presses anything, so a variation edited in another tab cannot
 * be approved on the strength of a stale screen.
 */
export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const resolved = (await Promise.resolve(params)) || {};
    const { variation, orderLines } = await loadForOverride(context.supabase, resolved.id, resolved.variationId);
    if (!variation) return Response.json({ ok: false, error: "Variation not found." }, { status: 404 });

    if (ANSWERED.includes(variation.status)) {
      return Response.json({
        ok: true,
        eligible: false,
        answered: true,
        reasons: ["This variation has already been responded to."],
        changes: [],
        rule: OVERRIDE_RULE_SENTENCE,
      });
    }

    const eligibility = overrideApprovalEligibility(variation.pcd_order_variation_lines || [], orderLines);
    return Response.json({
      ok: true,
      eligible: eligibility.ok,
      answered: false,
      reasons: eligibility.reasons,
      changes: eligibility.changes,
      rule: OVERRIDE_RULE_SENTENCE,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not check this variation." },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const resolved = (await Promise.resolve(params)) || {};
    const orderId = resolved.id;
    const variationId = resolved.variationId;
    const payload = await request.json().catch(() => ({}));

    const approvedBy = String(payload.approved_by || "").trim();
    if (!approvedBy) {
      return Response.json(
        {
          ok: false,
          error: "Say who agreed to this. A name is what makes it an approval rather than an assumption.",
        },
        { status: 400 }
      );
    }

    const channel = ACCEPTANCE_CHANNEL_KEYS.includes(payload.channel) ? payload.channel : null;
    if (!channel) {
      return Response.json(
        { ok: false, error: "Say how they agreed. It is recorded against the order." },
        { status: 400 }
      );
    }

    const reason = String(payload.reason || "").trim();
    if (!reason) {
      return Response.json(
        { ok: false, error: "Say why this is not going to the customer. It is recorded against the order." },
        { status: 400 }
      );
    }

    const { variation, orderLines } = await loadForOverride(context.supabase, orderId, variationId);
    if (!variation) return Response.json({ ok: false, error: "Variation not found." }, { status: 404 });

    if (ANSWERED.includes(variation.status)) {
      return Response.json(
        { ok: false, error: "This variation has already been responded to." },
        { status: 409 }
      );
    }

    // THE RULE, CHECKED AGAINST THE DATABASE.
    //
    // Not against anything the browser sent, and not only against what the
    // screen was showing when the modal opened. A line added to the variation
    // in another tab a moment ago is exactly the case this has to catch.
    const lines = variation.pcd_order_variation_lines || [];
    const eligibility = overrideApprovalEligibility(lines, orderLines);
    if (!eligibility.ok) {
      return Response.json(
        {
          ok: false,
          error: `This variation cannot be approved here. ${OVERRIDE_RULE_SENTENCE}`,
          reasons: eligibility.reasons,
        },
        { status: 422 }
      );
    }

    // CLAIMED ON THE STATUS WE READ, exactly as the customer's own approval is.
    //
    // If the customer approved through their own link while this was open, or
    // somebody pulled the variation back to draft, whichever landed first wins
    // and the database decides, not the timing. It matters more here than
    // anywhere: what follows rewrites lines the workshop is about to cut.
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await context.supabase
      .from("pcd_order_variations")
      .update({ status: "approved", approved_at: now })
      .eq("id", variation.id)
      .eq("status", variation.status)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      return Response.json(
        {
          ok: false,
          error:
            "This variation changed while you had it open, so it was not approved. Reload it and check where it stands.",
        },
        { status: 409 }
      );
    }

    // WHAT WAS AGREED, recorded the same way the customer's own answer is, in
    // the same table, so the two are read back by the same code. The difference
    // is stated inside the evidence rather than by leaving anything out: this
    // was approved by us, on their say so, and here is who and how.
    const evidence = {
      ...approvalEvidence({ request, lines, totals: variation, accessCode: variation.access_code }),
      admin_override: true,
      override_reason: reason,
      override_channel: channel,
      override_channel_label: acceptanceChannelLabel(channel),
      override_actor_email: context.user?.email || null,
      pricing_held: true,
    };
    const actionRow = {
      variation_id: variation.id,
      action: "approved",
      client_name: approvedBy,
      note: reason,
    };
    // Best effort on the evidence, the same rule the customer path follows: an
    // approval must never fail because a column is not there yet.
    const { error: actionError } = await context.supabase
      .from("pcd_order_variation_actions")
      .insert({ ...actionRow, evidence });
    if (actionError) {
      const { error: retryError } = await context.supabase
        .from("pcd_order_variation_actions")
        .insert(actionRow);
      if (retryError) throw retryError;
      console.error(
        "[variation-override] pcd_order_variation_actions.evidence is missing, so this approval was recorded " +
          "without who agreed or how. Run supabase/202608221200_pcd_approval_evidence.sql."
      );
    }

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: variation.pcd_orders?.quote_id || null,
      variation_id: variation.id,
      actor_type: "admin",
      action_type: "variation_override_approved",
      title: "Admin override: variation approved for the customer",
      description: `${variation.variation_number} agreed by ${approvedBy} ${acceptanceChannelLabel(channel).toLowerCase()}. ${reason}`,
      metadata: {
        variation_number: variation.variation_number,
        approved_by: approvedBy,
        channel,
        reason,
        previous_status: variation.status,
        actor_email: context.user?.email || null,
        // Both said out loud, because "no charge" with no figure beside it is
        // not a record of anything.
        pricing_held: true,
        not_charged_inc_gst: variation.total_inc_gst,
        size_changes: eligibility.changes.map((change) => ({
          item: change.title,
          from: change.from,
          to: change.to,
          qty: change.qty,
        })),
      },
    });

    // APPLIED WITH THE PRICE HELD. The sizes land on the order lines and the
    // order's money does not move. See applyAcceptedVariation.
    //
    // The failure is recorded on the variation rather than thrown away, the
    // same as the customer path: an approval that is in but not applied has to
    // be visible to the order page and the board, or the job carries on being
    // cut to the old size with nothing saying so.
    try {
      await applyAcceptedVariation(context.supabase, variation.id, {
        actorType: "admin",
        holdPricing: true,
      });
    } catch (applyError) {
      console.error("[variation-override] approved but not applied:", applyError?.message || applyError);
      await context.supabase
        .from("pcd_order_variations")
        .update({ apply_error: applyError?.message || "Could not apply this variation to the order." })
        .eq("id", variation.id);
      await logOrderActivity(context.supabase, {
        order_id: orderId,
        variation_id: variation.id,
        actor_type: "system",
        action_type: "variation_apply_failed",
        title: "Variation approved but not applied",
        description:
          `${variation.variation_number} was approved by an admin override and could not be written onto the ` +
          `order: ${applyError?.message || "unknown error"}. The order still shows the old sizes.`,
      });
      return Response.json({
        ok: true,
        applied: false,
        message:
          "The approval is recorded but the new sizes did not reach the order. The order page says so. Do not cut to these sizes yet.",
      });
    }

    const { data: updated } = await context.supabase
      .from("pcd_order_variations")
      .select("*")
      .eq("id", variation.id)
      .maybeSingle();

    return Response.json({
      ok: true,
      applied: true,
      variation: updated,
      message:
        `Approved for ${approvedBy} and applied to the order. The new sizes are on the order lines and the ` +
        `order total has not moved.`,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not approve this variation." },
      { status: error?.status || 500 }
    );
  }
}
