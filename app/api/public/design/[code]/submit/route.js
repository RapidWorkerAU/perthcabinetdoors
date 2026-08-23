// PUBLIC design planner — "Send my design to PCD". Turns the anonymous session's
// design into a QUOTE REQUEST (source 'design_tool') with the customer's contact
// details and a per-item summary, linked back to the saved design so staff can
// open it and build the real quote. Reuses the shared quote-request insert +
// emails, so a design lead lands in the same admin queue as the website form.
//
// THE CUSTOMER CHOOSES WHAT WE QUOTE. `selection` maps an item id to the parts
// they ticked - the cabinet itself, its doors, its drawer fronts, its panels,
// its kickboard. Someone who planned a whole room but only wants a price on
// four doors now says so, and we quote four doors. The part definitions come
// from lib/pcd-design-parts.js, the same file the modal draws from, so the two
// ends cannot disagree about what a part is.
//
// A request with NO selection still means "all of it", so an older client, or a
// design sent from anywhere else, behaves exactly as it did before.

import { hasKickboard } from "../../../../../lib/pcd-kickboard-utils";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { resolvePublicProject } from "../../../../../../lib/pcd-public-design";
import { IncompleteQuoteRequestError, insertQuoteRequest, sendQuoteRequestEmails } from "../../../../../../lib/pcd-quote-request";
import { isIkeaPreset } from "../../../../../../lib/pcd-ikea-presets";
import {
  buildPreset,
  partsForItem,
  quotableItems,
  selectedPartKeys,
} from "../../../../../../lib/pcd-design-parts";
import { requestLinesForItem } from "../../../../../../lib/pcd-design-request-lines";
import { createSupplierGuard, firstSupplierConflict } from "../../../../../../lib/pcd-supplier-guard";
import { customerNoticeFor, reportSendFailures } from "../../../../../../lib/pcd-notify";

export const dynamic = "force-dynamic";

// What the customer ticked, in words. Each line already says what it is, so
// this is for the request-level summary: a staff member reads one list rather
// than inferring the shape of the job from twenty lines.
const PART_WORD = {
  carcass: "the cabinet",
  doors: "doors",
  drawers: "drawer fronts",
  endpanels: "finished panels",
  filler: "filler panel",
  kickboard: "kickboard",
  body: "the item itself",
};

function partsWanted(keys) {
  const words = keys.map((key) => PART_WORD[key] || key);
  if (words.length <= 1) return words[0] || "";
  return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
}

// Normalise whatever arrived on the wire. Anything that is not a known item id
// with known part keys is dropped rather than trusted, so a hand-rolled POST
// cannot invent a part we do not make.
function readSelection(raw, items) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const clean = {};
  items.forEach((item) => {
    const wanted = raw[item.id];
    if (!wanted || typeof wanted !== "object") return;
    partsForItem(item).forEach((part) => {
      if (wanted[part.key]) {
        if (!clean[item.id]) clean[item.id] = {};
        clean[item.id][part.key] = true;
      }
    });
  });
  return clean;
}

// Placed to show what's already in the room — a fridge space, a window, a
// doorway. Nothing is manufactured, so they're deliberately NOT quote lines.
// They ride in the summary instead, where they're what stops us quoting a run
// straight through a window.
const ROOM_REFERENCE_LABEL = {
  appliance: "appliance",
  window: "window",
  door_opening: "doorway",
};

// Cabinets the customer already owns. Their lines ask for fronts and panels
// only (see itemToLine), and this repeats it at the top of the notes so it is
// the first thing read rather than something spotted line by line.
function propSummary(items) {
  const counts = new Map();
  for (const item of items || []) {
    if (!isIkeaPreset(item)) continue;
    const key = `${item.label || "IKEA cabinet"} ${item.height_mm || "?"}×${item.width_mm || "?"}mm`;
    counts.set(key, (counts.get(key) || 0) + (Number(item.qty) || 1));
  }
  if (!counts.size) return "";
  const parts = [...counts.entries()].map(([label, n]) => (n > 1 ? `${n} × ${label}` : label));
  return `DO NOT QUOTE THE CARCASSES: ${parts.join("; ")}. These are the customer's own cabinets, placed so they could plan what goes on the front. Their lines are for the fronts and panels only.`;
}

function roomReferenceSummary(items) {
  const notes = [];
  for (const item of items || []) {
    if (!ROOM_REFERENCE_LABEL[item.item_type]) continue;
    const w = Number(item.width_mm) || 0;
    const h = Number(item.height_mm) || 0;
    const size = w && h ? ` ${w}×${h}mm` : "";
    if (item.item_type === "appliance") {
      const kind = String(item.appliance_kind || "appliance").replace(/_/g, " ");
      notes.push(`${kind} space${size}`);
    } else if (item.item_type === "window") {
      const sill = Number(item.mount_height_mm) || 0;
      notes.push(`window${size}${sill ? `, sill ${sill}mm` : ""}`);
    } else {
      notes.push(`doorway${size}`);
    }
  }
  return notes.length ? `Room: ${notes.join("; ")}.` : "";
}

function frontSummary(item) {
  if (item.item_type === "floating_shelf") return "Open shelf";
  if (item.item_type === "panel") {
    const mount = Number(item.mount_height_mm) || 0;
    const t = Number(item.panel_thickness_mm) || Number(item.width_mm) || 0;
    return ["Standalone panel", t ? `${t}mm` : "", mount ? `${mount}mm off the floor` : ""].filter(Boolean).join(" · ");
  }
  // The line's width/height are the SHELF board, so the span, depth and the
  // height it hangs at would otherwise be lost — and those are the three things
  // that decide whether this shelf needs a mid support when we cost it.
  if (item.item_type === "shelf_rail") {
    const cfg = item.shelf_rail_config || {};
    const rail = cfg.front_rail?.on === false ? "no front rail" : "front rail";
    const top = Number(item.mount_height_mm || 0) + Number(item.height_mm || 0);
    return [
      `Shelf & rail — ${Number(item.width_mm) || 0}mm span`,
      `${Number(item.depth_mm) || 0}mm deep`,
      top ? `top of shelf ${top}mm off the floor` : "",
      rail,
    ].filter(Boolean).join(" · ");
  }
  const ft = item.front_type;
  // The line carries ONE colour (the carcass / front), so a bookcase's second
  // finish would otherwise never reach the quote request — the shelf colour is
  // the whole reason a customer picks a bookcase, so it goes in the note.
  if (item.item_type === "bookcase") {
    const shelfColour = [item.shelf_colour, item.shelf_finish].filter(Boolean).join(" ");
    const depth = Number(item.depth_mm) || 0;
    return [
      `Bookcase, ${Number(item.shelf_qty) || 0} shelves`,
      depth ? `${depth}mm deep` : "",
      "solid back",
      shelfColour ? `shelves in ${shelfColour}` : "",
      hasKickboard(item) ? "kickboard" : "",
    ].filter(Boolean).join(" · ");
  }
  if (ft === "mixed") {
    const secs = Array.isArray(item.section_config?.sections) ? item.section_config.sections : [];
    return `Bays: ${secs.map((s) => (s.type === "appliance" ? "oven" : s.type || "doors")).join(", ") || "—"}`;
  }
  if (ft === "drawers") return `${(item.drawer_config?.heights_mm || []).length || 1} drawers`;
  if (ft === "none") return `Open, ${Number(item.shelf_qty) || 0} shelves`;
  return `${item.door_config?.columns || 1} door${(item.door_config?.columns || 1) > 1 ? "s" : ""}`;
}

// Lines are built by lib/pcd-design-request-lines.js, ONE PER REAL PIECE, using
// the same geometry and the same product-type vocabulary the admin design
// importer uses. See that file for why this route no longer rolls its own.

// A plain list of what was asked for, per item. frontSummary carries the detail
// a per-piece line cannot: a bookcase's shelf colour, a shelf & rail's span and
// mount height, which bays a mixed front has. Without this those would be lost.
function askedForSummary(chosen) {
  if (!chosen.length) return "";
  const rows = chosen.map(({ item, keys }) => {
    const size = `${item.height_mm || "?"}×${item.width_mm || "?"}mm`;
    const detail = frontSummary(item);
    const label = item.label || "Item";
    return `- ${label} (${size}): ${partsWanted(keys)}${detail ? ` — ${detail}` : ""}`;
  });
  return `WHAT THEY ASKED FOR\n${rows.join("\n")}`;
}

async function getCode(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.code;
}

export async function POST(request, { params }) {
  try {
    const code = await getCode(params);
    const body = await request.json();
    const supabase = createSupabaseAdminClient();

    const project = await resolvePublicProject(supabase, code);
    if (!project) return Response.json({ ok: false, error: "Design not found." }, { status: 404 });

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const phone = String(body?.phone || "").trim();
    if (!name) return Response.json({ ok: false, error: "Please enter your name." }, { status: 422 });
    if (!email && !phone) return Response.json({ ok: false, error: "Please enter an email or phone number so we can reach you." }, { status: 422 });

    const [{ data: rooms }, { data: items }] = await Promise.all([
      supabase.from("pcd_design_rooms").select("*").eq("design_project_id", project.id),
      supabase.from("pcd_design_items").select("*").eq("design_project_id", project.id).order("sort_order", { ascending: true }),
    ]);

    // Props stay in the list. What changes is what their line ASKS FOR: the
    // fronts and panels, never the carcass. Dropping the item outright would
    // drop the doors the customer came here for.
    const quotable = quotableItems(items || []);
    // No selection means the whole design, so anything that submits without one
    // keeps the old behaviour.
    const selection = readSelection(body?.selection, quotable) || buildPreset(quotable, "everything");

    const chosen = quotable
      .map((item) => ({ item, keys: selectedPartKeys(selection, item) }))
      .filter((entry) => entry.keys.length > 0);

    if (!chosen.length) {
      return Response.json(
        { ok: false, error: "Please choose at least one thing for us to quote." },
        { status: 422 }
      );
    }

    const room = (rooms || [])[0];
    const lineContext = { roomName: room?.name || "", roomHeightMm: Number(room?.height_mm) || 0 };
    const lines = chosen.flatMap((entry) => requestLinesForItem(entry.item, entry.keys, lineContext));
    const chosenItems = chosen.map((entry) => entry.item);

    // EVERY PIECE NEEDS A COLOUR. Checked here and not only in the browser,
    // because a browser check is a suggestion. A request that arrives with
    // "not chosen yet" on it cannot be priced without emailing the customer
    // back, which is a worse experience than being asked on the page they were
    // already on. A cabinet is exempt: it is priced from its cut list and its
    // board spec rides on the pieces, not on the cabinet line.
    const unpriceable = lines.filter(
      (line) => line.productType !== "base_cabinet" && (!line.material || !line.colour)
    );
    if (unpriceable.length) {
      return Response.json(
        {
          ok: false,
          error: "Please choose a colour for every piece before sending your design.",
          missingColour: [...new Set(unpriceable.map((line) => line.productName))],
        },
        { status: 422 }
      );
    }

    const roomText = room ? `Room ${room.width_mm || "?"}×${room.depth_mm || "?"}×${room.height_mm || "?"}mm. ` : "";
    // Say plainly when they only want part of what they drew, so nobody quotes
    // the rest of the design back at them.
    const partial =
      chosen.length < quotable.length
        ? `The customer chose ${chosen.length} of the ${quotable.length} items in their design. The rest were drawn but NOT requested.`
        : "";
    const summary = `${roomText}${chosen.length} item${chosen.length === 1 ? "" : "s"} requested from the website planner.`;
    // Fridge spaces, windows and doorways aren't quote lines, but they're the
    // reason a run stops where it does — so they go in the notes.
    const roomRefs = roomReferenceSummary(items);
    // Only the props they actually asked for, so this does not warn about a
    // cabinet that is not in the request.
    const props = propSummary(chosenItems);
    const notes = [summary, partial, askedForSummary(chosen), props, roomRefs, String(body?.notes || "").trim()]
      .filter(Boolean)
      .join("\n\n");

    const payload = {
      source: "design_tool",
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      deliverySuburb: String(body?.suburb || "").trim(),
      notes,
      lines,
      designProjectId: project.id,
      productName: "Website room design",
    };

    // ONE BRAND PER LINE, the same rule the website quote form is held to.
    //
    // The planner now narrows the colour, the shape and the edge to the brand
    // chosen on the part, so a mixed line should never be built in the first
    // place. This stays as the backstop: a design saved before that narrowing
    // existed, or a payload that did not come from our own screen, can still
    // carry a Laminex colour under a Polytec profile - two real things that
    // cannot be made together, and nothing downstream would disagree.
    // See lib/pcd-supplier-guard.js.
    const checkSupplier = await createSupplierGuard(supabase);
    const mixed = firstSupplierConflict(lines, checkSupplier, (line, index) => line.productType || `Piece ${index + 1}`);
    if (mixed) {
      return Response.json(
        {
          ok: false,
          error: `${mixed.label}: ${mixed.problem} Please change that piece and send your design again.`,
          incompleteLines: [{ index: mixed.index, label: mixed.label, missing: ["supplierName"] }],
        },
        { status: 400 }
      );
    }

    const requestRow = await insertQuoteRequest(supabase, payload);
    // Flag the design as submitted so staff can tell it's been sent in.
    await supabase.from("pcd_design_projects").update({ status: "submitted" }).eq("id", project.id);

    // The design is saved and marked submitted, so the customer is done. An
    // email that will not send is ours to chase and is reported rather than
    // thrown. See lib/pcd-notify.js.
    const failures = reportSendFailures(
      `design request ${requestRow.id}`,
      await sendQuoteRequestEmails(payload).catch((thrown) => [
        { label: "business", ok: false, error: thrown?.message || "Send failed." },
      ])
    );

    return Response.json({ ok: true, id: requestRow.id, notice: customerNoticeFor(failures) });
  } catch (error) {
    // Something on the design is not finished enough to be quoted. The colour
    // check above catches the usual case with a friendlier message; this is the
    // backstop for anything else, and it names the piece rather than failing as
    // a server error the customer can do nothing with.
    if (error instanceof IncompleteQuoteRequestError) {
      return Response.json(
        {
          ok: false,
          error: `${error.message} Please finish that piece and send your design again.`,
          incompleteLines: error.incompleteLines,
        },
        { status: 422 }
      );
    }
    return Response.json({ ok: false, error: error?.message || "Could not send your design." }, { status: 500 });
  }
}
