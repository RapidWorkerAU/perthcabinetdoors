import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { generateElevationPdf } from "../../../../../../lib/pcd-cabinet-pdf";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const body    = await request.json();
    const { rooms, cabinets: cabinetsByRoom } = body;

    if (!rooms?.length) {
      return Response.json({ ok: false, error: "No rooms provided." }, { status: 400 });
    }

    const { data: quote, error: quoteError } = await context.supabase
      .from("pcd_quotes")
      .select("id, quote_number, customer_name")
      .eq("id", quoteId)
      .single();

    if (quoteError) throw quoteError;

    const pdfBuffer = generateElevationPdf({ quote, rooms, cabinetsByRoom });

    const safeNum  = String(quote.quote_number || "quote")
      .trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "quote";
    const fileName = `elevations-${safeNum}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not generate elevation PDF." },
      { status: 500 }
    );
  }
}
