// WHAT A BOARD COSTS PER m², ASKED FOR ONE CABINET.
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
//
// This was a second, weaker copy of the board matching that already lives in
// lib/pcd-board-cost.js, and the three ways it differed were all silent.
//
//   1. Asked without a colour it did not say "no colour". It pulled the first
//      fifty rows of that material and answered with row one, so a cabinet
//      with no colour on it was costed from whichever colour happened to sort
//      first. No warning, and the number looked exactly like a real answer.
//
//   2. It reported `found` as "the cost is zero or more". A blank cost reads
//      as zero, so an unpriced colour came back found at $0. Most of the
//      library has no cost against it, so this was the normal case rather than
//      the edge case: the prompt to enter a price never appeared and the
//      cabinet quietly cost nothing.
//
//   3. Saving a price back wrote it to EVERY row it had matched. Without a
//      colour that was up to fifty colours overwritten, from a button that
//      reads as saving one price.
//
// ── WHAT IT DOES NOW ────────────────────────────────────────────────────────
//
// Both verbs go through resolveBoardCost, the same matcher the reprice, the
// request conversion and the design import use, so there is one answer to what
// a board costs and one answer to why we cannot say. That matcher already
// knows the difference between a colour we have not priced and a colour that
// is made to order and never will be.
//
// A save now needs a single row to write to, and refuses without one.
import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { resolveBoardCost } from "../../../../../lib/pcd-board-cost";

function normalizeMaterial(value) {
  return decodeURIComponent(String(value || "")).trim();
}

function normalizeCost(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function specFromRequest(request, materialName) {
  const { searchParams } = new URL(request.url);
  return {
    colourLibraryId: searchParams.get("colour_library_id") || null,
    material: materialName,
    thickness: searchParams.get("thickness") || "",
    finish: searchParams.get("finish") || "",
    colour: searchParams.get("colour") || "",
    supplier: searchParams.get("supplier") || "",
  };
}

// The shape the configurator reads. A match carries a rate; a miss carries the
// row it landed on when there was one, so "save a price against this colour"
// knows which colour it means.
function costFromMatch(match, materialName) {
  if (!match?.ok) {
    return match?.id
      ? {
          id: match.id,
          material_name: materialName,
          colour_name: match.label || "",
          cost_per_sqm_ex_gst: null,
          source: "colour_library",
        }
      : null;
  }
  return {
    id: match.id,
    material_name: materialName,
    colour_name: match.colour,
    material_type: match.material,
    thickness: match.thickness,
    finish: match.finish,
    supplier_name: match.supplier,
    label: match.label,
    cost_per_sqm_ex_gst: match.costPerSqmExGst,
    source: "colour_library",
  };
}

// The flat per-material rate, from before prices were held per colour. Only
// consulted when the library could not be asked at all, and it says where it
// came from so nothing reads it as a colour's own price.
async function materialRateFallback(supabase, materialName) {
  const { data, error } = await supabase
    .from("pcd_board_material_costs")
    .select("*")
    .eq("material_name", materialName)
    .maybeSingle();
  if (error) throw error;
  if (!data || normalizeCost(data.cost_per_sqm_ex_gst) === null) return null;
  return { ...data, material_name: materialName, source: "material_rate" };
}

const FALL_BACK_TO_MATERIAL_RATE = new Set(["no_colour", "no_thickness", "not_found"]);

export async function GET(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { material } = await Promise.resolve(params);
    const materialName = normalizeMaterial(material);

    if (!materialName) {
      return Response.json({ ok: false, error: "Material name is required." }, { status: 400 });
    }

    const match = await resolveBoardCost(context.supabase, specFromRequest(request, materialName));

    if (match.ok) {
      return Response.json({
        ok: true,
        material: materialName,
        found: true,
        cost: costFromMatch(match, materialName),
        source: "colour_library",
      });
    }

    if (FALL_BACK_TO_MATERIAL_RATE.has(match.reason)) {
      const fallback = await materialRateFallback(context.supabase, materialName);
      if (fallback) {
        return Response.json({
          ok: true,
          material: materialName,
          found: true,
          cost: fallback,
          source: "material_rate",
          // Still said, because a rate for the whole material is not the same
          // answer as a rate for this colour, and the screen should say so.
          reason: match.reason,
          message: match.message,
        });
      }
    }

    return Response.json({
      ok: true,
      material: materialName,
      found: false,
      cost: costFromMatch(match, materialName),
      reason: match.reason,
      message: match.message,
      // Made to order is not a missing price. Flagged on its own so the screen
      // can say it is quoted by the supplier per job, rather than asking
      // somebody to enter a rate that will never exist.
      madeToOrder: match.reason === "made_to_order",
      source: "colour_library",
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
    const payload = await request.json();
    const costPerSqm = normalizeCost(payload.cost_per_sqm_ex_gst ?? payload.costPerSqmExGst ?? payload.cost);

    if (!materialName) {
      return Response.json({ ok: false, error: "Material name is required." }, { status: 400 });
    }

    if (costPerSqm === null) {
      return Response.json({ ok: false, error: "Cost per sqm must be zero or greater." }, { status: 400 });
    }

    // ONE ROW, OR NONE. A price is saved against a colour, and without a colour
    // there is no row this price belongs to. Refusing is the whole point: the
    // old code read "no colour" as "all of them".
    const match = await resolveBoardCost(context.supabase, specFromRequest(request, materialName));
    const rowId = match.id || null;

    if (!rowId) {
      return Response.json(
        {
          ok: false,
          error:
            match.reason === "ambiguous"
              ? "More than one colour matches. Pick the supplier as well before saving a price."
              : "Pick the finish and colour before saving a price, so it is saved against that colour rather than the whole material.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await context.supabase
      .from("pcd_colour_library")
      .update({ cost_per_sqm_ex_gst: costPerSqm })
      .eq("id", rowId)
      .select("id,name,material_type,thickness,finish_type,supplier_name,cost_per_sqm_ex_gst")
      .single();

    if (error) throw error;

    return Response.json({
      ok: true,
      material: materialName,
      found: true,
      cost: {
        id: data.id,
        material_name: materialName,
        colour_name: data.name,
        material_type: data.material_type,
        thickness: data.thickness,
        finish: data.finish_type,
        supplier_name: data.supplier_name,
        cost_per_sqm_ex_gst: data.cost_per_sqm_ex_gst,
        source: "colour_library",
      },
      source: "colour_library",
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save board material cost." },
      { status: 500 }
    );
  }
}
