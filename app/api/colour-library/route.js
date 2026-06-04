import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getDatabaseColourFamily, normaliseColourMaterialKey } from "../../../lib/pcd-colour-library";
import { colourGroupsForMaterial } from "../../products/product-data";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const material = normaliseColourMaterialKey(searchParams.get("material"));

  if (!material) {
    return NextResponse.json({ ok: true, colourFamily: null });
  }

  const supabase = await createSupabaseServerClient();
  const databaseFamily = await getDatabaseColourFamily(supabase, material);
  const colourFamily = databaseFamily || colourGroupsForMaterial(material);

  return NextResponse.json({
    ok: true,
    source: databaseFamily ? "database" : "fallback",
    material,
    colourFamily,
  });
}
