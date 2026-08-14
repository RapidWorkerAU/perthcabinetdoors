import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Reads a saved list back by its code. Public, because the code is the only
// credential and the visitor may be arriving on a device that has never seen
// this site. Nothing personal is returned - sizes, colours and profiles only.

export async function GET(_request, { params }) {
  try {
    const resolved = await Promise.resolve(params);
    const code = String(resolved?.code || "").trim().toUpperCase();

    // Cheap shape check before touching the database, so a scan of junk codes
    // costs nothing.
    if (!/^[A-Z0-9]{6,24}$/.test(code)) {
      return Response.json({ ok: false, error: "That link does not look right." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("pcd_saved_quote_lists")
      .select("code,entries")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json(
        { ok: false, error: "We could not find that list. It may have been removed." },
        { status: 404 }
      );
    }

    return Response.json({ ok: true, code: data.code, entries: data.entries || [] });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load that list." },
      { status: 500 }
    );
  }
}
