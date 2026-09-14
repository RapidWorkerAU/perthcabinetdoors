// PAY FOR A CART.
//
// Writes the quote behind the web order and answers with the Stripe page to pay
// it on. Nothing is an order until the money lands. See
// lib/pcd-shop-checkout.js for what is checked again before anything is
// written, and lib/pcd-deposit-gate.js for how the payment becomes an order.

import { SHOP_ENABLED } from "../../../../lib/pcd-site-flags";
import { startWebCheckout } from "../../../../lib/pcd-shop-checkout";
import { returnOrigin } from "../../../../lib/pcd-stripe";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { checkoutRequestSchema } from "../_shop-request";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!SHOP_ENABLED) return Response.json({ ok: false, error: "The shop is not open yet." }, { status: 404 });

  let body;
  try {
    body = checkoutRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "That order could not be read. Please check your details." }, { status: 400 });
  }

  try {
    const result = await startWebCheckout(createSupabaseAdminClient(), {
      ...body,
      // The address the shopper is actually on, so Stripe sends them back to the
      // same site they left. See returnOrigin.
      baseUrl: returnOrigin(request),
    });
    if (!result.ok) return Response.json(result, { status: result.status || 400 });
    return Response.json(result);
  } catch (error) {
    console.error(`[shop/checkout] ${error?.message || error}`);
    return Response.json(
      { ok: false, error: "We could not start your payment just now. Nothing has been charged. Please try again." },
      { status: 500 }
    );
  }
}
