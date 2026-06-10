import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
import { generateQuotePdf } from "../../../../../../lib/pcd-cabinet-pdf";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function cleanFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

async function loadQuoteForPdf(supabase, quoteId) {
  const { data: quote, error: quoteError } = await supabase
    .from("pcd_quotes")
    .select("*")
    .eq("id", quoteId)
    .single();
  if (quoteError) throw quoteError;

  const [
    { data: lines, error: linesError },
    { data: cabinetConfigs, error: configsError },
  ] = await Promise.all([
    supabase.from("pcd_quote_line_items").select("*").eq("quote_id", quoteId).order("sort_order", { ascending: true }),
    supabase.from("pcd_cabinet_configs").select("*").eq("quote_id", quoteId),
  ]);

  if (linesError) throw linesError;
  if (configsError) throw configsError;

  const configsByLineId = new Map((cabinetConfigs || []).map((config) => [config.line_item_id, config]));
  return {
    quote,
    lines: (lines || []).map((line) => ({
      ...line,
      cabinet_config: configsByLineId.get(line.id) || null,
    })),
  };
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
