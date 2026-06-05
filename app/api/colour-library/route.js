import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getDatabaseColourFamilyForSelection, getDatabaseColourSuppliers, normaliseColourMaterialKey } from "../../../lib/pcd-colour-library";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const supabase = await createSupabaseServerClient();

  if (searchParams.get("suppliers") === "1") {
    const suppliers = await getDatabaseColourSuppliers(supabase);
    return NextResponse.json({ ok: true, suppliers });
  }

  const material = normaliseColourMaterialKey(searchParams.get("material"));
  const thickness = searchParams.get("thickness") || "";

  if (!material) {
    return NextResponse.json({ ok: true, colourFamily: null });
  }

  const colourFamily = await getDatabaseColourFamilyForSelection(supabase, { material, thickness });

  return NextResponse.json({
    ok: true,
    source: "database",
    material,
    thickness,
    colourFamily: colourFamily || null,
  });
}
