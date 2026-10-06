// CHANGES ALFRED CAN MAKE, EACH ONE CHOSEN AND APPROVED BY A PERSON.
//
// ── THE RULE (Ashleigh, 2026-10-06) ──────────────────────────────────────────
//
// Highly regimented. Alfred never decides what to change. He proposes, and the
// person then picks, from buttons built out of the real order:
//
//   1. the value, from the same lists the order page's dropdowns use
//   2. the items, from the lines actually on that order (each one, or all)
//   3. the exact changes, shown as from and to, approved by name
//
// The model's proposal only pre-selects those buttons. Everything that is
// offered, previewed and applied is worked out here from the database, and the
// apply step checks it all again, including that nothing moved since the
// preview. Saving goes through the same code the order page uses
// (lib/pcd-order-item-save.js, lib/pcd-order-header-save.js), so the same
// checks and the same order history apply.
//
// ── WHAT IS ALLOWED ──────────────────────────────────────────────────────────
//
//   planning   who makes it, supplier status, workshop stage, board required,
//              ordered date, ETA and supplier ref, per panel
//   the order  Active, On hold or Complete, scheduled start, estimated completion
//   notes      a dated internal note added to an order, a quote or a customer
//
// Never: cancel or archive, awaiting deposit to Active (the deposit does that),
// anything about money or prices, the supplier's name, sizes, boards or
// anything else the customer agreed to. Complete was added 2026-10-06; its
// preview says what is still owing and still unfinished, as figures, and the
// review request is lined up exactly as the order page does it.

import { ORDER_LINE_STATUSES, ORDER_PRODUCTION_STAGES } from "./pcd-quote-utils";
import { IN_HOUSE, SUPPLIER, isMadeHere, isSupplierMade } from "./pcd-order-planning";
import { panelsOfItem } from "./pcd-order-panel-keys";
import { isThermolaminatedItem, saveOrderItem } from "./pcd-order-item-save";
import { reviewRequestOnTimeline, saveOrderHeader } from "./pcd-order-header-save";
import { outstandingOnOrder } from "./pcd-board-money";
import { orderPanels } from "./pcd-order-stage";
import { baseFor, ORDER_FIELDS } from "./pcd-save-clash";
import { requestLineText } from "./pcd-line-summary";
import { assertQuoteEditable } from "./pcd-quote-lock";
import { logOrderActivity } from "./pcd-activity-log";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// Orders Alfred may touch at all. A finished, cancelled or archived order is a
// person's business on the order page.
export const CHANGEABLE_ORDER_STATUSES = ["pending_deposit", "active", "on_hold"];

const usesBoardPurchase = (p) => isSupplierMade(p.fulfilment) || (isMadeHere(p.fulfilment) && p.board_required);

/** Every change Alfred can offer, and which panels each one applies to. */
export const CHANGE_FIELDS = {
  fulfilment: {
    scope: "panels",
    label: "Who makes it",
    planKey: "fulfilment_method",
    kind: "choice",
    values: [
      { value: IN_HOUSE, label: "Made in house" },
      { value: SUPPLIER, label: "Supplier ready made" },
    ],
    eligible: (p) => !p.thermo,
    why: "Thermolaminated items are always supplier made.",
  },
  supplier_status: {
    scope: "panels",
    label: "Supplier status",
    planKey: "status",
    kind: "choice",
    values: ORDER_LINE_STATUSES.map((v) => ({ value: v, label: v })),
    eligible: (p) => isSupplierMade(p.fulfilment),
    why: "Only supplier made items have a supplier status.",
  },
  production_stage: {
    scope: "panels",
    label: "Workshop stage",
    planKey: "production_stage",
    kind: "choice",
    values: ORDER_PRODUCTION_STAGES.map((v) => ({ value: v, label: v })),
    eligible: (p) => isMadeHere(p.fulfilment) && !p.thermo,
    why: "Only items made in house have a workshop stage.",
  },
  board_required: {
    scope: "panels",
    label: "Board to buy",
    planKey: "board_required",
    kind: "choice",
    values: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
    eligible: (p) => isMadeHere(p.fulfilment),
    why: "Only items made in house need board bought for them.",
  },
  supplier_ordered_at: {
    scope: "panels",
    label: "Ordered date",
    planKey: "supplier_ordered_at",
    kind: "date",
    eligible: usesBoardPurchase,
    why: "Only supplier made items, or in house items with board to buy, are ordered.",
  },
  supplier_eta: {
    scope: "panels",
    label: "ETA",
    planKey: "supplier_eta",
    kind: "date",
    eligible: usesBoardPurchase,
    why: "Only supplier made items, or in house items with board to buy, have an ETA.",
  },
  supplier_order_ref: {
    scope: "panels",
    label: "Supplier ref",
    planKey: "supplier_order_ref",
    kind: "text",
    eligible: usesBoardPurchase,
    why: "Only supplier made items, or in house items with board to buy, have a supplier ref.",
  },
  order_status: {
    scope: "order",
    label: "Order status",
    orderKey: "status",
    kind: "choice",
    values: [
      { value: "active", label: "Active" },
      { value: "on_hold", label: "On hold" },
      { value: "complete", label: "Complete" },
    ],
  },
  scheduled_start_date: { scope: "order", label: "Scheduled start", orderKey: "scheduled_start_date", kind: "date" },
  target_completion_date: { scope: "order", label: "Estimated completion", orderKey: "target_completion_date", kind: "date" },
  note: { scope: "note", label: "Internal note", kind: "text" },
};

export const CHANGE_FIELD_KEYS = Object.keys(CHANGE_FIELDS);

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const shownDate = (v) => (isDate(v) ? new Date(`${v}T00:00:00Z`).toLocaleDateString("en-AU", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "");

/** A value as a person reads it. */
export function shownValue(field, value) {
  const def = CHANGE_FIELDS[field];
  if (value === null || value === undefined || value === "") return "Not set";
  if (field === "board_required") return value === true || value === "yes" ? "Yes" : "No";
  if (def?.kind === "date") return shownDate(value) || String(value);
  if (def?.kind === "choice") return def.values.find((v) => v.value === value)?.label || String(value);
  if (field === "fulfilment" && !value) return "Not decided yet";
  return String(value);
}

/** Is this a value the field allows? Pure. */
export function valueProblem(field, value) {
  const def = CHANGE_FIELDS[field];
  if (!def) return "Alfred cannot change that.";
  const v = String(value ?? "").trim();
  if (def.kind === "choice" && !def.values.some((o) => o.value === v)) return `Pick one of: ${def.values.map((o) => o.label).join(", ")}.`;
  if (def.kind === "date" && !isDate(v)) return "Pick a date.";
  if (def.kind === "text" && !v) return field === "note" ? "Write the note." : "Write the value.";
  if (def.kind === "text" && v.length > (field === "note" ? 1000 : 120)) return "That is too long.";
  return "";
}

/** The panel's values as the order page reads them (panelPlanFor in OrderDetail.js). */
export function panelState(item, panelKey) {
  const planning = item?.panel_planning && typeof item.panel_planning === "object" && !Array.isArray(item.panel_planning) ? item.panel_planning : {};
  const plan = planning[panelKey] || {};
  const thermo = isThermolaminatedItem(item);
  return {
    thermo,
    fulfilment: thermo ? SUPPLIER : plan.fulfilment_method || item.fulfilment_method || "",
    status: plan.status || item.status || "Not Ordered",
    production_stage: plan.production_stage || item.production_stage || "Not Started",
    board_required: typeof plan.board_required === "boolean" ? plan.board_required : Boolean(item.board_required),
    supplier_ordered_at: plan.supplier_ordered_at ?? item.supplier_ordered_at ?? "",
    supplier_eta: plan.supplier_eta ?? item.supplier_eta ?? "",
    supplier_order_ref: plan.supplier_order_ref ?? item.supplier_order_ref ?? "",
  };
}

const currentOf = (field, state) => {
  const key = CHANGE_FIELDS[field].planKey;
  if (field === "fulfilment") return state.fulfilment;
  if (field === "board_required") return state.board_required ? "yes" : "no";
  return state[key] ?? "";
};

/** One order, with its lines' cabinet configs, the way the order page loads them. */
export async function loadOrderForChange(supabase, orderId) {
  const { data: order } = await supabase.from("pcd_orders").select("*, pcd_order_line_items(*)").eq("id", orderId).maybeSingle();
  if (!order) throw fail("That order no longer exists.", 404);
  const quoteLineIds = (order.pcd_order_line_items || []).map((i) => i.quote_line_item_id).filter(Boolean);
  let configs = new Map();
  if (quoteLineIds.length) {
    const { data } = await supabase.from("pcd_cabinet_configs").select("*").in("line_item_id", quoteLineIds);
    configs = new Map((data || []).map((c) => [c.line_item_id, c]));
  }
  order.pcd_order_line_items = (order.pcd_order_line_items || [])
    .map((item) => ({ ...item, cabinet_config: item.cabinet_config_snapshot || configs.get(item.quote_line_item_id) || null }))
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  return order;
}

/**
 * The items on an order a planning change can apply to, each with what it
 * holds now. Pure. Items where no panel qualifies are listed with why not, so
 * the choice shows reality rather than quietly hiding a line.
 */
export function itemChoices(order, field) {
  const def = CHANGE_FIELDS[field];
  return (order.pcd_order_line_items || []).map((item, index) => {
    const panels = panelsOfItem(item).map((p) => ({ ...p, state: panelState(item, p.panelKey) }));
    const eligible = panels.filter((p) => def.eligible(p.state));
    const values = [...new Set(eligible.map((p) => shownValue(field, currentOf(field, p.state))))];
    return {
      itemId: item.id,
      label: `Line ${Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) + 1 : index + 1}: ${requestLineText(item)}`,
      panels: panels.length,
      eligiblePanels: eligible.length,
      now: eligible.length ? (values.length === 1 ? values[0] : `Mixed: ${values.join(", ")}`) : "",
      notEligible: eligible.length ? "" : def.why,
    };
  });
}

/**
 * What a change card offers, built from the database. The model's guess only
 * pre-selects. Throws if the record is not one Alfred may change.
 *
 * @param proposal { field, recordType, recordId, value, itemIds: [] | "all" }
 */
export async function changeOptions(supabase, proposal) {
  const field = String(proposal?.field || "");
  const def = CHANGE_FIELDS[field];
  if (!def) throw fail("Alfred cannot change that.");
  const proposedValue = String(proposal?.value ?? "").trim();
  const base = {
    field,
    fieldLabel: def.label,
    kind: def.kind,
    values: def.values || [],
    value: def.kind === "choice" ? (def.values.some((v) => v.value === proposedValue) ? proposedValue : "") : def.kind === "date" ? (isDate(proposedValue) ? proposedValue : "") : proposedValue.slice(0, 1000),
  };

  if (def.scope === "note") {
    const recordType = ["order", "quote", "customer"].includes(proposal?.recordType) ? proposal.recordType : "";
    if (!recordType) throw fail("Say which order, quote or customer the note is for.");
    const record = await noteRecord(supabase, recordType, proposal.recordId);
    return { ...base, scope: "note", recordType, recordId: record.id, recordLabel: record.label, items: [] };
  }

  const order = await loadOrderForChange(supabase, proposal?.recordId);
  if (!CHANGEABLE_ORDER_STATUSES.includes(order.status)) {
    throw fail(`${order.order_number} is ${String(order.status).replace(/_/g, " ")}, so Alfred leaves it alone. Change it on the order page.`);
  }
  const recordLabel = `${order.order_number}${order.customer_name ? ` for ${order.customer_name}` : ""}`;

  if (def.scope === "order") {
    if (field === "order_status" && !["active", "on_hold"].includes(order.status)) {
      throw fail(`${order.order_number} is awaiting its deposit. It becomes Active when the deposit is paid, not by hand here.`);
    }
    return { ...base, scope: "order", recordType: "order", recordId: order.id, recordLabel, now: shownValue(field, order[def.orderKey]), items: [] };
  }

  const items = itemChoices(order, field);
  const wanted = proposal?.itemIds === "all" ? items.filter((i) => i.eligiblePanels).map((i) => i.itemId) : (Array.isArray(proposal?.itemIds) ? proposal.itemIds : []);
  return {
    ...base,
    scope: "panels",
    recordType: "order",
    recordId: order.id,
    recordLabel,
    items: items.map((i) => ({ ...i, selected: Boolean(i.eligiblePanels) && wanted.includes(i.itemId) })),
  };
}

async function noteRecord(supabase, recordType, recordId) {
  if (recordType === "order") {
    const { data } = await supabase.from("pcd_orders").select("id, order_number, customer_name, internal_notes, status").eq("id", recordId).maybeSingle();
    if (!data) throw fail("That order no longer exists.", 404);
    return { id: data.id, label: `${data.order_number}${data.customer_name ? ` for ${data.customer_name}` : ""}`, notes: data.internal_notes || "", row: data };
  }
  if (recordType === "quote") {
    const { data } = await supabase.from("pcd_quotes").select("id, quote_number, customer_name, notes").eq("id", recordId).maybeSingle();
    if (!data) throw fail("That quote no longer exists.", 404);
    return { id: data.id, label: `${data.quote_number}${data.customer_name ? ` for ${data.customer_name}` : ""}`, notes: data.notes || "", row: data };
  }
  const { data } = await supabase.from("pcd_customers").select("id, name, notes").eq("id", recordId).maybeSingle();
  if (!data) throw fail("That customer no longer exists.", 404);
  return { id: data.id, label: data.name || "Customer", notes: data.notes || "", row: data };
}

/** The dated line a note is added as. Notes are only ever added to. */
export function noteLine(text, approvedBy, now = new Date()) {
  const day = now.toLocaleDateString("en-AU", { timeZone: "Australia/Perth", day: "numeric", month: "short", year: "numeric" });
  return `${day}, ${approvedBy} via Alfred: ${String(text || "").replace(/\s*[–—]\s*/g, ", ").trim()}`;
}

/**
 * Exactly what would change, as rows of from and to. Nothing is saved.
 *
 * @param selection { field, recordType, recordId, value, itemIds }
 * @returns { rows: [{ itemId, panelKey, label, from, to }], summary, nothing }
 */
export async function previewChange(supabase, selection) {
  const field = String(selection?.field || "");
  const def = CHANGE_FIELDS[field];
  if (!def) throw fail("Alfred cannot change that.");
  const problem = valueProblem(field, selection?.value);
  if (problem) throw fail(problem);
  const value = String(selection.value).trim();

  if (def.scope === "note") {
    const record = await noteRecord(supabase, selection.recordType, selection.recordId);
    return {
      rows: [{ label: record.label, from: "", to: noteLine(value, "(your name)") }],
      summary: `Add an internal note to ${record.label}.`,
      nothing: false,
    };
  }

  const order = await loadOrderForChange(supabase, selection.recordId);
  if (!CHANGEABLE_ORDER_STATUSES.includes(order.status)) throw fail(`${order.order_number} can no longer be changed by Alfred.`);

  if (def.scope === "order") {
    if (field === "order_status" && !["active", "on_hold"].includes(order.status)) throw fail(`${order.order_number} is awaiting its deposit.`);
    const from = order[def.orderKey] ?? "";
    const rows = String(from) === value ? [] : [{ label: order.order_number, from: shownValue(field, from), to: shownValue(field, value), fromRaw: from ?? "" }];
    const notes = field === "order_status" && value === "complete" && rows.length ? await completingNotes(supabase, order) : [];
    return { rows, notes, summary: `${def.label} on ${order.order_number}: ${shownValue(field, value)}.`, nothing: !rows.length };
  }

  const ids = Array.isArray(selection.itemIds) ? selection.itemIds : [];
  if (!ids.length) throw fail("Pick at least one item.");
  const rows = [];
  for (const item of order.pcd_order_line_items) {
    if (!ids.includes(item.id)) continue;
    const choice = itemChoices({ pcd_order_line_items: [item] }, field)[0];
    for (const panel of panelsOfItem(item)) {
      const state = panelState(item, panel.panelKey);
      if (!def.eligible(state)) continue;
      const from = currentOf(field, state);
      if (String(from) === value) continue;
      rows.push({
        itemId: item.id,
        panelKey: panel.panelKey,
        label: `${choice.label.split(":")[0]}${panel.label ? `, ${panel.label}` : ""}`,
        from: shownValue(field, from),
        to: shownValue(field, value),
        fromRaw: from,
      });
    }
  }
  const unknown = ids.filter((id) => !order.pcd_order_line_items.some((i) => i.id === id));
  if (unknown.length) throw fail("One of those items is no longer on the order. Start the change again.");
  return { rows, summary: `${def.label}: ${shownValue(field, value)} on ${rows.length} panel${rows.length === 1 ? "" : "s"} of ${order.order_number}.`, nothing: !rows.length };
}

/**
 * What a person should see before marking an order Complete. Figures only,
 * never a verdict: whether it is right to complete is theirs to say.
 */
export async function completingNotes(supabase, order) {
  const { data: payments } = await supabase.from("pcd_order_payments").select("*").eq("order_id", order.id);
  const owing = outstandingOnOrder(order.total_inc_gst, payments || []);
  const panels = (order.pcd_order_line_items || []).flatMap(orderPanels);
  const unfinished = panels.filter((p) =>
    p.fulfilment_method === "in_house" ? !["Complete", "Ready for Install", "Packed"].includes(p.production_stage || "") : !["Checked", "Installed", "Complete"].includes(p.status || "")
  ).length;
  return [
    owing > 0.009 ? `$${owing.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is still owing on this order.` : "Nothing is owing on this order.",
    unfinished ? `${unfinished} of ${panels.length} panels are not yet marked made, checked or installed.` : `All ${panels.length} panels are marked made, checked or installed.`,
    "Completing lines up the Google review request, the same as the order page.",
  ];
}

/**
 * Apply a previewed change. Everything is checked again, and if any panel no
 * longer holds the value the preview showed, nothing is saved.
 *
 * @param expected  the preview's rows, as approved
 */
export async function applyChange(supabase, selection, expected, { approvedBy }) {
  if (!String(approvedBy || "").trim()) throw fail("Choose who is approving first.");
  const field = String(selection?.field || "");
  const def = CHANGE_FIELDS[field];
  const now = await previewChange(supabase, selection);
  const key = (r) => `${r.itemId || ""}|${r.panelKey || ""}|${r.fromRaw ?? ""}`;
  if (def.scope !== "note") {
    const before = new Set((expected || []).map(key));
    const after = new Set(now.rows.map(key));
    if (before.size !== after.size || [...before].some((k) => !after.has(k))) {
      throw fail("Something on the order changed since you reviewed this, so nothing was saved. Review the change again.", 409);
    }
  }
  if (now.nothing) return { ok: true, applied: 0, summary: "Nothing needed changing." };
  const value = String(selection.value).trim();

  if (def.scope === "note") {
    const record = await noteRecord(supabase, selection.recordType, selection.recordId);
    const line = noteLine(value, approvedBy);
    const notes = record.notes ? `${record.notes}\n${line}` : line;
    if (selection.recordType === "order") {
      await saveOrderHeader(supabase, record.id, { internal_notes: notes, base: baseFor(record.row, { internal_notes: ORDER_FIELDS.internal_notes }) }, { actorType: "alfred", approvedBy });
    } else if (selection.recordType === "quote") {
      // Internal only, but a quote that is with the customer or has become an
      // order is not Alfred's to touch. The same lock the quote editor uses.
      await assertQuoteEditable(supabase, record.id);
      const query = supabase.from("pcd_quotes").update({ notes }).eq("id", record.id);
      const { data, error } = await (record.notes ? query.eq("notes", record.notes) : query.or("notes.is.null,notes.eq.")).select("id");
      if (error) throw error;
      if (!data?.length) throw fail("The quote's notes changed while you were approving, so nothing was saved. Try again.", 409);
      await logOrderActivity(supabase, { quote_id: record.id, actor_type: "alfred", action_type: "quote_note_added", title: "Internal note added", description: line, metadata: { approved_by: approvedBy } });
    } else {
      const query = supabase.from("pcd_customers").update({ notes }).eq("id", record.id);
      const { data, error } = await (record.notes ? query.eq("notes", record.notes) : query.or("notes.is.null,notes.eq.")).select("id");
      if (error) throw error;
      if (!data?.length) throw fail("The customer's notes changed while you were approving, so nothing was saved. Try again.", 409);
      await logOrderActivity(supabase, { customer_id: record.id, actor_type: "alfred", action_type: "customer_note_added", title: "Internal note added", description: line, metadata: { approved_by: approvedBy } });
    }
    return { ok: true, applied: 1, summary: `Note added to ${record.label}.` };
  }

  if (def.scope === "order") {
    const order = await loadOrderForChange(supabase, selection.recordId);
    const saved = await saveOrderHeader(
      supabase,
      order.id,
      { [def.orderKey]: value, base: baseFor(order, { [def.orderKey]: ORDER_FIELDS[def.orderKey] || def.label }) },
      { actorType: "alfred", approvedBy }
    );
    await reviewRequestOnTimeline(supabase, order.id, saved.beforeOrder, saved.updates, { actorType: "alfred", approvedBy });
    await logAlfredChange(supabase, order.id, now.summary, approvedBy);
    return { ok: true, applied: 1, summary: now.summary };
  }

  // Panels, one save per item, through the order page's own save.
  const byItem = new Map();
  for (const row of now.rows) {
    const changes = byItem.get(row.itemId) || {};
    changes[row.panelKey] = { [def.planKey]: field === "board_required" ? value === "yes" : value };
    byItem.set(row.itemId, changes);
  }
  for (const [itemId, changes] of byItem) {
    await saveOrderItem(supabase, selection.recordId, itemId, { panel_planning_changes: changes }, { actorType: "alfred", approvedBy });
  }
  await logAlfredChange(supabase, selection.recordId, now.summary, approvedBy);
  return { ok: true, applied: now.rows.length, summary: now.summary };
}

async function logAlfredChange(supabase, orderId, summary, approvedBy) {
  await logOrderActivity(supabase, {
    order_id: orderId,
    actor_type: "alfred",
    action_type: "alfred_change_applied",
    title: "Changed through Alfred",
    description: `${summary} Approved by ${approvedBy}.`,
    metadata: { approved_by: approvedBy },
  });
}
