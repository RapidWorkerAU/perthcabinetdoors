import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { saveQuoteLine, deleteQuoteLine } from "../../../../quotes/[id]/_quote-line-save";
import { calculateQuoteLine, calculateQuoteTotals, GST_RATE } from "../../../../../../../lib/pcd-quote-utils";
import { getBusinessDefaults } from "../../../../../../../lib/pcd-business-defaults";
import { getDatabaseColourRows, isMadeToOrder, normaliseColourMaterialKey } from "../../../../../../../lib/pcd-colour-library";
import { withLibraryBoardRatesForAll } from "../../../../../../../lib/pcd-design-board-rates";
import { mergeIdenticalLines } from "../../../../../../../lib/pcd-import-utils";
import { assertQuoteEditable } from "../../../../../../../lib/pcd-quote-lock";
// The design-to-pieces translation itself. Shared with the public request
// path so a customer's design and one of ours produce the same pieces.
import {
  anyPartSelected,
  CABINET_TYPES,
  computeItemWarnings,
  generateImportLines,
  itemLabel,
  withCalculatedUnitCost,
} from "../../../../../../../lib/pcd-design-to-lines";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { quote_id: quoteId, force, selections, preview } = await request.json();

    // A preview (staging dry-run) needs no target quote — it just generates and
    // prices what WOULD be imported. A commit still requires the quote.
    if (!preview && !quoteId) {
      return Response.json({ ok: false, error: "quote_id is required." }, { status: 422 });
    }

    const projectResult = await context.supabase
      .from("pcd_design_projects").select("id, name").eq("id", projectId).single();
    if (projectResult.error || !projectResult.data) {
      return Response.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    if (quoteId) {
      const quoteResult = await context.supabase.from("pcd_quotes").select("id").eq("id", quoteId).single();
      if (quoteResult.error || !quoteResult.data) {
        return Response.json({ ok: false, error: "Quote not found." }, { status: 404 });
      }
      // An accepted quote is a record of what was agreed. Changing the work
      // after that is a variation on the order, which is priced, sent and
      // approved. See lib/pcd-quote-lock.js.
      await assertQuoteEditable(context.supabase, quoteId);
    }

    // Load all items and rooms for this project, ordered for consistent sort order
    const [{ data: items, error: itemsError }, { data: rooms, error: roomsError }] = await Promise.all([
      context.supabase
        .from("pcd_design_items")
        .select("*")
        .eq("design_project_id", projectId)
        .order("room_id", { ascending: true })
        .order("sort_order", { ascending: true }),
      context.supabase.from("pcd_design_rooms").select("id, name, width_mm, depth_mm, height_mm").eq("design_project_id", projectId),
    ]);

    if (itemsError) throw itemsError;
    if (roomsError) throw roomsError;

    // Obstructions are spatial-only (walls, nib walls, recesses) — never
    // manufactured or quoted, so they're excluded before any warning checks
    // or line generation ever sees them.
    const rawImportableItems = (items || []).filter((item) => !["obstruction", "window", "door_opening", "appliance", "brick_corner_pantry"].includes(item.item_type));
    if (!rawImportableItems.length) {
      return Response.json({ ok: false, error: "No items to import." }, { status: 422 });
    }

    // THE COLOUR LIBRARY IS THE PRICE, EVERY TIME THIS RUNS.
    //
    // A design item carries the rate that was copied onto it when somebody
    // picked the colour. Most carry none, so those lines imported at $0 with a
    // "no board rate" warning even though the library knew the price. The ones
    // that do carry a rate carry whatever it was on the day it was drawn, so a
    // design from before a price rise quoted at the old price with nothing to
    // say so.
    //
    // Both are fixed by looking the price up here rather than trusting the copy,
    // through the same resolver the quote-request conversion uses, so the two
    // routes from a design to a quote can no longer give different answers. A
    // manual override still wins: that is somebody setting the rate for this
    // job, not a stale number. See lib/pcd-design-board-rates.js.
    //
    // It runs before the pre-flight warnings and before any line is built, so
    // the preview, the warnings and the commit all see the same numbers.
    const colourRows = await getDatabaseColourRows(context.supabase, { activeOnly: true });
    // WHICH BOARDS ARE QUOTED BY THE SUPPLIER RATHER THAN HELD AT A RATE.
    //
    // Thermolaminate and compact laminate go to the supplier as a job, so a $0
    // rate on one is normal and not worth a pre-flight warning. Matched by the
    // library row the picker recorded where there is one, and by the board's
    // name where there is not.
    const madeToOrderIds = new Set(colourRows.filter(isMadeToOrder).map((row) => row.id));
    const madeToOrderNames = new Set(
      colourRows.filter(isMadeToOrder).map((row) =>
        [normaliseColourMaterialKey(row.material_type), String(row.thickness || "").replace(/D/g, ""), String(row.name || "").trim().toLowerCase()].join("|")
      )
    );
    const isMadeToOrderBoard = (style) => {
      if (!style) return false;
      if (style.colour_library_id && madeToOrderIds.has(style.colour_library_id)) return true;
      const key = [
        normaliseColourMaterialKey(style.material),
        String(style.thickness_mm ?? style.carcass_thickness_mm ?? "").replace(/D/g, ""),
        String(style.colour || "").trim().toLowerCase(),
      ].join("|");
      return madeToOrderNames.has(key);
    };
    const { items: importableItems, priced: pricedRates } = withLibraryBoardRatesForAll(
      rawImportableItems,
      colourRows,
      (item) => CABINET_TYPES.includes(item.item_type)
    );

    const roomNameById = new Map((rooms || []).map((room) => [room.id, room.name]));
    const roomById     = new Map((rooms || []).map((room) => [room.id, room]));

    // Precomputed once so run detection only considers cabinets that are
    // actually being imported (a partially selected continuous run sums just
    // the selected cabinets' widths, rather than the whole run). Needed by
    // the pre-flight pass below as well as line generation.
    const selectedCabinetItems = importableItems.filter(
      (i) => CABINET_TYPES.includes(i.item_type) && anyPartSelected(i, selections)
    );

    // Read once for both paths below. The preview and the commit have to price
    // from the same settings, or the numbers someone approves are not the
    // numbers that get saved.
    const businessDefaults = await getBusinessDefaults(context.supabase);

    // ── Staging preview (dry-run) ──────────────────────────────────────────
    // Generate + price exactly what a commit would, grouped Room → Cabinet →
    // Part, with the same pre-flight warnings — but save nothing. Stage 1 of the
    // staging-table flow: review before committing.
    if (preview) {
      const gstRate = businessDefaults.gst_rate ?? GST_RATE;
      const warnings = computeItemWarnings({ importableItems, selections, selectedCabinetItems, roomNameById, roomById, isMadeToOrderBoard });
      const generated = generateImportLines({ importableItems, selections, selectedCabinetItems, roomNameById, roomById, items });
      const mergedById = new Map(importableItems.map((i) => [i.id, i]));

      const pricedLines = [];
      const byRoom = new Map(); // roomName → Map(itemId → { itemId, label, isCabinet, lines })
      for (const { line, itemId, part } of mergeIdenticalLines(generated)) {
        const src = mergedById.get(itemId);
        const priced = calculateQuoteLine(withCalculatedUnitCost({ ...line }), businessDefaults);
        pricedLines.push(priced);
        const roomName = roomNameById.get(src?.room_id) || "Unassigned";
        if (!byRoom.has(roomName)) byRoom.set(roomName, new Map());
        const cabs = byRoom.get(roomName);
        if (!cabs.has(itemId)) cabs.set(itemId, { itemId, label: itemLabel(src) || "Item", isCabinet: CABINET_TYPES.includes(src?.item_type), lines: [] });
        // `part` rides on each line so the staging modal can group the tree's
        // checkboxes and trace a priced row back to the toggle that governs it.
        cabs.get(itemId).lines.push({ ...priced, part });
      }
      const groups = [...byRoom.entries()].map(([room, cabs]) => ({ room, cabinets: [...cabs.values()] }));
      const totals = calculateQuoteTotals(pricedLines, gstRate, { business_defaults: businessDefaults });

      // The selection tree the modal draws its checkboxes from. Built from a
      // FULL (everything-on) generation BEFORE merge, so EVERY importable item
      // is represented — including ones whose lines merge under another item's
      // id (mergeIdenticalLines keeps only the first contributor). Building the
      // tree off the merged `groups` instead dropped those items: with no
      // checkbox they weren't in the client's `selections`, so they defaulted
      // to "included" and reappeared in the priced list even after the user
      // deselected everything. Independent of `selections`, so it stays stable
      // as the user ticks.
      const PART_ORDER = ["cabinet", "doors", "drawers", "kickboard", "filler", "panels"];
      const allCabinets = importableItems.filter((i) => CABINET_TYPES.includes(i.item_type));
      const fullGen = generateImportLines({ importableItems, selections: undefined, selectedCabinetItems: allCabinets, roomNameById, roomById, items });
      const treeRooms = new Map(); // roomName → Map(itemId → { itemId, label, isCabinet, parts:Set })
      for (const { itemId, part } of fullGen) {
        const src = mergedById.get(itemId);
        const roomName = roomNameById.get(src?.room_id) || "Unassigned";
        if (!treeRooms.has(roomName)) treeRooms.set(roomName, new Map());
        const itemsInRoom = treeRooms.get(roomName);
        if (!itemsInRoom.has(itemId)) {
          itemsInRoom.set(itemId, { itemId, label: itemLabel(src) || "Item", isCabinet: CABINET_TYPES.includes(src?.item_type), parts: new Set() });
        }
        itemsInRoom.get(itemId).parts.add(part);
      }
      const tree = [...treeRooms.entries()].map(([room, itemsInRoom]) => ({
        room,
        items: [...itemsInRoom.values()].map((it) => ({
          itemId: it.itemId,
          label: it.label,
          isCabinet: it.isCabinet,
          parts: PART_ORDER.filter((p) => it.parts.has(p)),
        })),
      }));

      return Response.json({
        ok: true,
        preview: true,
        project: projectResult.data.name,
        line_count: pricedLines.length,
        warnings,
        groups,
        tree,
        totals,
        // Every board rate taken from the colour library, and what it replaced.
        // The ones where `changed` is true had a different rate on the design,
        // so somebody should see the difference before committing it.
        priced_rates: pricedRates,
      });
    }

    if (!force) {
      const warnings = [];

      // Re-import REPLACES every line this project previously produced. That's
      // deliberate — it's what stops duplicates — but it silently destroys any
      // edit made to those lines since: a negotiated unit cost, a hand-set
      // markup, a rewritten description, a client note. Until now the only
      // mention of that was a code comment. Say it before doing it.
      const { count: previousCount, error: previousCountError } = await context.supabase
        .from("pcd_quote_line_items")
        .select("id", { count: "exact", head: true })
        .eq("quote_id", quoteId)
        .eq("design_project_id", projectId);
      if (previousCountError) throw previousCountError;
      if (previousCount > 0) {
        warnings.push({
          itemId: "__reimport__",
          label: `This quote already has ${previousCount} line${previousCount === 1 ? "" : "s"} imported from this project. ` +
                 `They will be deleted and re-created — any manual edits to them (prices, markups, descriptions, notes) will be lost.`,
        });
      }

      warnings.push(...computeItemWarnings({ importableItems, selections, selectedCabinetItems, roomNameById, roomById, isMadeToOrderBoard }));
      if (warnings.length) {
        return Response.json({ ok: true, needsConfirmation: true, warnings });
      }
    }

    // Get current max sort_order in the quote
    const { data: existingLines } = await context.supabase
      .from("pcd_quote_line_items")
      .select("sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: false })
      .limit(1);

    let sortOrder = (existingLines?.[0]?.sort_order ?? -1) + 1;

    const results = { created: 0, deleted: 0, failed: 0, errors: [] };

    // Re-running an import must replace everything this project previously
    // produced in this quote, not append duplicates alongside it.
    //
    // Done as ONE up-front sweep rather than a delete inside the per-item
    // loop. The loop could only ever visit items that still exist, so lines
    // belonging to a DELETED design item were unreachable and stranded on the
    // quote forever — worst for run-merged panels, where deleting the run's
    // first cabinet left its whole-run board behind while a surviving cabinet
    // emitted a fresh one on top.
    const staleIds = new Set();
    const { data: byProject, error: byProjectError } = await context.supabase
      .from("pcd_quote_line_items")
      .select("id")
      .eq("quote_id", quoteId)
      .eq("design_project_id", projectId);
    if (byProjectError) throw byProjectError;
    (byProject || []).forEach((row) => staleIds.add(row.id));

    // Safety net for lines imported before design_project_id existed that the
    // migration's backfill didn't reach. Scoped to items that still exist, so
    // it can never touch a hand-added line (those have no design_item_id).
    const currentItemIds = importableItems.map((i) => i.id);
    if (currentItemIds.length) {
      const { data: byItem, error: byItemError } = await context.supabase
        .from("pcd_quote_line_items")
        .select("id")
        .eq("quote_id", quoteId)
        .in("design_item_id", currentItemIds);
      if (byItemError) throw byItemError;
      (byItem || []).forEach((row) => staleIds.add(row.id));
    }

    for (const staleId of staleIds) {
      await deleteQuoteLine(context.supabase, quoteId, staleId);
    }
    results.deleted = staleIds.size;

    // Generate every line first, tagged with its source item, so identical
    // flat lines can be collapsed into one (qty summed) before any are saved —
    // e.g. two identical standalone panels, or the same door on two cabinets.
    // Same generator the staging preview uses, so a commit matches its preview.
    const generated = generateImportLines({ importableItems, selections, selectedCabinetItems, roomNameById, roomById, items });

    const mergedById = new Map(importableItems.map((i) => [i.id, i]));
    for (const { line, itemId } of mergeIdenticalLines(generated)) {
      try {
        // design_project_id as well as the item: the item tag alone can't be
        // swept once its item is deleted, and the project tag is what scopes
        // the sweep away from other projects' and hand-added lines.
        const taggedLine = { ...line, design_item_id: itemId, design_project_id: projectId };
        await saveQuoteLine(context.supabase, quoteId, withCalculatedUnitCost(taggedLine), { sortOrder });
        sortOrder += 1;
        results.created += 1;
      } catch (err) {
        results.failed += 1;
        const src = mergedById.get(itemId);
        results.errors.push(`Item "${src?.label || itemId}": ${err?.message}`);
      }
    }

    if (results.created > 0) {
      await context.supabase
        .from("pcd_design_projects")
        .update({ status: "converted_to_quote" })
        .eq("id", projectId);
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Import failed." },
      { status: error?.status || 500 }
    );
  }
}
