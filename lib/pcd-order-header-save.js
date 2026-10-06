// SAVING AN ORDER'S OWN FIELDS: STATUS, DATES, NOTES AND THE REST.
//
// Moved here from app/api/admin/orders/[id]/route.js, unchanged, so the order
// page and Alfred save the same way: the same allowed statuses, the same save
// clash check (nobody else's change is undone), the same date check and the
// same order history. The order page's route still does the Google review
// request wording afterwards, which only a move to or from Complete needs, and
// Alfred can never make that move.

import { clashMessage, keepTheirs, ORDER_FIELDS, saveClashes } from "./pcd-save-clash";
import { describeChanges, logOrderActivity } from "./pcd-activity-log";
import { ORDER_STATUSES } from "./pcd-quote-utils";
import { scheduleProblems } from "./pcd-order-schedule";

const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });

/**
 * Save an order's own fields. Throws an Error with .status on anything
 * refused; a save clash also carries .clashes.
 *
 * @param payload  the fields to change, plus base: the order as it was loaded
 * @returns { beforeOrder, updates, changes }
 */
export async function saveOrderHeader(supabase, id, payload, { actorType = "admin", approvedBy = "" } = {}) {
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!ORDER_STATUSES.includes(payload.status)) {
        throw fail("Invalid order status.");
      }
      updates.status = payload.status;
    }

    [
      "name",
      "customer_name",
      "customer_email",
      "customer_phone",
      "site_address",
      "site_street",
      "site_suburb",
      "site_postcode",
      "deposit_required",
      "deposit_amount",
      "deposit_paid",
      "deposit_paid_at",
      "scheduled_start_date",
      "target_completion_date",
      "customer_comms",
      "internal_notes",
    ].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates[field] = payload[field] === "" ? null : payload[field];
      }
    });

    if (!Object.keys(updates).length) {
      throw fail("No order updates supplied.");
    }

    const { data: beforeOrder } = await supabase
      .from("pcd_orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    // NOBODY ELSE'S CHANGE IS UNDONE. See lib/pcd-save-clash.js.
    const clashes = saveClashes(beforeOrder || {}, payload.base, updates, ORDER_FIELDS);
    if (clashes.length) {
      throw fail(clashMessage(clashes, "this order"), 409, { clashes: clashes.map(({ field, label }) => ({ field, label })) });
    }
    Object.assign(updates, keepTheirs(beforeOrder || {}, payload.base, updates, ORDER_FIELDS));

    // BOTH DATES ARE TYPED, so the pair has to be checked against each other
    // rather than one worked out from the other. Checked against what the order
    // WILL hold, not only against what was sent, so moving the start date past
    // a completion date already stored is caught the same as sending both.
    const schedule = scheduleProblems({ ...(beforeOrder || {}), ...updates });
    if (schedule.length) {
      throw fail(schedule[0].message);
    }

    const { data, error } = await supabase
      .from("pcd_orders")
      .update(updates)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !data) throw error || new Error("Order not found.");

    const changes = describeChanges(beforeOrder || {}, updates, {
      customer_name: "Customer",
      customer_email: "Email",
      customer_phone: "Phone",
      site_address: "Site address",
      site_street: "Street address",
      site_suburb: "Suburb",
      site_postcode: "Postcode",
      deposit_required: "Deposit required",
      deposit_amount: "Deposit amount",
      deposit_paid: "Deposit paid",
      deposit_paid_at: "Deposit paid at",
      scheduled_start_date: "Scheduled start",
      target_completion_date: "Estimated completion",
      internal_notes: "Internal notes",
    });
    if (changes.length) {
      await logOrderActivity(supabase, {
        order_id: id,
        quote_id: beforeOrder?.quote_id || null,
        actor_type: actorType,
        action_type: "order_updated",
        title: "Order updated",
        description: changes.join("; "),
        metadata: { changes, ...(approvedBy ? { approved_by: approvedBy } : {}) },
      });
    }

    return { beforeOrder, updates, changes };
}
