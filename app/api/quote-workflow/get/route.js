import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const accessCode = String(searchParams.get("code") || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();

    if (!accessCode) {
      return Response.json({ ok: false, error: "Missing access code." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: quote, error } = await supabase
      .from("pcd_quotes")
      .select("*, pcd_quote_line_items(*), pcd_quote_attachments(*)")
      .eq("access_code", accessCode)
      .maybeSingle();

    if (error || !quote) {
      return Response.json({ ok: false, error: "We could not load this quote." }, { status: 404 });
    }

    if (!quote.viewed_at) {
      await supabase
        .from("pcd_quotes")
        .update({ viewed_at: new Date().toISOString(), status: quote.status === "sent" ? "viewed" : quote.status })
        .eq("id", quote.id);
      await supabase.from("pcd_quote_actions").insert({ quote_id: quote.id, action: "viewed" });
    }

    return Response.json({ ok: true, quote });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load quote." }, { status: 500 });
  }
}
