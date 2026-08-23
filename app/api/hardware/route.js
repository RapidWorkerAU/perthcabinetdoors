// THE HARDWARE CATALOGUE, FOR THE WEBSITE.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The public quote form offers Hardware as a product type and then had nothing
// to show for it. Hardware has no board, so its material dropdown was empty, and
// anybody who picked it reached a row they could not finish and could not
// explain. They either abandoned the line or sent it half-filled.
//
// Now they pick the actual item, which means the line arrives naming something
// we stock rather than "handles, the normal ones".
//
// ── WHAT WE DO NOT SEND ─────────────────────────────────────────────────────
//
// Not our cost. Same rule as the colour library: this endpoint takes no sign-in,
// so the unit cost is stripped unless the caller is the signed-in admin. The
// customer picks by name, brand and photo; what it costs us is not part of that
// choice and is nobody's business but ours.
//
// Retired items are hidden from everyone, admin included. An inactive row is one
// we have stopped selling, and offering it on a NEW request is how a line gets
// quoted against something we can no longer buy.

import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-api";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLE = "pcd_hardware";

// Zeroed rather than removed, so every caller keeps one shape and nothing has to
// guard against a missing key. A public reader sees 0, which it already treats
// as "not priced".
function withoutCost(row) {
  return { ...row, unit_cost_ex_gst: 0 };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const admin = await isAdminRequest();

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch {
    supabase = await createSupabaseServerClient();
  }

  let query = supabase
    .from(TABLE)
    .select("*")
    .order("type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const type = searchParams.get("type");
  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) {
    // Said out loud rather than returned as an empty list. A picker cannot tell
    // "we stock nothing" from "the read failed", and it would show the first as
    // the second with nothing on screen to say so.
    return NextResponse.json(
      { ok: false, error: "Could not load the hardware list." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rows = (data || []).filter((row) => row.is_active !== false);

  return NextResponse.json(
    {
      ok: true,
      hardware: rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        brand: row.brand || "",
        sku: row.sku || "",
        description: row.description || "",
        imageUrl: row.image_url || "",
        // Every dimension the row carries. Which ones matter depends on the
        // type, so the choosing is left to whoever renders it.
        widthMm: row.width_mm ?? null,
        heightMm: row.height_mm ?? null,
        depthMm: row.depth_mm ?? null,
        lengthMm: row.length_mm ?? null,
        holeSpacingMm: row.hole_spacing_mm ?? null,
        projectionMm: row.projection_mm ?? null,
        unitCostExGst: admin ? row.unit_cost_ex_gst ?? 0 : withoutCost(row).unit_cost_ex_gst,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
