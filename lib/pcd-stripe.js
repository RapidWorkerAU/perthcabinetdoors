import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

export function siteUrl(requestUrl = "") {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
}

export function toCents(amount) {
  return Math.max(0, Math.round(Number(amount || 0) * 100));
}

export function fromCents(amount) {
  return Number((Number(amount || 0) / 100).toFixed(2));
}

export async function createCheckoutSession({
  amount,
  currency = "AUD",
  customerEmail,
  description,
  metadata = {},
  successUrl,
  cancelUrl,
}) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  if (customerEmail) params.set("customer_email", customerEmail);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", String(currency || "AUD").toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(toCents(amount)));
  params.set("line_items[0][price_data][product_data][name]", description || "Perth Cabinet Doors payment");
  params.set("payment_intent_data[description]", description || "Perth Cabinet Doors payment");
  if (customerEmail) params.set("payment_intent_data[receipt_email]", customerEmail);

  Object.entries(metadata).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      params.set(`metadata[${key}]`, String(value));
      params.set(`payment_intent_data[metadata][${key}]`, String(value));
    }
  });

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Could not create Stripe Checkout session.");
  }
  return payload;
}

export async function retrieveCheckoutSession(sessionId) {
  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey()}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Could not retrieve Stripe Checkout session.");
  }
  return payload;
}

/**
 * Kill a checkout session so the link stops taking money.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Marking a payment as received outside the link used to set a flag in our own
 * database and nothing else. The Stripe session stayed live, so the customer
 * could still open the link they were emailed and pay a second time. Our books
 * would show one payment because the webhook ignores an already-paid row, and
 * the customer would be out twice the money with nothing here saying so.
 *
 * A flag in our database is not a closed link. This is.
 *
 * Returns { expired, alreadyClosed, error }. It does not throw: a settlement
 * must not fail because Stripe was unreachable, but the caller has to be told,
 * because "the link is closed" and "we could not close the link" are different
 * things to say to the person pressing the button.
 */
export async function expireCheckoutSession(sessionId) {
  if (!sessionId) return { expired: false, alreadyClosed: true };
  try {
    const response = await fetch(
      `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      { method: "POST", headers: { Authorization: `Bearer ${stripeSecretKey()}` } }
    );
    const payload = await response.json();
    if (response.ok) return { expired: true, alreadyClosed: false };

    // Stripe refuses to expire a session that is already complete or already
    // expired. Both mean the link is not going to take money again, which is the
    // outcome we wanted, so neither is a failure.
    const message = String(payload?.error?.message || "");
    if (/already|not in the `open` state|expired|complete/i.test(message)) {
      return { expired: false, alreadyClosed: true, error: message };
    }
    return { expired: false, alreadyClosed: false, error: message || "Stripe would not expire the checkout session." };
  } catch (error) {
    return { expired: false, alreadyClosed: false, error: error?.message || "Could not reach Stripe." };
  }
}

export function verifyStripeWebhook(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signatureHeader) throw new Error("Missing Stripe signature.");

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Invalid Stripe signature.");

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Invalid Stripe webhook signature.");
  }

  return JSON.parse(rawBody);
}
