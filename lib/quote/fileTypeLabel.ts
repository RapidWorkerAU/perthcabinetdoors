export function getQuoteFileTypeLabel(contentType?: string | null, fileName?: string | null) {
  const type = contentType?.toLowerCase() || "";
  const name = fileName?.toLowerCase() || "";

  if (type.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (type.startsWith("image/")) return "Image";
  if (type.includes("spreadsheet") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "Spreadsheet";
  if (type.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "Document";

  return "File";
}
