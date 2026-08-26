// PULL A SENT QUOTE BACK TO DRAFT, DELIBERATELY.
//
// A sent quote is sealed, because a customer is holding a link to it and that
// link has to keep meaning what it meant when it was sent. But sealed cannot be
// a dead end: a customer who never received the email can neither approve nor
// reject, and the work still has to move.
//
// So this exists, and what makes it safe is what it destroys. Issuing a new
// access code kills the link the customer was sent. From that moment they
// cannot approve a version that is being edited, because the version they hold
// no longer resolves.
//
// It is deliberately not silent. It takes a reason, refuses without one, and
// writes both the reason and who did it onto the quote's activity. An override
// with no record is the silent edit this whole mechanism was built to stop.

import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { editability, pullBackToDraftPatch } from "../../../../../../lib/pcd-document-lock";
import { orderForQuote } from "../../../../../../lib/pcd-quote-lock";
import { cancelOpenCheckouts } from "../../../../../../lib/pcd-deposit-gate";

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id: quoteId } = await Promise.resolve(params).then((p) => p || {});
    const payload = await request.json().catch(() => ({}));
    const reason = String(payload.reason || "").trim();

    if (!reason) {
      return Response.json(
        { ok: false, error: "Say why you are overriding. It is recorded against the quote." },
        { status: 400 }
      );
    }

    const { data: quote, error } = await context.supabase
      .from("pcd_quotes")
      .select("id, quote_number, status, access_code, sent_at")
      .eq("id", quoteId)
      .maybeSingle();
    if (error) throw error;
    if (!quote) return Response.json({ ok: false, error: "Quote not found." }, { status: 404 });

    // An accepted quote is past overriding. The work is committed and the only
    // honest way to change it is a variation the customer approves.
    const order = await orderForQuote(context.supabase, quoteId);
    if (order) {
      return Response.json(
        {
          ok: false,
          error: `This quote is now order ${order.order_number || "on the system"}. Raise a variation on the order instead.`,
        },
        { status: 409 }
      );
    }

    const state = editability("quote", quote.status);
    if (state === "open") {
      return Response.json(
        { ok: false, error: "This quote is already editable. No override is needed." },
        { status: 409 }
      );
    }
    if (state === "permanent") {
      return Response.json({ ok: false, error: "This quote can no longer be edited." }, { status: 409 });
    }

    // A NEW ACCESS CODE MEANS NOTHING TO STRIPE.
    //
    // Rotating the code below kills the customer's quote link, which is what
    // makes this safe for a sent or viewed quote. A quote awaiting a deposit
    // has a second door: the payment page, which is a Stripe url the customer
    // may still have open and which knows nothing about our access codes. Left
    // alone they could pay a price that is in the middle of being withdrawn.
    //
    // Closed BEFORE the pull back, so there is no window where the quote is
    // editable and the old figure is still payable. Never throws: it is
    // housekeeping, and it must not be able to fail the override.
    const closed = await cancelOpenCheckouts(context.supabase, quoteId, { status: "superseded" });

    const previousCode = quote.access_code;
    const { data: updated, error: updateError } = await context.supabase
      .from("pcd_quotes")
      .update(pullBackToDraftPatch("quote", makeAccessCode()))
      .eq("id", quoteId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    await logOrderActivity(context.supabase, {
      quote_id: quoteId,
      actor_type: "admin",
      action_type: "quote_override_to_draft",
      title: "Admin override: quote pulled back to draft",
      description: reason,
      metadata: {
        quote_number: quote.quote_number,
        previous_status: quote.status,
        reason,
        // Recorded so a question later about "which link did they have" can be
        // answered. The code itself is dead, so keeping it costs nothing.
        cancelled_access_code: previousCode,
        // So a question later about "could they still have paid" is answerable.
        cancelled_payment_pages: closed,
        actor_email: context.user?.email || null,
      },
    });

    return Response.json({
      ok: true,
      quote: updated,
      message:
        "The customer's link has been cancelled and the quote is back in draft. Send it again when you are done." +
        (closed ? " Their payment page has been cancelled too." : ""),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not override this quote." },
      { status: error?.status || 500 }
    );
  }
}
