import { createOrderFromQuote } from "../../../../lib/pcd-order-from-quote";
import { sendQuoteApprovedToCustomer } from "../../../../lib/pcd-customer-confirmations";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { approvalEvidence } from "../../../../lib/pcd-approval-evidence";
import { siteUrl } from "../../../../lib/pcd-stripe";
import { cancelOpenCheckouts, startDepositCheckout } from "../../../../lib/pcd-deposit-gate";
import { depositAmountForQuote } from "../../../../lib/pcd-quote-acceptance";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { upsertCustomerByEmail } from "../../../../lib/pcd-customer-utils";
import {
  DETAIL_FIELDS,
  formatSiteAddress,
  normaliseDetails,
  validateDetails,
} from "../../../../lib/pcd-contact-details";

const allowedActions = new Set(["approved", "rejected"]);

// The address and contact details, written onto the quote so the order created
// from it inherits them. createOrderFromQuote copies these across, so the quote
// has to be updated BEFORE the order is made or the job still reaches the run
// with nothing on it.
function customerColumns(details) {
  return {
    customer_name: details.name,
    customer_email: details.email,
    customer_phone: details.mobile,
    site_address: formatSiteAddress(details),
    site_street: details.street,
    site_suburb: details.suburb,
    site_postcode: details.postcode,
  };
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const accessCode = String(payload.code || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
    const action = payload.action;

    if (!accessCode || !allowedActions.has(action)) {
      return Response.json({ ok: false, error: "Invalid quote response." }, { status: 400 });
    }

    if (!String(payload.client_name || "").trim()) {
      return Response.json({ ok: false, error: "Please enter your name first." }, { status: 400 });
    }

    if (action === "rejected" && !String(payload.note || "").trim()) {
      return Response.json({ ok: false, error: "Please include a rejection note." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    // The lines come with it because the approval records a fingerprint of
    // what the customer agreed to, and that is made of the lines. Without them
    // the fingerprint would describe the totals alone and two quotes with the
    // same total but different work would look identical.
    const { data: quote, error } = await supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*)")
      .eq("access_code", accessCode)
      .maybeSingle();

    if (error || !quote) {
      return Response.json({ ok: false, error: "We could not load this quote." }, { status: 404 });
    }

    // A HELD QUOTE IS NOT A RESPONDED ONE.
    //
    // awaiting_deposit is deliberately absent from this list. It is the one
    // state where the customer has answered and still has something left to do,
    // and turning them away here is exactly the dead end this replaced: they
    // clicked Approve, went to pay, got interrupted, and could never get back
    // in without ringing us.
    if (quote.status === "approved" || quote.status === "rejected") {
      return Response.json({ ok: false, error: "This quote has already been responded to." }, { status: 409 });
    }

    // AN EXPIRED QUOTE CANNOT BE ACCEPTED, and the viewer already refuses to
    // load one. This is the same rule written a second time on purpose: a page
    // left open in a tab before the quote expired still holds a working form,
    // and the check that matters is the one on the write.
    //
    // See the matching refusal in ../get/route.js for the wording and why it
    // does not use our word for it.
    if (quote.status === "archived") {
      return Response.json(
        {
          ok: false,
          expired: true,
          error:
            "This quote has expired and can no longer be approved. If you would still like the work done, get " +
            "in touch and we will put a fresh quote together for you. Prices and lead times may have changed " +
            "since this one was prepared.",
        },
        { status: 410 }
      );
    }

    const now = new Date().toISOString();
    let orderId = null;
    let details = null;

    if (action === "approved") {
      // ACCEPTANCE REQUIRES A DELIVERABLE ADDRESS. Checked here and not only in
      // the browser, because a client-side check is a suggestion. Rejection is
      // deliberately not gated: someone declining should not have to hand over
      // their address first.
      details = normaliseDetails(payload.details || {});
      const invalid = validateDetails(details);
      if (Object.keys(invalid).length) {
        return Response.json(
          {
            ok: false,
            error: "We need your contact and delivery details before this quote can be accepted.",
            fieldErrors: invalid,
            missing: DETAIL_FIELDS.filter((f) => invalid[f.key]).map((f) => f.label),
          },
          { status: 422 }
        );
      }

      // Onto the quote first: the order is built from it moments later.
      const { error: detailsError } = await supabase
        .from("pcd_quotes")
        .update(customerColumns(details))
        .eq("id", quote.id);
      if (detailsError) throw detailsError;
      Object.assign(quote, customerColumns(details));

      // And onto the customer record, so the next quote for this person is
      // pre-filled and we never have to ask again. Matched on email through the
      // shared upsert, so this can never create a second record for them.
      try {
        const customer = await upsertCustomerByEmail(supabase, {
          name: details.name,
          email: details.email,
          phone: details.mobile,
          site_address: formatSiteAddress(details),
        });
        if (customer?.id) {
          await supabase
            .from("pcd_customers")
            .update({
              site_address: formatSiteAddress(details),
              site_street: details.street,
              site_suburb: details.suburb,
              site_postcode: details.postcode,
              phone: details.mobile,
            })
            .eq("id", customer.id);
          if (!quote.customer_id) {
            await supabase.from("pcd_quotes").update({ customer_id: customer.id }).eq("id", quote.id);
            quote.customer_id = customer.id;
          }
        }
      } catch {
        // The acceptance is the important part and the details are already on
        // the quote and therefore on the order. A failure to also file them
        // against the customer must not block the customer's acceptance.
      }

      // A DEPOSIT QUOTE STOPS HERE AND COMMITS TO NOTHING.
      //
      // No approval is recorded and no order is created. The quote goes into a
      // holding state and the customer goes to a payment page, and it is money
      // arriving that turns that into an approval and an order, in one place:
      // finaliseDepositAcceptance. See lib/pcd-deposit-gate.js.
      //
      // Doing it the other way round is what left an order behind for work
      // nobody had paid for, and locked the customer out of their own quote so
      // they could not come back and finish.
      if (quote.deposit_required && depositAmountForQuote(quote) > 0) {
        const started = await startDepositCheckout(supabase, quote, {
          baseUrl: siteUrl(request.url),
          clientName: payload.client_name,
        });
        if (!started.ok) {
          return Response.json({ ok: false, error: started.error }, { status: started.status || 400 });
        }
        return Response.json({
          ok: true,
          requiresPayment: true,
          checkoutUrl: started.checkoutUrl,
          // Deliberately no orderId. There is no order, and saying otherwise
          // would put the browser back to announcing one that does not exist.
          orderId: null,
        });
      }

      // CLAIM THE QUOTE BEFORE MAKING ANYTHING FROM IT.
      //
      // The status was read at the top of this request. Between that read and
      // here, an admin override can pull the quote back to draft and rotate its
      // access code, because a customer who never received the email still has
      // to be editable around. Without this claim the two would interleave: the
      // override would win the status, this would still raise an order from the
      // version being edited, and the order would exist against a quote that no
      // longer read as approved.
      //
      // Conditional on the status we actually read, so exactly one of the two
      // can win and it is decided by the database rather than by timing.
      const { data: claimed, error: claimError } = await supabase
        .from("pcd_quotes")
        .update({ status: "approved", approved_at: now })
        .eq("id", quote.id)
        .eq("status", quote.status)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        return Response.json(
          {
            ok: false,
            error:
              "This quote was changed while you had it open, so it could not be approved. Please contact us and we will send you the current version.",
          },
          { status: 409 }
        );
      }

      orderId = await createOrderFromQuote(supabase, quote, { markAcceptedAt: true });
    }

    const updatePayload =
      action === "approved"
        ? { status: "approved", approved_at: now, order_id: orderId }
        : { status: "rejected", rejected_at: now };

    // An approval has already claimed the status above; this fills in the order
    // link. A rejection has not, so it is claimed here on the same condition,
    // for the same reason: an override must not be overwritten by a rejection
    // of the version it replaced.
    const finalise = supabase.from("pcd_quotes").update(updatePayload).eq("id", quote.id);
    const { data: finalised, error: updateError } = await (action === "approved"
      ? finalise.select("id").maybeSingle()
      : finalise.eq("status", quote.status).select("id").maybeSingle());
    if (updateError) throw updateError;
    if (action === "rejected" && !finalised) {
      return Response.json(
        {
          ok: false,
          error:
            "This quote was changed while you had it open, so your response could not be recorded. Please contact us and we will send you the current version.",
        },
        { status: 409 }
      );
    }

    // WHAT they agreed to, not just that they agreed. See
    // lib/pcd-approval-evidence.js. Written best-effort: a customer's approval
    // must never fail because the evidence column is not there yet, so a
    // rejected insert is retried without it and said out loud.
    const evidence = approvalEvidence({
      request,
      lines: quote.pcd_quote_line_items || [],
      totals: quote,
      accessCode,
    });
    const actionRow = {
      quote_id: quote.id,
      action,
      client_name: String(payload.client_name || "").trim(),
      note: payload.note || null,
    };
    const { error: actionError } = await supabase.from("pcd_quote_actions").insert({ ...actionRow, evidence });
    if (actionError) {
      const { error: retryError } = await supabase.from("pcd_quote_actions").insert(actionRow);
      if (retryError) throw retryError;
      console.error(
        "[quote-workflow] pcd_quote_actions.evidence is missing, so this response was recorded without any " +
          "record of what the customer actually agreed to. Run supabase/202608221200_pcd_approval_evidence.sql."
      );
    }

    if (action === "rejected") {
      // A customer can decline a quote they had already started paying for, by
      // coming back to the link and choosing the other button. The payment page
      // has to die with it: our status means nothing to Stripe, and somebody
      // still holding that tab could otherwise pay for a job they just declined.
      await cancelOpenCheckouts(supabase, quote.id, { status: "cancelled" });

      await logOrderActivity(supabase, {
        quote_id: quote.id,
        actor_type: "customer",
        action_type: "quote_rejected",
        title: "Quote rejected by customer",
        description: payload.note || null,
        metadata: {
          client_name: String(payload.client_name || "").trim(),
        },
      });
    }

    // APPROVED, WITH NOTHING TO PAY YET.
    //
    // Reaching here on an approval means no deposit was owed: the deposit path
    // returns further up, with the customer on their way to the payment page,
    // and the payment confirmation follows the moment they pay. This is the
    // other half of that, and it used to be silence.
    //
    // Never throws, so a refused email cannot undo an approval that is already
    // recorded.
    if (action === "approved") {
      const { data: raisedOrder } = orderId
        ? await supabase.from("pcd_orders").select("order_number").eq("id", orderId).maybeSingle()
        : { data: null };
      await sendQuoteApprovedToCustomer({ quote, orderNumber: raisedOrder?.order_number || "" });
    }

    return Response.json({ ok: true, orderId });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not record quote response." }, { status: 500 });
  }
}
