import { requireAdminApiContext } from "../../../../../lib/admin-api";

function normalizeMaterial(value) {
  return decodeURIComponent(String(value || "")).trim();
}

function normalizeCost(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeThickness(value) {
  return normalizeKey(value).replace(/mm$/, "");
}

async function colourLibraryMatches(supabase, { materialName, colourName, thickness }) {
  let query = supabase
    .from("pcd_colour_library")
    .select("id,name,material_type,thickness,cost_per_sqm_ex_gst")
    .ilike("material_type", materialName)
    .order("sort_order", { ascending: true })
    .limit(50);

  if (colourName) query = query.ilike("name", colourName);

  const { data, error } = await query;
  if (error) throw error;

  const thicknessKey = normalizeThickness(thickness);
  if (!thicknessKey) return data || [];

  return (data || []).filter((row) => {
    const rowThickness = normalizeThickness(row.thickness);
    return !rowThickness || rowThickness === thicknessKey;
  });
}

function colourLibraryCost(row, materialName) {
  if (!row) return null;
  return {
    id: row.id,
    material_name: materialName,
    colour_name: row.name,
    material_type: row.material_type,
    thickness: row.thickness,
    cost_per_sqm_ex_gst: row.cost_per_sqm_ex_gst,
    source: "colour_library",
  };
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { material } = await Promise.resolve(params);
    const materialName = normalizeMaterial(material);
    const { searchParams } = new URL(_request.url);
    const colourName = searchParams.get("colour") || "";
    const thickness = searchParams.get("thickness") || "";

    if (!materialName) {
      return Response.json({ ok: false, error: "Material name is required." }, { status: 400 });
    }

    const colourMatches = await colourLibraryMatches(context.supabase, { materialName, colourName, thickness });
    if (colourMatches.length) {
      const cost = colourLibraryCost(colourMatches[0], materialName);
      return Response.json({
        ok: true,
        material: materialName,
        cost,
        found: Boolean(Number(cost.cost_per_sqm_ex_gst) >= 0),
        source: "colour_library",
      });
    }

    const { data, error } = await context.supabase
      .from("pcd_board_material_costs")
      .select("*")
      .eq("material_name", materialName)
      .maybeSingle();

    if (error) throw error;

    return Response.json({
      ok: true,
      material: materialName,
      cost: data || null,
      found: Boolean(data),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load board material cost." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { material } = await Promise.resolve(params);
    const materialName = normalizeMaterial(material);
    const { searchParams } = new URL(request.url);
    const colourName = searchParams.get("colour") || "";
    const thickness = searchParams.get("thickness") || "";
    const payload = await request.json();
    const costPerSqm = normalizeCost(payload.cost_per_sqm_ex_gst ?? payload.costPerSqmExGst ?? payload.cost);

    if (!materialName) {
      return Response.json({ ok: false, error: "Material name is required." }, { status: 400 });
    }

    if (costPerSqm === null) {
      return Response.json({ ok: false, error: "Cost per sqm must be zero or greater." }, { status: 400 });
    }

    const colourMatches = await colourLibraryMatches(context.supabase, { materialName, colourName, thickness });
    if (colourMatches.length) {
      const { data, error } = await context.supabase
        .from("pcd_colour_library")
        .update({ cost_per_sqm_ex_gst: costPerSqm })
        .in("id", colourMatches.map((row) => row.id))
        .select("id,name,material_type,thickness,cost_per_sqm_ex_gst")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return Response.json({
        ok: true,
        material: materialName,
        cost: colourLibraryCost(data?.[0], materialName),
        source: "colour_library",
      });
    }

    const { data, error } = await context.supabase
      .from("pcd_board_material_costs")
      .upsert(
        {
          material_name: materialName,
          cost_per_sqm_ex_gst: costPerSqm,
        },
        { onConflict: "material_name" }
      )
      .select("*")
      .single();

    if (error) throw error;

    return Response.json({ ok: true, material: materialName, cost: data });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save board material cost." },
      { status: 500 }
    );
  }
}
