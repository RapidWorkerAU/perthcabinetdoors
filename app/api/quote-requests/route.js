import { z } from "zod";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createBoardCostResolver } from "../../../lib/pcd-board-cost";
import { describeGaps, unreadyLines } from "../../../lib/pcd-quote-ready";
import { IncompleteQuoteRequestError, insertQuoteRequest, sendQuoteRequestEmails } from "../../../lib/pcd-quote-request";
import { createSupplierGuard, firstSupplierConflict } from "../../../lib/pcd-supplier-guard";
import { customerNoticeFor, reportSendFailures } from "../../../lib/pcd-notify";

const lineSchema = z.object({
  productType: z.string().optional(),
  productName: z.string().optional(),
  material: z.string().optional(),
  thickness: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  finish: z.string().optional(),
  colour: z.string().optional(),
  // The colour library row behind the swatch, and its brand. Optional because a
  // request can still arrive from an older client, or from a path that never
  // had a library row to point at; the conversion falls back to matching the
  // colour by name when they are missing.
  colourLibraryId: z.string().uuid().optional(),
  supplierName: z.string().optional(),
  // Which catalogue item a Hardware line is for. Optional because every other
  // kind of line has no hardware, and because a request can still arrive from
  // an older client that never asked.
  hardwareCatalogueId: z.string().uuid().optional(),
  profileType: z.string().optional(),
  profile: z.string().optional(),
  edgeMould: z.string().optional(),
  qty: z.number().optional(),
  hingeHoles: z.boolean().optional(),
  hingeSupply: z.boolean().optional(),
  hingeQty: z.string().optional(),
  notes: z.string().optional(),
});

const quoteRequestSchema = z.object({
  source: z.enum(["request_quote", "product_detail", "design_tool"]).default("request_quote"),
  productId: z.string().optional(),
  productName: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional(),
  deliverySuburb: z.string().optional(),
  cabinetBrand: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).default([]),
});

export async function POST(request) {
  try {
    const parsed = quoteRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ ok: false, error: "Invalid quote request payload." }, { status: 400 });
    }

    const payload = parsed.data;
    const supabase = createSupabaseAdminClient();

    // A HALF-FILLED LINE IS NOT A LEAD, IT IS A DEAD END. This used to accept a
    // row with a material and a thickness and no colour, because the only check
    // was validateQuoteLineColour, which waves through a colour that is missing
    // (it starts `if (!material || !thickness || !colour) return true`). Board
    // prices are held per material, thickness, finish and colour, so those rows
    // could never be priced: they converted to $0 lines and someone had to email
    // the customer to ask what the form had already asked them. The rule is the
    // same one the form applies in the browser, out of one module, so the two
    // cannot drift apart. See lib/pcd-quote-ready.js.
    const notReady = unreadyLines(payload.lines, (line, index) => line.productType || `Line ${index + 1}`);
    if (notReady.length) {
      const first = notReady[0];
      return Response.json(
        {
          ok: false,
          error: `${first.label} is missing ${describeGaps(first.gaps)}. Please complete every line so we can price it.`,
          incompleteLines: notReady.map((entry) => ({ index: entry.index, label: entry.label, missing: entry.gaps.map((gap) => gap.field) })),
        },
        { status: 400 }
      );
    }

    // Each line is a specific board selection, so its colour must exist in the
    // library. ONE read of the library for the whole request, not one per line:
    // the old per-line call reloaded every library row and re-signed every tile
    // image URL each time, so a ten-line request did all of that ten times over.
    //
    // This is the same resolver the conversion prices with, so anything that
    // gets through here is something the conversion can match. A row that exists
    // but has no cost against it yet is NOT rejected: that is our gap to fill,
    // not something the customer can fix, and the conversion reports it to staff.
    const resolveBoard = await createBoardCostResolver(supabase);
    for (const line of payload.lines) {
      const match = resolveBoard({
        colourLibraryId: line.colourLibraryId || null,
        material: line.material,
        thickness: line.thickness,
        finish: line.finish,
        colour: line.colour,
        supplier: line.supplierName,
      });
      if (!match.ok && match.reason === "not_found") {
        return Response.json(
          {
            ok: false,
            error: `The colour "${line.colour}" is not available for ${line.material || "the selected material"} ${line.thickness || ""}. Please reselect a colour and try again.`.trim(),
          },
          { status: 400 }
        );
      }
    }

    // ONE BRAND PER LINE. A door is one brand's colour on that brand's
    // profile, and Laminex makes no edge profiles at all. The form narrows
    // every dropdown by the brand, so this catches what the dropdowns cannot:
    // a tab left open from before the change, or a request replayed by hand.
    // Whatever gets through here becomes a quote and then an order, and a
    // door that cannot be made is found out at the factory. See
    // lib/pcd-supplier-guard.js.
    const checkSupplier = await createSupplierGuard(supabase);
    const mixed = firstSupplierConflict(
      payload.lines,
      checkSupplier,
      (line, index) => line.productType || `Line ${index + 1}`
    );
    if (mixed) {
      return Response.json(
        {
          ok: false,
          error: `${mixed.label}: ${mixed.problem} Please reselect that line and try again.`,
          incompleteLines: [{ index: mixed.index, label: mixed.label, missing: ["supplierName"] }],
        },
        { status: 400 }
      );
    }

    const requestRow = await insertQuoteRequest(supabase, payload);

    // THE REQUEST IS SAVED. THE CUSTOMER IS DONE.
    //
    // An email that will not send is ours to chase, and it used to throw from
    // here, which became a 500 and told somebody their request had failed when
    // we had it. They send it twice or they ring somebody else.
    //
    // The row shows on the quote requests screen whether or not any email went
    // anywhere, so nothing is lost by saying so. See lib/pcd-notify.js.
    const failures = reportSendFailures(`quote request ${requestRow.id}`, await sendQuoteRequestEmails(payload));
    return Response.json({ ok: true, id: requestRow.id, notice: customerNoticeFor(failures) });
  } catch (error) {
    // An incomplete request is the customer's to fix, not a server fault, so it
    // reads as one. insertQuoteRequest is the backstop here: the check above
    // has already run and said the same thing in more detail.
    if (error instanceof IncompleteQuoteRequestError) {
      return Response.json(
        { ok: false, error: `${error.message} Please complete every line so we can price it.`, incompleteLines: error.incompleteLines },
        { status: 400 }
      );
    }
    return Response.json({ ok: false, error: error?.message || "Could not send quote request." }, { status: 500 });
  }
}
