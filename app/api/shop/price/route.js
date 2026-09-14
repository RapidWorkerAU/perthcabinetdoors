// THE PRICE OF A CART, OR OF ONE LINE ON A PRODUCT PAGE.
//
// Worked out here rather than in the browser, so no rate ever leaves the
// server: what comes back is marked-up prices for whole pieces and nothing a
// customer could divide back into our formula. See lib/pcd-shop-pricing.js.

import { SHOP_ENABLED } from "../../../../lib/pcd-site-flags";
import { priceShopCart, publicCartPrice } from "../../../../lib/pcd-shop-pricing";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { priceRequestSchema } from "../_shop-request";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!SHOP_ENABLED) return Response.json({ ok: false, error: "The shop is not open yet." }, { status: 404 });

  let body;
  try {
    body = priceRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ ok: false, error: "That cart could not be read." }, { status: 400 });
  }

  try {
    const result = await priceShopCart(createSupabaseAdminClient(), body);
    return Response.json(publicCartPrice(result), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[shop/price] ${error?.message || error}`);
    return Response.json({ ok: false, error: "We could not price that just now. Please try again." }, { status: 500 });
  }
}
