import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { buildCutListRows, buildMadeToOrderRows } from "../../../../../../lib/pcd-cabinet-pdf";
import { buildVariationContext } from "../../../../../../lib/pcd-cut-list-variations";
import { colourKey, loadOrderProductionData } from "../../../../../../lib/pcd-order-production-data";
import { applyPanelNumbers, ensurePanelNumbers } from "../../../../../../lib/pcd-order-panel-numbers";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
import { getDatabaseColourRows } from "../../../../../../lib/pcd-colour-library";
import {
  buildCuttingPlan,
  coloursFromLibraryRows,
  normalizeCuttingSettings,
  planSummary,
  storedCuttingSettings,
} from "../../../../../../lib/pcd-cutting-plan";
import { generateCuttingPlanPdf } from "../../../../../../lib/pcd-cutting-plan-pdf";

// THE CUTTING PLAN FOR ONE ORDER.
//
//   GET                  the settings this order uses and the boards they give
//   GET  ?format=pdf     the plan as a PDF, on the settings saved on the order
//   POST                 { settings, save } works the plan out on the settings
//                        sent, saves them when save is true, and returns the
//                        boards, or the PDF with ?format=pdf
//
// The PDF is built from exactly the settings on screen, not a re-read of what
// was saved, so a save that fails cannot quietly print a different plan.
//
// Panels and their numbers come from the production sheet's own loader and
// rows, so a number on the plan is the number on the sheet and on the label.

export const maxDuration = 30;

const SETTINGS_COLUMN = /cutting_plan_settings/i;

async function orderIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function cleanFilePart(value, fallback) {
  return String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

// An order line often has no brand or finish of its own. The library knows both
// by colour name, the same lookup the labels use.
function withSupplier(row, suppliers) {
  if (!row.boardSpec) return row;
  const found = suppliers?.[colourKey(row.boardSpec.colour)] || {};
  return {
    ...row,
    boardSpec: {
      ...row.boardSpec,
      supplier: row.boardSpec.supplier || found.supplier || "",
      finish: row.boardSpec.finish || found.finish || "",
    },
  };
}

async function loadInputs(supabase, orderId) {
  const data = await loadOrderProductionData(supabase, orderId);
  const context = buildVariationContext({ variations: data.variations, variationLines: data.variationLines });
  const cutRows = buildCutListRows(data.items, context);
  const { numbers } = await ensurePanelNumbers(supabase, orderId, [
    ...cutRows,
    ...buildMadeToOrderRows(data.items, context),
  ]);
  const rows = applyPanelNumbers(cutRows, numbers).map((row) => withSupplier(row, data.colourSuppliers));

  // Soft: a library that cannot be read means assumed board sizes, which the
  // plan says out loud, rather than no plan at all.
  let colours = [];
  try {
    colours = coloursFromLibraryRows(await getDatabaseColourRows(supabase, { activeOnly: false }));
  } catch (error) {
    console.error(`[cutting-plan] ${orderId}: could not read the colour library, board sizes are assumed: ${error?.message || error}`);
  }

  const businessDefaults = await getBusinessDefaults(supabase);

  let quoteSettings = null;
  if (data.order.quote_id) {
    const quote = await supabase.from("pcd_quotes").select("board_order_settings").eq("id", data.order.quote_id).maybeSingle();
    if (!quote.error) quoteSettings = quote.data?.board_order_settings || null;
  }

  return { order: data.order, rows, colours, businessDefaults, quoteSettings };
}

function pdfResponse(order, plan, extraHeaders = {}) {
  const buffer = generateCuttingPlanPdf({ order, plan });
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cutting-plan-${cleanFilePart(order.order_number, "order")}.pdf"`,
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function nothingToCut(plan) {
  return !plan.totals.boards
    ? Response.json({ ok: false, error: "Nothing on this order is cut in house, so there are no boards to plan." }, { status: 400 })
    : null;
}

export async function GET(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    const inputs = await loadInputs(context.supabase, orderId);
    const settings = normalizeCuttingSettings(inputs.order.cutting_plan_settings, {
      quoteSettings: inputs.quoteSettings,
      businessDefaults: inputs.businessDefaults,
    });
    const plan = buildCuttingPlan({ rows: inputs.rows, colours: inputs.colours, settings });

    if (new URL(request.url).searchParams.get("format") === "pdf") {
      return nothingToCut(plan) || pdfResponse(inputs.order, plan);
    }

    return Response.json({
      ok: true,
      settings: plan.settings,
      saved: Boolean(inputs.order.cutting_plan_settings),
      summary: planSummary(plan),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not work out the cutting plan." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    const body = await request.json().catch(() => ({}));
    const inputs = await loadInputs(context.supabase, orderId);
    const settings = normalizeCuttingSettings(body?.settings, {
      quoteSettings: inputs.quoteSettings,
      businessDefaults: inputs.businessDefaults,
    });
    const plan = buildCuttingPlan({ rows: inputs.rows, colours: inputs.colours, settings });

    let saved = false;
    let warning = "";
    if (body?.save) {
      const { error } = await context.supabase
        .from("pcd_orders")
        .update({ cutting_plan_settings: storedCuttingSettings(plan.settings) })
        .eq("id", orderId);
      if (!error) {
        saved = true;
      } else if (SETTINGS_COLUMN.test(error.message || "") || error.code === "42703" || error.code === "PGRST204") {
        warning = "The settings were used but not saved, because the database needs supabase/202609151600_pcd_order_cutting_plan_settings.sql run first.";
      } else {
        throw error;
      }
    }

    if (new URL(request.url).searchParams.get("format") === "pdf") {
      return nothingToCut(plan) || pdfResponse(inputs.order, plan, { "X-Settings-Saved": saved ? "yes" : "no" });
    }

    return Response.json({ ok: true, settings: plan.settings, saved, warning, summary: planSummary(plan) });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not work out the cutting plan." }, { status: 500 });
  }
}
