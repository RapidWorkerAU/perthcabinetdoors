import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { cleanFilePart, loadQuoteForPdf } from "../../../../../../lib/pcd-quote-pdf-attachment";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
import { generateQuotePdf } from "../../../../../../lib/pcd-cabinet-pdf";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const [{ quote, lines }, businessDefaults] = await Promise.all([
      loadQuoteForPdf(context.supabase, quoteId),
      getBusinessDefaults(context.supabase),
    ]);
    const pdfBuffer = generateQuotePdf({ quote, lines, businessDefaults });
    const quoteNumber = cleanFilePart(quote.quote_number, "quote");
    const fileName = `quote-${quoteNumber}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not generate quote PDF." },
      { status: 500 }
    );
  }
}
