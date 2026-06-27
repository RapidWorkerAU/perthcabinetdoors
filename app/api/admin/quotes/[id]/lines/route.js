import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { quoteIdFromParams, saveQuoteLine } from "../_quote-line-save";

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const payload = await request.json();
    const result = await saveQuoteLine(context.supabase, quoteId, payload.line || payload, {
      sortOrder: payload.sort_order ?? payload.sortOrder ?? 0,
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save quote line." },
      { status: error?.status || 500 }
    );
  }
}
