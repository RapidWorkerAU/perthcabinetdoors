import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { loadTaxInvoice } from "../../../../../../lib/pcd-tax-invoice-load";
import { generateTaxInvoicePdf } from "../../../../../../lib/pcd-tax-invoice-pdf";
import { taxInvoiceFileName } from "../../../../../../lib/pcd-tax-invoice";

// The tax invoice for one order, as a PDF.
//
// Refused with a 409 until the job is paid in full. The button on the order
// page is disabled until then too, but a disabled button is a courtesy and this
// is the boundary: an invoice issued before the money is in is a document
// saying a job is settled when it is not.

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id: orderId } = await Promise.resolve(params);
    const loaded = await loadTaxInvoice(context.supabase, orderId);
    if (!loaded.ok) {
      return Response.json({ ok: false, error: loaded.error }, { status: loaded.status || 400 });
    }

    const pdf = generateTaxInvoicePdf({ invoice: loaded.invoice });

    // INLINE is for reading it before it goes. A browser renders an inline PDF
    // in a tab; an attachment lands in the downloads folder, which is a worse
    // way to check something you are about to email and a folder full of
    // near-identical files afterwards.
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    const fileName = taxInvoiceFileName(loaded.order);

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "The tax invoice could not be made." },
      { status: 500 }
    );
  }
}
