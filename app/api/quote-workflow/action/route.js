import { createOrderFromQuote } from "../../../../lib/pcd-order-from-quote";
import { logOrderActivity } from "../../../../lib/pcd-activity-log";
import { createCheckoutSession, siteUrl } from "../../../../lib/pcd-stripe";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

const allowedActions = new Set(["approved", "rejected"]);

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
    if (action === "approved") {
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
