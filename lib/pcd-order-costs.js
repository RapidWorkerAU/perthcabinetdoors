// The job costs an order carries, and the one place that says what they are.
//
// WHY THIS EXISTS. A variation could add, change and remove items but could not
// touch labour, travel, delivery, consumables, painting, glass or removal. A job
// that grew by two hours on site had nowhere to put them, so it went in as a
// "price adjustment" line and landed on the order as though it were a product.
//
// A variation now carries these as lines with action 'job_cost', and each one
// says what the cost IS NOW on the order and what it BECOMES. That is only
// honest if the order actually holds a current figure, which it did not: an
// order used to store just the subtotal, the GST and the total, with the
// breakdown left behind on the quote. So the order carries these columns now,
// they are copied across when a quote is accepted, and an applied variation
// writes the revised figure back. If any one of those three stops happening the
// "currently" figure on the next variation is a lie, which is worse than showing
// nothing — hence one shared definition rather than three lists that can drift.
//
// Labour is the odd one out and deliberately so: it is hours times a rate, not a
// dollar figure, because that is how the quote captures it and how a customer
// reads it. A labour line stores the hours in `qty` and the rate in
// `product_unit_cost_ex_gst`, so the existing line maths prices it with no new
// arithmetic at all.

import { roundMoney, toNumber } from "./pcd-quote-utils";

export const JOB_COST_ACTION = "job_cost";

/**
 * key          what a variation line stores in cost_type
 * label        what staff see (matches the quote editor's own wording)
 * customer     what the customer sees (matches the quote approval page)
 * orderField   the money column on pcd_orders
 * hours        true when the cost is hours x rate rather than a flat amount
 */
export const JOB_COST_TYPES = [
  {
    key: "labour",
    label: "Labour",
    customer: "Labour",
    orderField: "labour_cost_ex_gst",
    hoursField: "labour_hours",
    rateField: "worker_hourly_rate",
    hours: true,
    hint: "Workshop and job labour. Charged as hours at the worker rate.",
  },
  { key: "travel", label: "Travel", customer: "Travel", orderField: "travel_cost_ex_gst", hint: "Travel allowance for the job." },
  { key: "delivery", label: "Delivery", customer: "Delivery", orderField: "delivery_cost_ex_gst", hint: "Delivery allowance for the supplied items." },
  {
    key: "consumables",
    label: "Consumables",
    customer: "Consumables",
    orderField: "installation_cost_ex_gst",
    hint: "Small job materials such as glue, screws and sundries.",
  },
  { key: "painting", label: "Painting", customer: "Painting", orderField: "painting_cost_ex_gst", hint: "Painting allowance for painted doors and fronts." },
  { key: "glass", label: "Glass", customer: "Glass", orderField: "glass_cost_ex_gst", hint: "Glass allowance for doors or panels with glass inserts." },
  {
    key: "removal",
    label: "Door removal and disposal",
    customer: "Door removal and disposal",
    orderField: "removal_cost_ex_gst",
    hint: "Taking off the old doors and fronts and taking them away.",
  },
];

export const JOB_COST_KEYS = JOB_COST_TYPES.map((type) => type.key);

export function jobCostType(key) {
  return JOB_COST_TYPES.find((type) => type.key === key) || null;
}

export function isJobCostLine(line) {
  return line?.action === JOB_COST_ACTION;
}

/**
 * What this cost is on the order right now, in dollars.
 *
 * Labour is derived rather than stored, so it cannot disagree with the hours and
 * the rate the customer is shown.
 */
export function orderJobCostAmount(order, key) {
  const type = jobCostType(key);
  if (!type || !order) return 0;
  if (type.hours) {
    return roundMoney(toNumber(order[type.hoursField]) * toNumber(order[type.rateField]));
  }
  return roundMoney(toNumber(order[type.orderField]));
}

/** The hours and rate behind a labour figure, for the "currently 42.0 hrs" hint. */
export function orderLabourParts(order) {
  const type = jobCostType("labour");
  return {
    hours: toNumber(order?.[type.hoursField]),
    rate: toNumber(order?.[type.rateField]),
  };
}

/**
 * Every job cost on an order, for a summary. Costs sitting at zero are kept:
 * on this screen a zero is a real answer ("we do not charge for glass on this
 * job"), and hiding it would make an unset cost indistinguishable from one
 * somebody decided on.
 */
export function orderJobCosts(order) {
  return JOB_COST_TYPES.map((type) => ({
    ...type,
    amount: orderJobCostAmount(order, type.key),
    ...(type.hours ? orderLabourParts(order) : {}),
  }));
}

/**
 * The columns to write back onto the order when a variation carrying this line
 * is applied. This is what keeps the next variation's "currently" figure true.
 *
 * Labour writes the hours, not the money: the money is derived from hours x
 * rate everywhere it is read, so storing it as well would give it two sources.
 */
export function orderPatchForJobCostLine(line) {
  const type = jobCostType(line?.cost_type);
  if (!type) return null;
  if (type.hours) {
    return {
      [type.hoursField]: toNumber(line.qty),
      [type.rateField]: toNumber(line.product_unit_cost_ex_gst),
    };
  }
  return { [type.orderField]: roundMoney(toNumber(line.proposed_line_total_ex_gst)) };
}

/**
 * The costs an order inherits from the quote it was raised off. Called once, at
 * acceptance. `labour_hours` on a quote is the DERIVED total (manual hours plus
 * the per-cabinet hours from its lines), which is the right figure to carry: it
 * is what the customer was charged for.
 */
export function orderCostColumnsFromQuote(quote) {
  return {
    labour_hours: toNumber(quote?.labour_hours),
    worker_hourly_rate: toNumber(quote?.worker_hourly_rate),
    travel_cost_ex_gst: toNumber(quote?.travel_cost_ex_gst),
    delivery_cost_ex_gst: toNumber(quote?.delivery_cost_ex_gst),
    installation_cost_ex_gst: toNumber(quote?.installation_cost_ex_gst),
    painting_cost_ex_gst: toNumber(quote?.painting_cost_ex_gst),
    glass_cost_ex_gst: toNumber(quote?.glass_cost_ex_gst),
    removal_cost_ex_gst: toNumber(quote?.removal_cost_ex_gst),
  };
}

export const ORDER_COST_COLUMNS = Object.keys(orderCostColumnsFromQuote({}));

// An order created before these columns existed cannot be given them by an
// insert, so every write that includes them can fall back to writing the rest.
// Same guard the quote line saver uses for supplier_name.
export function isMissingOrderCostColumnError(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" && ORDER_COST_COLUMNS.some((column) => message.includes(column));
}

export function withoutOrderCostColumns(row) {
  const rest = { ...row };
  for (const column of ORDER_COST_COLUMNS) delete rest[column];
  return rest;
}

/**
 * A one line summary of a job cost change, for the line's title and for the
 * customer's Proposed column. Says the direction in words so a negative number
 * is never the only clue.
 */
export function jobCostChangeLabel(key, delta) {
  const type = jobCostType(key);
  if (!type) return "Job cost";
  if (Math.abs(toNumber(delta)) < 0.005) return `${type.label} unchanged`;
  return toNumber(delta) > 0 ? `Additional ${type.label.toLowerCase()}` : `Reduced ${type.label.toLowerCase()}`;
}
