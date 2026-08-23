// The colour library, read by BOTH the website and the admin.
//
// WHAT WE DO NOT SEND TO THE PUBLIC. The rows carry our supplier cost, per m²
// and per board. The website's quote form and the public design planner both
// read this endpoint, and it takes no sign-in, so those two numbers were going
// out to anyone who opened the page. They are now stripped unless the caller is
// the signed-in admin, whose colour picker genuinely needs them to price a line.
//
// Nothing on the customer side ever needed a cost: the public planner is
// deliberately priceless, and the quote form only shows swatches. The one place
// a customer sees money is the IKEA configurator, and that computes its own
// marked-up, GST-inclusive rate on the server (see app/(site)/ikea-kaboodle).

import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/admin-api";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import {
  buildColourAvailabilityFromLibraryRows,
  getDatabaseColourFamilyForSelection,
  getDatabaseColourItems,
  getDatabaseColourRows,
  getDatabaseColourSuppliers,
  normaliseColourMaterialKey,
  normaliseSupplierName,
} from "../../../lib/pcd-colour-library";

export const dynamic = "force-dynamic";

// Zeroed rather than deleted, so every caller keeps the same shape and nothing
// has to guard against a missing key. A public reader sees 0, which it already
// treats as "not priced".
function withoutCosts(colourFamily) {
  if (!colourFamily) return colourFamily;
  return {
    ...colourFamily,
    groups: (colourFamily.groups || []).map((group) => ({
      ...group,
      colours: (group.colours || []).map((colour) => ({
        ...colour,
        costPerBoardExGst: 0,
        costPerSqmExGst: 0,
      })),
    })),
  };
}

function itemsWithoutCosts(items) {
  return (items || []).map((item) => ({ ...item, cost: 0 }));
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

  if (searchParams.get("items") === "1") {
    const items = await getDatabaseColourItems(supabase);
    return NextResponse.json(
      { ok: true, items: admin ? items : itemsWithoutCosts(items) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (searchParams.get("suppliers") === "1") {
    const suppliers = await getDatabaseColourSuppliers(supabase);
    return NextResponse.json({ ok: true, suppliers }, { headers: { "Cache-Control": "no-store" } });
  }

  if (searchParams.get("availability") === "1") {
    const rows = await getDatabaseColourRows(supabase, { activeOnly: true });

    // WHICH BRANDS STOCK WHICH MATERIAL, deduplicated to the pairs themselves
    // rather than the rows, so this stays a handful of entries however many
    // colours the library holds.
    //
    // Per material, not one flat list: a brand can stock decorative board and no
    // thermolaminate, and offering it on a thermolaminate line would send
    // somebody looking for colours that are not there.
    //
    // No cost, no name, nothing identifying. Just the pairs the quote form needs
    // to ask "whose board is this?" before anything else.
    // Each pair carries the thicknesses that brand stocks it in, because the
    // brand is chosen BEFORE the thickness and the list below it has to be
    // theirs. Offering Laminex 21mm is the same wrong turn the order was
    // changed to prevent, one step later.
    const brandPairs = [];
    rows.forEach((row) => {
      const supplier = normaliseSupplierName(row.supplier_name);
      const material = String(row.material_type || "").trim();
      if (!supplier || !material) return;
      const thickness = String(row.thickness || "").trim();
      let pair = brandPairs.find((entry) => entry.supplier_name === supplier && entry.material_type === material);
      if (!pair) {
        pair = { supplier_name: supplier, material_type: material, thicknesses: [] };
        brandPairs.push(pair);
      }
      if (thickness && !pair.thicknesses.includes(thickness)) pair.thicknesses.push(thickness);
    });
    // Same order the material-wide list uses, so the two never disagree about
    // which thickness comes first.
    const materialOrder = buildColourAvailabilityFromLibraryRows(rows);
    brandPairs.forEach((pair) => {
      const order = materialOrder[normaliseColourMaterialKey(pair.material_type)] || [];
      pair.thicknesses.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });

    return NextResponse.json(
      {
        ok: true,
        availability: buildColourAvailabilityFromLibraryRows(rows),
        brandPairs,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const material = normaliseColourMaterialKey(searchParams.get("material"));
  const thickness = searchParams.get("thickness") || "";

  if (!material) {
    return NextResponse.json({ ok: true, colourFamily: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const colourFamily = await getDatabaseColourFamilyForSelection(supabase, { material, thickness });

  return NextResponse.json(
    {
      ok: true,
      source: "database",
      material,
      thickness,
      colourFamily: (admin ? colourFamily : withoutCosts(colourFamily)) || null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
