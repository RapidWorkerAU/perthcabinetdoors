// The Polytec thermolaminate rate card: read by the quote editor to price
// thermolaminate lines, and edited in Settings. One row, cleaned both ways by
// lib/pcd-thermo-pricing.js.

import { requireAdminApiContext } from "../../../../lib/admin-api";
import { getThermoRateCard, saveThermoRateCard } from "../../../../lib/pcd-thermo-pricing-store";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const result = await getThermoRateCard(context.supabase);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load the thermolaminate rate card." }, { status: 500 });
  }
}

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const payload = await request.json();
    const result = await saveThermoRateCard(context.supabase, payload?.card || {});
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error?.message?.includes("pcd_thermo_pricing")
      ? "The thermolaminate rate card table is not there yet. Run supabase/202609271400_pcd_thermo_pricing.sql."
      : error?.message || "Could not save the thermolaminate rate card.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
