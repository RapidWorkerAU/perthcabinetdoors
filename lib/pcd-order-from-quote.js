import { randomBytes } from "node:crypto";
import { PENDING_DEPOSIT } from "./pcd-order-deposit";
import { logOrderActivity } from "./pcd-activity-log";
import {
  isMissingOrderCostColumnError,
  orderCostColumnsFromQuote,
  withoutOrderCostColumns,
} from "./pcd-order-costs";
import { unconfiguredCabinets } from "./pcd-quote-lock";

function makeOrderNumber() {
  return `PCD-O-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

// The five columns 202608211200 adds, so the order can stop guessing the board
// brand and the drilling. Until that migration is run they do not exist.
//
// ── WHY THIS IS HERE AND NOT JUST A REQUIREMENT ──────────────────────────────
// This runs at the moment a customer accepts a quote. If the insert fails, the
// accepted quote does not become an order at all: the customer has approved the
// work, we have taken the approval, and there is nothing on our side to make.
// That is the worst failure this system has, and deploying code before running
// a migration must not be able to cause it.
//
// So a missing column costs us the brand and the drilling on that order, which
// is the position we were in last week anyway, and the order still gets raised.
// It is said out loud rather than swallowed, because those lines then need the
// backfill run over them.
// EXPORTED, because applying a variation writes the same columns onto the same
// table and had no guard at all. Accepting a quote survived a database missing
// one of these; approving a variation threw, left the variation saying
// "approved" and the order on its old figures, and nobody was told. One list,
// so the two paths cannot disagree about which columns might not be there.
export const CARRIED_SPEC_COLUMNS = [
  "supplier_name",
  // Only the variation path writes this one, and only after its migration has
  // run. Listed here so a database without it drops the column and still gets
  // the line, rather than losing the whole variation over a note about where
  // the line came from.
  "variation_line_id",
  "hinge_holes",
  "hinge_qty",
  // Added by 202608251400_pcd_cabinet_and_hinge_fields.sql. Listed here so a
  // database that has not run it yet drops these five and still raises the
  // order. The customer has already accepted by this point, and losing the
  // order they just agreed to is far worse than losing a hinge measurement.
  "cabinet_brand",
  "hinge_side",
  "hinge_from_bottom_mm",
  "hinge_from_top_mm",
  "hinge_middles_mm",
  "unit_cost_source_id",
  "unit_cost_source_label",
  "design_item_id",
  // Added later than the rest, so a database that has not run
  // 202608241800_pcd_order_line_notes_from_quote.sql drops the column and still
  // raises the order. A customer has already accepted by this point: losing a
  // note is bad, losing the order they just agreed to is far worse.
  "client_note",
];

// PostgREST reports an unknown column as PGRST204 naming the column. Same
// pattern as the quote line saver's supplier_name guard.
export function isMissingCarriedSpecColumn(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" && CARRIED_SPEC_COLUMNS.some((column) => message.includes(column));
}

/**
 * Is this a database refusing a null on a column that says NOT NULL?
 *
 * pcd_order_line_items.fulfilment_method is "not null default 'in_house'", and
 * both paths write an explicit null into it on purpose: a line nobody has
 * planned yet has to read as unplanned, or the board stops asking for the one
 * decision that holds a job up. A DEFAULT only applies to a column left OUT
 * though, and naming it and passing null is not leaving it out.
 *
 * 202608241800 drops that NOT NULL. Until it has been run, this lets the line
 * through with the column omitted, so the work lands as in_house rather than
 * the customer's agreed variation not landing at all. It is logged, because
 * those lines then need somebody to say who is making them.
 */
export function isNotNullViolation(error, column) {
  const message = String(error?.message || "");
  return (error?.code === "23502" || message.includes("not-null")) && message.includes(column);
}

export function withoutColumns(row, columns) {
  const rest = { ...row };
  columns.forEach((column) => delete rest[column]);
  return rest;
}

export function withoutCarriedSpecColumns(row) {
  const rest = { ...row };
  CARRIED_SPEC_COLUMNS.forEach((column) => delete rest[column]);
  return rest;
}

function isThermolaminatedLine(line) {
  return [
    line?.material,
    line?.product_name,
    line?.product_type,
    line?.description,
    line?.profile_type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes("thermolaminate"));
}

export async function createOrderFromQuote(supabase, quote, { actorType = "customer", markAcceptedAt = true } = {}) {
  // ONE LIVE ORDER PER QUOTE, and a cancelled one is not a live one.
  //
  // This used to match any order at all, which made a cancelled order block its
  // quote forever: accept it again and this handed back the cancelled shell
  // rather than making a new order. Nothing then promoted it, because a deposit
  // only ever promotes a pending_deposit order, so the customer paid and ended
  // up owning a cancelled job.
  //
  // That is not hypothetical. Clearing an abandoned deposit means cancelling
  // the order it left behind, and the whole point is that the customer can then
  // come back and pay.
  const { data: existingOrders } = await supabase
    .from("pcd_orders")
    .select("id, status")
    .eq("quote_id", quote.id);

  const live = (existingOrders || []).find((order) => order.status !== "cancelled");
  if (live?.id) return live.id;

  const now = new Date().toISOString();
  const orderRow = {
      quote_id: quote.id,
      customer_id: quote.customer_id,
      order_number: makeOrderNumber(),
      name: quote.project_name || quote.title || quote.quote_number,
      customer_name: quote.customer_name,
      customer_email: quote.customer_email,
      customer_phone: quote.customer_phone,
      site_address: quote.site_address,
      // The parts as well as the one-liner. Planning a delivery run means
      // "everything in these suburbs this week", which a free text address
      // cannot answer. Captured at acceptance, so from here they are always set.
      site_street: quote.site_street ?? null,
      site_suburb: quote.site_suburb ?? null,
      site_postcode: quote.site_postcode ?? null,
      // An order that still owes a deposit is not confirmed work. It exists so
      // it can be found, chased and cancelled, but it must not sit in the
      // orders list looking like a job somebody has paid for.
      status: markAcceptedAt ? "active" : PENDING_DEPOSIT,
      accepted_at: markAcceptedAt ? now : null,
      admin_viewed_at: null,
      deposit_required: false,
      subtotal_ex_gst: quote.subtotal_ex_gst,
      gst_amount: quote.gst_amount,
      total_inc_gst: quote.total_inc_gst,
      // The job costs, not just the three roll-ups. An order used to keep only
      // the totals, so labour, travel, delivery, consumables, painting, glass
      // and removal were baked into a number and then unreachable. A variation
      // that revises one of them has to be able to say what it is now, and this
      // is where "now" comes from. Kept current by applyAcceptedVariation.
      ...orderCostColumnsFromQuote(quote),
  };

  // An order must still be created on a database that has not had the job cost
  // migration run yet — a customer accepting a quote cannot be made to wait on
  // a migration. Without the columns the order simply has no breakdown, and a
  // variation on it starts its costs from zero.
  let { data: order, error: orderError } = await supabase.from("pcd_orders").insert(orderRow).select("*").single();
  if (orderError && isMissingOrderCostColumnError(orderError)) {
    ({ data: order, error: orderError } = await supabase
      .from("pcd_orders")
      .insert(withoutOrderCostColumns(orderRow))
      .select("*")
      .single());
  }

  if (orderError) throw orderError;

  const { data: quoteRequest } = await supabase
    .from("pcd_quote_requests")
    .select("id")
    .eq("converted_quote_id", quote.id)
    .maybeSingle();

  const { data: lines, error: linesError } = await supabase
    .from("pcd_quote_line_items")
    .select("*")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true });
  if (linesError) throw linesError;

  // The cabinet panel list is snapshotted onto the order, not read back from
  // the quote later. The config belongs to the quote, and a quote edit could
  // otherwise change or delete the panels on an order already in the workshop.
  const cabinetLineIds = (lines || [])
    .filter((line) => line.product_type === "base_cabinet")
    .map((line) => line.id);
  const configsByLineId = new Map();
  if (cabinetLineIds.length) {
    const { data: configs, error: configsError } = await supabase
      .from("pcd_cabinet_configs")
      .select("*")
      .in("line_item_id", cabinetLineIds);
    if (configsError) throw configsError;
    (configs || []).forEach((config) => configsByLineId.set(config.line_item_id, config));
  }

  // Last chance to catch a cabinet nobody configured. After this the quote is
  // locked, so the only way to add its panels would be a variation, and the
  // workshop would meanwhile get a sheet with no panels to cut.
  const unconfigured = unconfiguredCabinets(lines || [], configsByLineId);
  if (unconfigured.length) {
    throw new Error(
      `This quote has ${unconfigured.length} cabinet${unconfigured.length === 1 ? "" : "s"} with no cut list, so the workshop would get no panels to cut: ${unconfigured.join(", ")}. Open each one in the quote's cabinet form and save it, then accept the quote.`
    );
  }

  if (lines?.length) {
    const orderLines = lines.map((line, index) => ({
      order_id: order.id,
      quote_line_item_id: line.id,
      sort_order: index,
      title: line.product_name || "Cabinetry item",
      description: line.description,
      product_type: line.product_type,
      material: line.material,
      thickness: line.thickness,
      profile_type: line.profile_type,
      finish: line.finish,
      colour: line.colour,
      profile: line.profile,
      edge_mould: line.edge_mould,
      width_mm: line.width_mm,
      height_mm: line.height_mm,
      qty: line.qty,
      // The brand of board. The quote knows it exactly, and without it the
      // order page and the workshop label had to guess it back from the colour
      // NAME: twelve attempts, first hit wins. Two suppliers stocking the same
      // colour name is normal, so the label could name the wrong brand and
      // nothing said so.
      supplier_name: line.supplier_name,
      // Whether to drill, and how many. These used to live only on the quote
      // line, read back through quote_line_item_id, so a line a variation added
      // could never answer the question. A door that needed drilling and did
      // not get it is scrap.
      hinge_holes: line.hinge_holes,
      hinge_qty: line.hinge_qty,
      // Which cabinet the front goes on, and where the cups go. The workshop
      // reads all five off the order. Until now the last four could only be
      // said in a note, which somebody had to read and act on, and a note that
      // has to be acted on is a note that eventually is not.
      cabinet_brand: line.cabinet_brand,
      hinge_side: line.hinge_side,
      hinge_from_bottom_mm: line.hinge_from_bottom_mm,
      hinge_from_top_mm: line.hinge_from_top_mm,
      hinge_middles_mm: line.hinge_middles_mm,
      // Which colour library row priced this line, so a reprice has something
      // to match on other than five loose strings.
      unit_cost_source_id: line.unit_cost_source_id,
      unit_cost_source_label: line.unit_cost_source_label,
      // Which cabinet this piece belongs to. The production sheet groups a
      // cabinet with its own doors and panels using this, and it used to be
      // read back through the quote line, which a variation-added line has no
      // way to do.
      design_item_id: line.design_item_id,
      line_total_ex_gst: line.line_total_ex_gst,
      // Left unset on purpose. Defaulting to in house meant an order nobody
      // had looked at was indistinguishable from one somebody had planned, so
      // "orders missing their planning detail" could not be counted at all.
      // Thermolaminate is the exception: it can only ever be supplier made.
      fulfilment_method: isThermolaminatedLine(line) ? "supplier_ready_made" : null,
      status: "Not Ordered",
      notes: line.notes,
      // What the customer was TOLD about this line. It used to stay behind on
      // the quote, so a decision agreed on the phone and written in the only
      // box the customer ever sees reached the workshop nowhere: not on the
      // order, not on either production view, not on the printed sheet.
      client_note: line.client_note,
      cabinet_config_snapshot: configsByLineId.get(line.id) || null,
    }));
    const { error: insertLinesError } = await supabase.from("pcd_order_line_items").insert(orderLines);
    // A customer has already accepted at this point. Losing the brand and the
    // drilling on this order is bad; failing to raise the order at all, after
    // they approved it, is far worse. See CARRIED_SPEC_COLUMNS above.
    if (insertLinesError) {
      // fulfilment_method is "not null default 'in_house'" and this writes an
      // explicit null into it, which a DEFAULT does not cover: a default only
      // applies to a column left OUT. Until 202608241800 has been run over this
      // database, the lines land as in house rather than the order the customer
      // has already accepted not being raised at all.
      if (isNotNullViolation(insertLinesError, "fulfilment_method")) {
        const { error: planlessError } = await supabase
          .from("pcd_order_line_items")
          .insert(orderLines.map((row) => withoutColumns(row, ["fulfilment_method"])));
        if (planlessError) throw planlessError;
        console.error(
          `[order-from-quote] ${order.order_number}: fulfilment_method will not take a null. ` +
            "Every line landed as in_house, so none of them are counted as work nobody has planned. " +
            "Run supabase/202608241800_pcd_order_line_required_columns.sql."
        );
        return;
      }
      if (!isMissingCarriedSpecColumn(insertLinesError)) throw insertLinesError;
      const { error: retryError } = await supabase
        .from("pcd_order_line_items")
        .insert(orderLines.map(withoutCarriedSpecColumns));
      if (retryError) throw retryError;
      console.error(
        `[order-from-quote] ${order.order_number}: pcd_order_line_items is missing ${CARRIED_SPEC_COLUMNS.join(", ")}. ` +
          "The order was raised without them, so its board brand is guessed from the colour name and its " +
          "drilling prints as Not recorded. Run supabase/202608211200_pcd_order_line_carry_spec.sql, which " +
          "backfills this order along with the rest."
      );
    }
  }

  await supabase.from("pcd_quotes").update({ order_id: order.id }).eq("id", quote.id);

  await logOrderActivity(supabase, {
    order_id: order.id,
    quote_id: quote.id,
    quote_request_id: quoteRequest?.id || null,
    actor_type: actorType,
    action_type: markAcceptedAt ? "quote_approved_order_created" : "quote_payment_pending_order_created",
    title: markAcceptedAt ? "Quote accepted and order created" : "Order created pending payment",
    description: [order.order_number, quote.quote_number, quote.customer_name].filter(Boolean).join(" - "),
    metadata: {
      order_number: order.order_number,
      quote_number: quote.quote_number,
      total_inc_gst: order.total_inc_gst,
    },
    event_key: `order:${order.id}:created`,
    created_at: order.accepted_at || order.created_at,
  });

  return order.id;
}
