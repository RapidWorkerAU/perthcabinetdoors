import { z } from "zod";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { validateQuoteLineColour } from "../../../lib/pcd-colour-library";
import { insertQuoteRequest, sendQuoteRequestEmails } from "../../../lib/pcd-quote-request";

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

    // Each line here is a specific board selection, so its colour must exist in
    // the library. (The design planner submits a summary via its own route and
    // skips this — carcass-white and unset colours aren't library selections.)
    for (const line of payload.lines) {
      const valid = await validateQuoteLineColour(supabase, {
        material: line.material,
        thickness: line.thickness,
        finish: line.finish,
        colour: line.colour,
      });
      if (!valid) {
        return Response.json(
          {
            ok: false,
            error: `The colour "${line.colour}" is not available for ${line.material || "the selected material"} ${line.thickness || ""}. Please reselect a colour and try again.`.trim(),
          },
          { status: 400 }
        );
      }
    }

    const requestRow = await insertQuoteRequest(supabase, payload);
    await sendQuoteRequestEmails(payload);
    return Response.json({ ok: true, id: requestRow.id });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not send quote request." }, { status: 500 });
  }
}
