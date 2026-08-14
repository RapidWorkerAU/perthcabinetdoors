// Generating the customer's quote PDF and filing it against the quote.
//
// WHY THIS EXISTS. Sending a quote used to send a link and nothing else, so
// the customer had no copy they could save, print or forward. Every send now
// builds the same PDF the editor's download button builds and attaches it to
// the quote, which puts it in the Attachments section on the quote viewer.
//
// WITHOUT THE CABINET DRAWINGS. The download in the editor ends with a
// schematic page per configured base cabinet, which is a workshop drawing set.
// What goes out to the customer is the quote: line items, totals and notes.
//
// SHARED, NOT COPIED. The download route, the cabinet drawings route and this
// all need the same quote-with-configs shape, so it is defined once here.

import { getBusinessDefaults } from "./pcd-business-defaults";
import { generateQuotePdf } from "./pcd-cabinet-pdf";

export function cleanFilePart(value, fallback) {
  return (
    String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

// Lines carry their cabinet config, which is stored in a separate table and is
// what the drawings and the size column read.
export async function loadQuoteForPdf(supabase, quoteId) {
  const { data: quote, error: quoteError } = await supabase
    .from("pcd_quotes")
    .select("*")
    .eq("id", quoteId)
    .single();
  if (quoteError) throw quoteError;

  const [{ data: lines, error: linesError }, { data: cabinetConfigs, error: configsError }] = await Promise.all([
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

// Everything this function generates lives under this folder, which is how a
// regenerated copy knows what to replace. Files an admin uploads by hand sit at
// `${quoteId}/...` and are never touched.
function generatedFolder(quoteId) {
  return `${quoteId}/generated/`;
}

const QUOTE_PDF_PREFIX = "quote-";

// A quote can be sent more than once (a price is corrected, a line is added).
// Leaving the old copy behind would show the customer two PDFs with no way to
// tell which is current, so the previous generated quote PDF is removed first.
// Scoped to the generated folder AND the quote- prefix, so neither an uploaded
// file nor the cabinet drawings set can be caught by it.
async function removePreviousQuotePdf(supabase, quoteId) {
  const { data, error } = await supabase
    .from("pcd_quote_attachments")
    .select("id,file_path,file_name")
    .eq("quote_id", quoteId)
    .like("file_path", `${generatedFolder(quoteId)}%`)
    .like("file_name", `${QUOTE_PDF_PREFIX}%`);
  if (error) throw error;

  const existing = data || [];
  if (!existing.length) return;

  const paths = existing.map((attachment) => attachment.file_path).filter(Boolean);
  if (paths.length) await supabase.storage.from("attachments").remove(paths);

  const ids = existing.map((attachment) => attachment.id).filter(Boolean);
  if (ids.length) {
    const { error: deleteError } = await supabase.from("pcd_quote_attachments").delete().in("id", ids);
    if (deleteError) throw deleteError;
  }
}

// The PDF is filed against the quote and nowhere else. It is deliberately not
// put on the email: the send form has an "include price" toggle for keeping
// pricing out of the message, and a priced PDF on it would defeat that. The
// customer reaches it through the secure link, in Attachments.
//
// Returns { attachment, pdfBuffer, fileName }.
export async function attachQuotePdf(supabase, quoteId, { includeCabinetDrawings = false } = {}) {
  const [{ quote, lines }, businessDefaults] = await Promise.all([
    loadQuoteForPdf(supabase, quoteId),
    getBusinessDefaults(supabase),
  ]);

  const pdfBuffer = generateQuotePdf({ quote, lines, businessDefaults, includeCabinetDrawings });
  const fileName = `${QUOTE_PDF_PREFIX}${cleanFilePart(quote.quote_number, "quote")}.pdf`;
  const filePath = `${generatedFolder(quoteId)}${Date.now()}-${fileName}`;

  await removePreviousQuotePdf(supabase, quoteId);

  const { error: uploadError } = await supabase.storage.from("attachments").upload(filePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("attachments").getPublicUrl(filePath);

  const { data: attachment, error: insertError } = await supabase
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

  return { attachment, pdfBuffer, fileName };
}
