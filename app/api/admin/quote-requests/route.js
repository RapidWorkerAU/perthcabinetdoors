import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../lib/admin-api";
import { resolveQuoteCustomer } from "../../../../lib/pcd-customer-utils";
import { GST_RATE } from "../../../../lib/pcd-quote-utils";

function makeQuoteNumber() {
  return `PCD-Q-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_quote_requests")
      .select("*, pcd_quote_request_line_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, quoteRequests: data || [] });
  } catch (error) {
    return Response.json({ ok: false, quoteRequests: [], setupRequired: true, error: error?.message || "Could not load quote requests." });
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    if (payload.action !== "convert_to_quote" || !payload.id) {
      return Response.json({ ok: false, error: "Invalid quote request action." }, { status: 400 });
    }

    const { data: quoteRequest, error } = await context.supabase
      .from("pcd_quote_requests")
      .select("*, pcd_quote_request_line_items(*)")
      .eq("id", payload.id)
      .single();
    if (error) throw error;

    if (quoteRequest.converted_quote_id) {
      return Response.json({ ok: true, quoteId: quoteRequest.converted_quote_id });
    }

    const customerPayload = {
      customer_name: quoteRequest.customer_name,
      customer_email: quoteRequest.customer_email,
      customer_phone: quoteRequest.customer_phone,
      site_address: quoteRequest.delivery_suburb,
    };
    const customerId = await resolveQuoteCustomer(context.supabase, customerPayload);

    const { data: quote, error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .insert({
        quote_number: makeQuoteNumber(),
        access_code: makeAccessCode(),
        title: quoteRequest.product_name ? `${quoteRequest.product_name} Quote` : "Cabinetry Quote",
        status: "draft",
        customer_id: customerId,
        customer_name: quoteRequest.customer_name,
        customer_email: quoteRequest.customer_email,
        customer_phone: quoteRequest.customer_phone,
        site_address: quoteRequest.delivery_suburb,
        project_name: quoteRequest.cabinet_brand,
        currency: "AUD",
        gst_rate: GST_RATE,
        notes: quoteRequest.notes,
        terms: "Prices are valid for 14 days. Final measurements and site conditions may affect the final invoice.",
      })
      .select("*")
      .single();
    if (quoteError) throw quoteError;

    const requestLines = [...(quoteRequest.pcd_quote_request_line_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (requestLines.length) {
      const quoteLines = requestLines.map((line, index) => ({
        quote_id: quote.id,
        sort_order: index,
        product_type: line.product_type,
        product_name: line.product_name || line.product_type || quoteRequest.product_name,
        description: line.notes,
        material: line.material,
        thickness: line.thickness,
        width_mm: line.width_mm,
        height_mm: line.height_mm,
        finish: line.finish,
        colour: line.colour,
        profile_type: line.profile_type,
        profile: line.profile,
        edge_mould: line.edge_mould,
        qty: line.qty || 1,
        hinge_holes: line.hinge_holes,
        hinge_supply: line.hinge_supply,
        hinge_qty: line.hinge_qty,
        notes: line.notes,
      }));
      const { error: lineError } = await context.supabase.from("pcd_quote_line_items").insert(quoteLines);
      if (lineError) throw lineError;
    }

    await context.supabase
      .from("pcd_quote_requests")
      .update({ status: "converted_to_quote", converted_quote_id: quote.id })
      .eq("id", quoteRequest.id);

    return Response.json({ ok: true, quoteId: quote.id });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not convert quote request." }, { status: 500 });
  }
}
