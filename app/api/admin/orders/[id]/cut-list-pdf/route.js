import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { buildCutListRows, buildMadeToOrderRows, generateOrderCutListPdf } from "../../../../../../lib/pcd-cabinet-pdf";
import { buildVariationContext } from "../../../../../../lib/pcd-cut-list-variations";
import { loadOrderProductionData } from "../../../../../../lib/pcd-order-production-data";
import { ensurePanelNumbers } from "../../../../../../lib/pcd-order-panel-numbers";
import { loadOrderReference, loadReferenceLibraries } from "../../../../../../lib/pcd-order-reference-images";

// The sheet now fetches the colour and profile pictures for its reference page.
// Each one is capped at six seconds and they go six at a time, so the worst
// realistic case is a few seconds rather than the default ten second budget.
// A fetch that times out costs one tile, never the sheet. See
// lib/pcd-order-reference-images.js.
export const maxDuration = 30;

async function orderIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function cleanFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    // The same loader and the same numbering the labels use, so a label's
    // number is always the panel number on this sheet.
    const { order, items, quoteLines, variations, variationLines } = await loadOrderProductionData(context.supabase, orderId);
    const variationContext = buildVariationContext({ variations, variationLines });
    const { numbers } = await ensurePanelNumbers(context.supabase, orderId, [
      ...buildCutListRows(items, variationContext),
      ...buildMadeToOrderRows(items, variationContext),
    ]);

    // Problems already reported against this order. Open ones only: a resolved
    // issue is history and belongs on the screen, not on a sheet somebody is
    // working from today.
    //
    // Read soft on purpose. An issue table that cannot be read must not stop a
    // production sheet printing, because the sheet is what the workshop needs to
    // start. A print with no issues section is worse than no print at all only
    // if nobody says so, which is why it is logged rather than swallowed.
    let issues = [];
    const issuesResult = await context.supabase
      .from("pcd_order_issues")
      .select("*")
      .eq("order_id", orderId)
      .is("resolved_at", null)
      .order("raised_at", { ascending: true });
    if (issuesResult.error) {
      console.error(
        "[cut-list-pdf] could not read pcd_order_issues for " + orderId + ", so this sheet printed without the " +
          "open issues section: " + issuesResult.error.message
      );
    } else {
      issues = issuesResult.data || [];
    }

    // The colours and profiles this order uses, with their pictures, for the
    // reference page. Read soft for the same reason the issues above are: a
    // library that cannot be read, or a bucket having a bad minute, costs that
    // page and never the sheet the workshop is waiting on.
    let reference = null;
    try {
      const libraries = await loadReferenceLibraries(context.supabase);
      reference = await loadOrderReference(items, libraries);
    } catch (referenceError) {
      console.error(
        "[cut-list-pdf] could not build the colour and profile reference for " + orderId +
          ", so this sheet printed without it: " + (referenceError?.message || referenceError)
      );
    }

    // Said out loud, because the failure this replaces was a silent one: the
    // sheet printed perfectly with a dash in the supplier column and a page of
    // boxes saying no picture, and looked exactly like a sheet that had worked.
    if (reference) {
      const missing = reference.sections
        .flatMap((section) => section.entries)
        .filter((entry) => !reference.images[entry.key]);
      if (missing.length) {
        console.warn(
          "[cut-list-pdf] " + orderId + ": no picture for " +
            missing.map((entry) => entry.kind + " " + entry.name).join(", ")
        );
      }
    }

    const pdfBuffer = generateOrderCutListPdf({
      order,
      items,
      quoteLines,
      variations,
      variationLines,
      panelNumbers: numbers,
      issues,
      reference,
    });
    const orderNumber = cleanFilePart(order.order_number, "order");
    const fileName = `production-sheet-${orderNumber}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not generate cut list PDF." },
      { status: 500 }
    );
  }
}
