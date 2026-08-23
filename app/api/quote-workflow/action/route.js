import { createOrderFromQuote } from "../../../../lib/pcd-order-from-quote";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { approvalEvidence } from "../../../../lib/pcd-approval-evidence";
import { createCheckoutSession, siteUrl } from "../../../../lib/pcd-stripe";
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

function depositAmountForQuote(quote) {
  if (!quote.deposit_required) return 0;
  const percent = Number(quote.deposit_percent || 0);
  const total = Number(quote.total_inc_gst || 0);
  if (!Number.isFinite(percent) || percent <= 0 || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((total * percent) / 100).toFixed(2));
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

    if (quote.status === "approved" || quote.status === "rejected") {
      return Response.json({ ok: false, error: "This quote has already been responded to." }, { status: 409 });
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

      orderId = await createOrderFromQuote(supabase, quote, { markAcceptedAt: !quote.deposit_required });
      const depositAmount = depositAmountForQuote(quote);
      if (quote.deposit_required && depositAmount > 0) {
        const { data: existingPayment } = await supabase
          .from("pcd_order_payments")
          .select("*")
          .eq("order_id", orderId)
          .eq("payment_type", "deposit")
          .maybeSingle();

        const paymentPayload = {
          order_id: orderId,
          payment_type: "deposit",
          amount: depositAmount,
          is_paid: false,
          notes: `${Number(quote.deposit_percent || 0).toFixed(2)}% deposit required to accept ${quote.quote_number}`,
          sort_order: 0,
          request_status: "checkout_created",
        };
        const { data: payment, error: paymentError } = existingPayment?.id
          ? await supabase.from("pcd_order_payments").update(paymentPayload).eq("id", existingPayment.id).select("*").single()
          : await supabase.from("pcd_order_payments").insert(paymentPayload).select("*").single();
        if (paymentError) throw paymentError;

        const baseUrl = siteUrl(request.url);
        const session = await createCheckoutSession({
          amount: depositAmount,
          currency: quote.currency || "AUD",
          customerEmail: quote.customer_email,
          description: `${quote.quote_number} deposit`,
          successUrl: `${baseUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}/quotes/view?code=${encodeURIComponent(quote.access_code)}`,
          metadata: {
            flow: "quote_deposit",
            quote_id: quote.id,
            order_id: orderId,
            payment_id: payment.id,
            quote_number: quote.quote_number,
          },
        });

        await supabase
          .from("pcd_order_payments")
          .update({
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent || null,
            request_url: session.url,
            requested_at: now,
          })
          .eq("id", payment.id);

        return Response.json({ ok: true, requiresPayment: true, checkoutUrl: session.url, orderId });
      }
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

    return Response.json({ ok: true, orderId });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not record quote response." }, { status: 500 });
  }
}
