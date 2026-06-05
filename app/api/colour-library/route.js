import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getDatabaseColourFamilyForSelection, getDatabaseColourSuppliers, normaliseColourMaterialKey } from "../../../lib/pcd-colour-library";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let supabase;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    supabase = await createSupabaseServerClient();
  }

  if (searchParams.get("suppliers") === "1") {
    const suppliers = await getDatabaseColourSuppliers(supabase);
    return NextResponse.json({ ok: true, suppliers }, { headers: { "Cache-Control": "no-store" } });
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
      colourFamily: colourFamily || null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
