// A CUSTOMER'S CREDITS, AND THE TWO THINGS YOU CAN DO TO ONE.
//
// GET   everything they hold, in every state, so money we are holding is never
//       invisible and money already spent can still be traced.
// PATCH release one back to available, or close one.
//
// ── ONLY ONE OF THOSE NEEDS A REASON ─────────────────────────────────────────
//
// Releasing moves a credit between our own quotes. The customer holds the same
// amount before and after, so there is nothing to justify and no modal.
//
// Writing one off, or refunding it, TAKES money off a customer. Those get the
// same treatment a variation override gets: a reason is required, it is
// recorded with who did it, and there is no way round it. closeCredit refuses
// without one rather than trusting this route to remember.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { closeCredit, releaseCredit, syncQuoteCreditTotal } from "../../../../../../lib/pcd-customer-credits";

async function customerIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const customerId = await customerIdFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_customer_credits")
      // The quote and the order are named rather than left as ids, because a
      // credit that says "held by 4a21b0" tells nobody anything.
      .select("*, pcd_quotes:held_quote_id(quote_number), pcd_orders:spent_order_id(order_number)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return Response.json({ ok: true, credits: data || [] });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not read this customer's credits." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const customerId = await customerIdFromParams(params);
    const payload = await request.json().catch(() => ({}));
    const creditId = String(payload.credit_id || "").trim();
    const action = String(payload.action || "").trim();

    if (!creditId) {
      return Response.json({ ok: false, error: "Which credit?" }, { status: 400 });
    }

    // Read first and check it belongs to this customer, so a credit id from
    // another record cannot be closed through this route.
    const { data: credit } = await context.supabase
      .from("pcd_customer_credits")
      .select("*")
      .eq("id", creditId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (!credit) return Response.json({ ok: false, error: "Credit not found." }, { status: 404 });

    if (action === "release") {
      const released = await releaseCredit(context.supabase, creditId);
      if (!released) {
        return Response.json(
          { ok: false, error: "That credit is not on a quote, so there is nothing to release." },
          { status: 409 }
        );
      }
      // The quote it came off has to stop claiming it in its own total.
      if (credit.held_quote_id) await syncQuoteCreditTotal(context.supabase, credit.held_quote_id);
      return Response.json({ ok: true, credit: released, message: "Back on the customer, ready to use." });
    }

    if (action === "write_off" || action === "refund") {
      const closed = await closeCredit(context.supabase, creditId, {
        outcome: action === "refund" ? "refunded" : "written_off",
        reason: payload.reason,
        actor: context.user?.email || null,
      });
      if (credit.held_quote_id) await syncQuoteCreditTotal(context.supabase, credit.held_quote_id);
      return Response.json({
        ok: true,
        credit: closed,
        message: action === "refund"
          ? "Recorded as refunded. Process the refund in Stripe if you have not already."
          : "Written off, with your reason against it.",
      });
    }

    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not change that credit." },
      { status: error?.status || 500 }
    );
  }
}
