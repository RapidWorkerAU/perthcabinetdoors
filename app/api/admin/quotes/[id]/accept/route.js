// ACCEPT A QUOTE ON THE CUSTOMER'S BEHALF.
//
// Sometimes the customer says yes on the phone and will never open the link.
// The work still has to start, so this exists.
//
// It is a POST to its own route rather than a value on the Status dropdown,
// because accepting is an EVENT and not a field. Setting the word "Approved" on
// a dropdown wrote the word and raised no order, which left a quote that read as
// accepted with nothing for the workshop to make. Worse, an approved quote is
// permanently read only, so that one click produced a record that could not be
// edited, could not be un-accepted, and had no order to raise a variation
// against.
//
// Everything the customer's own acceptance does happens here too, through the
// same shared function, so the two cannot drift. See lib/pcd-quote-acceptance.js.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import {
  ACCEPTANCE_CHANNEL_KEYS,
  acceptanceGaps,
  acceptQuoteForCustomer,
} from "../../../../../../lib/pcd-quote-acceptance";
import { sendQuoteApprovedToCustomer } from "../../../../../../lib/pcd-customer-confirmations";
import { editability } from "../../../../../../lib/pcd-document-lock";
import { orderForQuote } from "../../../../../../lib/pcd-quote-lock";

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id: quoteId } = (await Promise.resolve(params)) || {};
    const payload = await request.json().catch(() => ({}));

    const channel = ACCEPTANCE_CHANNEL_KEYS.includes(payload.channel) ? payload.channel : null;
    if (!channel) {
      return Response.json(
        { ok: false, error: "Say how the customer accepted. It is recorded against the order." },
        { status: 400 }
      );
    }

    const acceptedBy = String(payload.accepted_by || "").trim();
    if (!acceptedBy) {
      return Response.json(
        { ok: false, error: "Say who accepted it. A name is what makes this an acceptance rather than an assumption." },
        { status: 400 }
      );
    }

    // The lines come with it: the acceptance records a fingerprint of what was
    // agreed, and that is made of the lines.
    const { data: quote, error } = await context.supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*)")
      .eq("id", quoteId)
      .maybeSingle();
    if (error) throw error;
    if (!quote) return Response.json({ ok: false, error: "Quote not found." }, { status: 404 });

    // Already an order. Returning it rather than erroring, because pressing
    // accept twice should land on the same order, not on a message.
    const existingOrder = await orderForQuote(context.supabase, quoteId);
    if (existingOrder) {
      return Response.json({
        ok: true,
        alreadyAccepted: true,
        orderId: existingOrder.id,
        message: `This quote is already order ${existingOrder.order_number || "on the system"}.`,
      });
    }

    if (editability("quote", quote.status) === "permanent") {
      return Response.json(
        {
          ok: false,
          error:
            "This quote has already been responded to and has no order behind it. Check its history before accepting it.",
        },
        { status: 409 }
      );
    }

    // The same line the customer's own approval screen holds. An order with no
    // address cannot reach a delivery run, and accepting on their behalf must
    // not be the shortcut that creates one.
    const gaps = acceptanceGaps(quote);
    if (gaps.length) {
      return Response.json(
        {
          ok: false,
          error: `This quote is missing ${gaps.join(", ")}. Add it before accepting, or the order cannot be delivered.`,
          gaps,
        },
        { status: 422 }
      );
    }

    const { orderId, depositAmount } = await acceptQuoteForCustomer(context.supabase, quote, {
      actorEmail: context.user?.email || null,
      channel,
      note: payload.note,
      acceptedBy,
      request,
    });

    // ACCEPTED ON THEIR BEHALF STILL DESERVES A CONFIRMATION.
    //
    // They said yes on the phone, so nothing has been sent to them at all: no
    // approval of their own to see, no payment page. A written confirmation with
    // the order number on it is the only record they get, and it is the one they
    // will look for. Never throws: the order is already raised.
    //
    // Sent whether or not a deposit is owed, unlike the customer's own
    // approval. Nothing here takes them to a payment page, so there is no
    // second email for this one to collide with.
    const { data: raisedOrder } = orderId
      ? await context.supabase.from("pcd_orders").select("order_number").eq("id", orderId).maybeSingle()
      : { data: null };
    const confirmation = await sendQuoteApprovedToCustomer({
      quote,
      orderNumber: raisedOrder?.order_number || "",
    });

    return Response.json({
      ok: true,
      orderId,
      depositAmount,
      confirmationSent: confirmation.ok,
      confirmationError: confirmation.ok ? "" : confirmation.error,
      message:
        (depositAmount > 0
          ? `Order raised. A deposit of ${depositAmount.toFixed(2)} is recorded as owing and has not been requested.`
          : "Order raised.") +
        (confirmation.ok
          ? " The customer has been emailed a confirmation."
          : ` The customer was NOT emailed: ${confirmation.error}`),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not accept this quote." },
      { status: error?.status || 500 }
    );
  }
}
