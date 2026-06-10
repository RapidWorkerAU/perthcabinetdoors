import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { deleteQuoteLine, lineIdFromParams, quoteIdFromParams, saveQuoteLine } from "../../_quote-line-save";

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const lineId = await lineIdFromParams(params);
    const payload = await request.json();
    const result = await saveQuoteLine(context.supabase, quoteId, payload.line || payload, {
      lineId,
      sortOrder: payload.sort_order ?? payload.sortOrder ?? 0,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save quote line." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const lineId = await lineIdFromParams(params);
    const result = await deleteQuoteLine(context.supabase, quoteId, lineId);

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete quote line." }, { status: 500 });
  }
}
