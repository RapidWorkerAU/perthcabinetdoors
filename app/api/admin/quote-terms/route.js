import { requireAdminApiContext } from "@/lib/admin-api";
import {
  QUOTE_TERMS_TABLE,
  isMissingTermsTable,
  listQuoteTerms,
  normalizeQuoteTerm,
  quoteTermToDbRow,
} from "@/lib/pcd-quote-terms";

// Terms are wording that goes out to a customer, so the sanitising happens in
// quoteTermToDbRow rather than here: every write goes through it and there is
// no route-shaped way to save markup that was never cleaned.

async function nextSortOrder(supabase) {
  const { data } = await supabase
    .from(QUOTE_TERMS_TABLE)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  return (Number(data?.[0]?.sort_order || 0) || 0) + 10;
}

function setupError(error) {
  return Response.json(
    {
      ok: false,
      setupRequired: true,
      error: "The terms table is not there yet. Run supabase/202608181900_pcd_quote_terms_library.sql.",
      detail: error?.message || "",
    },
    { status: 503 }
  );
}

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    return Response.json({ ok: true, terms: await listQuoteTerms(context.supabase) });
  } catch (error) {
    return Response.json({ ok: false, terms: [], error: error?.message || "Could not load terms." }, { status: 500 });
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json();
  const row = quoteTermToDbRow(body);
  if (!row.name) return Response.json({ ok: false, error: "Give the term a name." }, { status: 422 });

  const { data, error } = await context.supabase
    .from(QUOTE_TERMS_TABLE)
    .insert({ ...row, sort_order: await nextSortOrder(context.supabase) })
    .select()
    .single();
  if (error) return isMissingTermsTable(error) ? setupError(error) : Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, term: normalizeQuoteTerm(data) });
}

export async function PATCH(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json();
  if (!body.id) return Response.json({ ok: false, error: "id is required." }, { status: 422 });

  const row = quoteTermToDbRow(body);
  const patch = { updated_at: new Date().toISOString() };
  // Only what was sent. The Always toggle is switched on its own from the list,
  // and sending the whole row back would blank the wording of a term whose
  // toggle was all that moved.
  if (body.name !== undefined) {
    if (!row.name) return Response.json({ ok: false, error: "Give the term a name." }, { status: 422 });
    patch.name = row.name;
  }
  if (body.body_html !== undefined || body.body !== undefined) patch.body_html = row.body_html;
  if (body.always_include !== undefined) patch.always_include = row.always_include;
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;

  const { data, error } = await context.supabase
    .from(QUOTE_TERMS_TABLE)
    .update(patch)
    .eq("id", body.id)
    .select()
    .single();
  if (error) return isMissingTermsTable(error) ? setupError(error) : Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, term: normalizeQuoteTerm(data) });
}

// Deleting a term takes it out of the library and changes NO quote. Every quote
// that used it holds its own copy of the wording, which is the whole point of
// copying it in rather than pointing at it.
export async function DELETE(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id is required." }, { status: 422 });

  const { error } = await context.supabase.from(QUOTE_TERMS_TABLE).delete().eq("id", id);
  if (error) return isMissingTermsTable(error) ? setupError(error) : Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
