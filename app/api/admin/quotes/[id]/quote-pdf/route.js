// Attaching the customer's quote PDF by hand.
//
// Sending a quote does this automatically. This route exists for the two cases
// where that is not enough: a quote sent before the copy was attached
// automatically, and a send where the attachment step failed but the email
// went out. Same PDF, same replace rule, so it can be run any number of times.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { attachQuotePdf } from "../../../../../../lib/pcd-quote-pdf-attachment";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function POST(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const { attachment } = await attachQuotePdf(context.supabase, quoteId, { includeCabinetDrawings: false });
    return Response.json({ ok: true, attachment });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not generate the quote PDF." },
      { status: 500 }
    );
  }
}
