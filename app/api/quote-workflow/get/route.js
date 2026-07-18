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

    // Only a SENT quote's view counts. Previously this fired on the first load
    // of the public link at ANY status, so an admin previewing "what the client
    // sees" before sending (status still 'draft') set viewed_at then — and the
    // real client view afterwards found viewed_at already set and never flipped
    // the status to 'viewed'. Gate on 'sent' so pre-send opens don't burn it,
    // and the first genuine post-send view records the transition.
    if (quote.status === "sent" && !quote.viewed_at) {
      const { error: viewError } = await supabase
        .from("pcd_quotes")
        .update({ viewed_at: new Date().toISOString(), status: "viewed" })
        .eq("id", quote.id);
      if (!viewError) {
        await supabase.from("pcd_quote_actions").insert({ quote_id: quote.id, action: "viewed" });
      }
    }

    const { data: cabinetConfigs } = await supabase
      .from("pcd_cabinet_configs")
      .select("*")
      .eq("quote_id", quote.id);
    const configsByLineId = new Map((cabinetConfigs || []).map((config) => [config.line_item_id, config]));

    return Response.json({
      ok: true,
      quote: {
        ...quote,
        pcd_quote_line_items: (quote.pcd_quote_line_items || []).map((line) => ({
          ...line,
          cabinet_config: configsByLineId.get(line.id) || null,
        })),
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load quote." }, { status: 500 });
  }
}
