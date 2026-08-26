import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { describeChanges, formatActivityValue, logOrderActivity } from "../../../../../../../lib/pcd-activity-log";
import { ORDER_LINE_STATUSES, ORDER_PRODUCTION_STAGES } from "../../../../../../../lib/pcd-quote-utils";

async function idsFromParams(params) {
  const resolved = await params;
  return { id: resolved?.id, itemId: resolved?.itemId };
}

function isThermolaminatedItem(item) {
  return [
    item?.material,
    item?.title,
    item?.product_type,
    item?.description,
    item?.profile_type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes("thermolaminate"));
}


// WHAT CHANGED INSIDE panel_planning, in the same words describeChanges uses.
//
// The order page writes the ordered date, the ETA and the per panel status
// into this blob rather than into the columns beside it. Whatever the merits
// of that, it is where the truth is, so it has to be described or the order
// history is missing the part of production a customer most wants to hear.
//
// The phrasing matches the column labels deliberately: lib/pcd-weekly-updates.js
// reads these descriptions back, and one wording means one parser.
//
// An item usually has one panel. Where it has several and they all moved the
// same way, that is one line rather than the same sentence five times.
const PLANNING_LABELS = {
  status: 'Status',
  production_stage: 'Production stage',
  supplier_ordered_at: 'Supplier ordered',
  supplier_eta: 'Supplier ETA',
  supplier_name: 'Supplier',
  supplier_order_ref: 'Supplier ref',
};

function describePlanningChanges(before, after) {
  if (!after || typeof after !== 'object') return [];
  const was = before && typeof before === 'object' ? before : {};
  const seen = new Set();

  Object.entries(after).forEach(([panelKey, panel]) => {
    if (!panel || typeof panel !== 'object') return;
    const previous = was[panelKey] && typeof was[panelKey] === 'object' ? was[panelKey] : {};
    Object.entries(PLANNING_LABELS).forEach(([field, label]) => {
      const from = formatActivityValue(previous[field], field);
      const to = formatActivityValue(panel[field], field);
      if (from === to) return;
      seen.add(`${label} changed from ${from} to ${to}`);
    });
  });

  return [...seen];
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id, itemId } = await idsFromParams(params);
    const payload = await request.json();
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!ORDER_LINE_STATUSES.includes(payload.status)) {
        return Response.json({ ok: false, error: "Invalid item status." }, { status: 400 });
      }
      updates.status = payload.status;
      updates.status_updated_at = new Date().toISOString();
    }

    if (Object.prototype.hasOwnProperty.call(payload, "production_stage")) {
      if (!ORDER_PRODUCTION_STAGES.includes(payload.production_stage)) {
        return Response.json({ ok: false, error: "Invalid production stage." }, { status: 400 });
      }
      updates.production_stage = payload.production_stage;
    }

    // Planning only. Everything here is about how a piece gets made, not what
    // it is. `thickness` used to sit in this list, which meant the one field
    // that changes what the workshop cuts could be altered from the order page
    // with no variation, no price and no trail, leaving the production list
    // describing a different job to the quote it came from. Spec changes go
    // through a variation. See lib/pcd-quote-lock.js for the same rule on the
    // quote side.
    [
      "fulfilment_method",
      "supplier_name",
      "supplier_order_ref",
      "supplier_ordered_at",
      "supplier_eta",
      "board_required",
      "board_ordered",
      "board_available",
      "panel_planning",
      "notes",
      "production_notes",
    ].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates[field] = payload[field] === "" ? null : payload[field];
      }
    });

    // null is a legitimate value: it means nobody has decided yet, which is
    // what an order starts as and what the planning metric counts.
    if (
      updates.fulfilment_method !== null &&
      updates.fulfilment_method !== undefined &&
      !["in_house", "supplier_ready_made"].includes(updates.fulfilment_method)
    ) {
      return Response.json({ ok: false, error: "Invalid fulfilment method." }, { status: 400 });
    }

    if (!Object.keys(updates).length) {
      return Response.json({ ok: false, error: "No item updates supplied." }, { status: 400 });
    }

    const { data: beforeItem } = await context.supabase
      .from("pcd_order_line_items")
      .select("*, pcd_orders(quote_id)")
      .eq("id", itemId)
      .eq("order_id", id)
      .maybeSingle();

    if (!beforeItem) {
      return Response.json({ ok: false, error: "Order item not found." }, { status: 404 });
    }

    if (isThermolaminatedItem(beforeItem)) {
      updates.fulfilment_method = "supplier_ready_made";
      if (updates.panel_planning && typeof updates.panel_planning === "object" && !Array.isArray(updates.panel_planning)) {
        updates.panel_planning = Object.fromEntries(
          Object.entries(updates.panel_planning).map(([key, value]) => [
            key,
            {
              ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}),
              fulfilment_method: "supplier_ready_made",
            },
          ])
        );
      }
      if (updates.production_stage) {
        delete updates.production_stage;
      }
    }

    const { data, error } = await context.supabase
      .from("pcd_order_line_items")
      .update(updates)
      .eq("id", itemId)
      .eq("order_id", id)
      .select("*")
      .maybeSingle();

    if (error || !data) throw error || new Error("Order item not found.");

    // status_updated_at is a stamp this route sets ITSELF whenever status
    // changes, so logging it produced a second line saying a timestamp moved
    // next to the line saying what actually happened. Noise in the order
    // history, and it would have reached customers through the weekly update
    // report, which reads this log. Dropped from the description only: the
    // column is still written above.
    const { status_updated_at: _stamp, panel_planning: nextPlanning, ...described } = updates;

    const changes = describeChanges(beforeItem || {}, described, {
      status: "Status",
      production_stage: "Production stage",
      fulfilment_method: "Fulfilment",
      supplier_name: "Supplier",
      supplier_order_ref: "Supplier ref",
      supplier_ordered_at: "Supplier ordered",
      supplier_eta: "Supplier ETA",
      board_required: "Board required",
      board_ordered: "Board ordered",
      board_available: "Board available",
      production_notes: "Production notes",
    });

    // AND THE PLANNING BLOB, which is where the order page actually writes the
    // ordered date, the ETA and the per panel status.
    //
    // describeChanges could not see any of it. It compares values with
    // String(value), and String(anObject) is "[object Object]" on both sides, so
    // every planning change compared EQUAL and was silently never logged. Ten
    // doors were marked ordered with a date and an ETA and the order history
    // recorded nothing at all, which meant the weekly update report had nothing
    // to tell the customer either.
    changes.push(...describePlanningChanges(beforeItem?.panel_planning, nextPlanning));

    if (changes.length) {
      await logOrderActivity(context.supabase, {
        order_id: id,
        quote_id: beforeItem?.pcd_orders?.quote_id || null,
        actor_type: "admin",
        action_type: "order_item_updated",
        title: `Order item updated: ${data.title || data.product_type || "Cabinetry item"}`,
        description: changes.join("; "),
        metadata: {
          item_id: itemId,
          changes,
        },
      });
    }

    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update order item." }, { status: 500 });
  }
}
