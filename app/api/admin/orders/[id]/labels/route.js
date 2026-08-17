// Workshop labels for an order, one per physical piece.
//
// Built from the cut list rows, not from the order lines, so the number on a
// label is the row number on the printed sheet. The bench works down the sheet
// and matches each piece to its line.
//
// ?format=pdf   (default) 62mm wide pages, one label per page, prints straight
//               to the Brother QL with the driver set to 62mm continuous.
// ?format=csv   one row per label, for P-touch Editor's database merge.
// ?format=json  what the drawing code was handed, per label, for when a printed
//               label does not say what the order says. Opening it in a browser
//               answers "is this the data or the drawing" without guessing from
//               a photograph of a label.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { loadOrderProductionData } from "../../../../../../lib/pcd-order-production-data";
import { applyPanelNumbers, ensurePanelNumbers } from "../../../../../../lib/pcd-order-panel-numbers";
import { buildVariationContext } from "../../../../../../lib/pcd-cut-list-variations";
import { buildCutListRows, buildMadeToOrderRows, buildProposedRows } from "../../../../../../lib/pcd-cabinet-pdf";
import { buildCutListLabels, labelsToCsv } from "../../../../../../lib/pcd-order-labels";
import { generateOrderLabelsPdf, LABEL_LAYOUT_VERSION } from "../../../../../../lib/pcd-order-label-pdf";
import { DEFAULT_LABEL_STOCK } from "../../../../../../lib/pcd-label-stocks";

// The label layout owns its own version; the route just reports it.
const BUILD_MARKER = LABEL_LAYOUT_VERSION;

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

// Every download of the same order otherwise lands on the same filename, so the
// browser keeps the first one and saves the rest as "(1)", "(2)". Opening the
// original then shows a set of labels generated before the last change, which
// looks exactly like a change that did not take effect. Stamping the minute
// makes each download its own file, and says which one you are looking at.
function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(now.getDate())}${pad(now.getMonth() + 1)}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export async function GET(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    // Not `params` — that name is the route's own params, and redeclaring it
    // here puts the line above in the temporal dead zone.
    const query = new URL(request.url).searchParams;
    const requested = query.get("format");
    const format = requested === "csv" || requested === "json" ? requested : "pdf";
    const stock = query.get("stock") || DEFAULT_LABEL_STOCK;

    const { order, items, quoteLines, variations, variationLines, colourSuppliers } =
      await loadOrderProductionData(context.supabase, orderId);

    const variationContext = buildVariationContext({ variations, variationLines });
    const cutRows = buildCutListRows(items, variationContext);
    const madeToOrderRows = buildMadeToOrderRows(items, variationContext);
    const proposedRows = buildProposedRows(variationContext);

    // Same call, same order, as the production sheet makes: a panel gets one
    // number the first time either document is generated, and keeps it.
    const { numbers } = await ensurePanelNumbers(
      context.supabase,
      orderId,
      [...cutRows, ...madeToOrderRows, ...proposedRows]
    );

    const labels = buildCutListLabels({
      order,
      cutRows: applyPanelNumbers(cutRows, numbers),
      madeToOrderRows: applyPanelNumbers(madeToOrderRows, numbers),
      proposedRows: applyPanelNumbers(proposedRows, numbers),
      items,
      quoteLines,
      variationContext,
      colourSuppliers,
    });

    if (!labels.length) {
      return Response.json({ ok: false, error: "No items on this order to label." }, { status: 400 });
    }

    const filename = `labels-${cleanFilePart(order.order_number, "order")}-${stamp()}`;

    if (format === "json") {
      return Response.json({
        ok: true,
        buildMarker: BUILD_MARKER,
        order: order.order_number,
        colourSuppliers,
        labels: labels.map((label) => ({
          badge: label.badge,
          section: label.section,
          size: label.size,
          materialAbove: label.materialAbove,
          colourHeadline: label.colourHeadline,
          materialBelow: label.materialBelow,
          edge: label.edge,
          profile: label.profile,
          drill: label.drill,
          hinges: label.hinges,
          madeToOrder: label.madeToOrder,
          band: label.band,
          counter: label.counter,
        })),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (format === "csv") {
      return new Response(labelsToCsv(labels), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(generateOrderLabelsPdf({ labels, stock }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Logged as well as returned: the browser only ever shows "500", so without
    // this the actual reason never reaches anyone.
    console.error("[order labels]", error);
    return Response.json(
      { ok: false, error: error?.message || "Could not generate the labels." },
      { status: 500 }
    );
  }
}
