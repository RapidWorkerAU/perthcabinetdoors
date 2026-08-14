import { createOrderFromQuote } from "../../../../lib/pcd-order-from-quote";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
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
    const { data: quote, error } = await supabase
      .from("pcd_quotes")
      .select("*")
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

    const { error: updateError } = await supabase.from("pcd_quotes").update(updatePayload).eq("id", quote.id);
    if (updateError) throw updateError;

    await supabase.from("pcd_quote_actions").insert({
      quote_id: quote.id,
      action,
      client_name: String(payload.client_name || "").trim(),
      note: payload.note || null,
    });

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
