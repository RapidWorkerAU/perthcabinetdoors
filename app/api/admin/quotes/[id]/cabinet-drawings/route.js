import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { generateCabinetDrawingsPdf } from "../../../../../../lib/pcd-cabinet-pdf";

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

async function loadQuoteForCabinetPdf(supabase, quoteId) {
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

async function replaceExistingGeneratedPdf(supabase, quoteId) {
  const { data, error } = await supabase
    .from("pcd_quote_attachments")
    .select("id,file_path,file_name")
    .eq("quote_id", quoteId)
    .like("file_name", "cabinet-drawings-%");
  if (error) throw error;

  const existing = data || [];
  const paths = existing.map((attachment) => attachment.file_path).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from("attachments").remove(paths);
  }

  const ids = existing.map((attachment) => attachment.id).filter(Boolean);
  if (ids.length) {
    const { error: deleteError } = await supabase.from("pcd_quote_attachments").delete().in("id", ids);
    if (deleteError) throw deleteError;
  }
}

export async function POST(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const { quote, lines } = await loadQuoteForCabinetPdf(context.supabase, quoteId);
    const pdfBuffer = generateCabinetDrawingsPdf({ quote, lines });
    const quoteNumber = cleanFilePart(quote.quote_number, "quote");
    const fileName = `cabinet-drawings-${quoteNumber}.pdf`;
    const filePath = `${quoteId}/generated/${Date.now()}-${fileName}`;

    await replaceExistingGeneratedPdf(context.supabase, quoteId);

    const { error: uploadError } = await context.supabase.storage.from("attachments").upload(filePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = context.supabase.storage.from("attachments").getPublicUrl(filePath);

    const { data: attachment, error: insertError } = await context.supabase
      .from("pcd_quote_attachments")
      .insert({
        quote_id: quoteId,
        file_name: fileName,
        file_path: filePath,
        file_url: publicUrl,
        file_type: "application/pdf",
        file_size: pdfBuffer.length,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    return Response.json({ ok: true, attachment });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not generate cabinet drawings PDF." },
      { status: 500 }
    );
  }
}
