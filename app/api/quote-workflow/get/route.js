import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { prefillDetails } from "../../../../lib/pcd-contact-details";

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

    // AN ARCHIVED QUOTE'S LINK IS DEAD, AND HAS TO ACTUALLY BE DEAD.
    //
    // This route used to load a quote at any status at all, and the approve
    // route only refused one that had already been answered. So a quote put
    // away in March could still be opened and approved in June, at a price we
    // could no longer build it for, and nothing would have stopped it.
    //
    // It matters more now that quotes archive themselves after their validity
    // runs out: the reminder we send tells the customer in writing that the link
    // stops working on a given date, and an email that says that while the link
    // goes on working is worse than sending nothing.
    //
    // Worded for the person reading it rather than for us. They did nothing
    // wrong, "archived" is our word not theirs, and the only useful thing to
    // tell them is how to get a current price.
    if (quote.status === "archived") {
      return Response.json(
        {
          ok: false,
          expired: true,
          error:
            "This quote has expired and can no longer be viewed or approved. If you would still like the work " +
            "done, get in touch and we will put a fresh quote together for you. Prices and lead times may have " +
            "changed since this one was prepared.",
        },
        { status: 410 }
      );
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

    // The details the customer must confirm before accepting. Read from the
    // customer record first, because that is the one we keep current, falling
    // back to the snapshot stored on the quote itself. Only these six fields
    // are exposed: the rest of a customer row is none of the browser's business.
    let customer = null;
    if (quote.customer_id) {
      const { data } = await supabase
        .from("pcd_customers")
        .select("name,email,phone,site_address,site_street,site_suburb,site_postcode")
        .eq("id", quote.customer_id)
        .maybeSingle();
      customer = data || null;
    }

    return Response.json({
      ok: true,
      quote: {
        ...quote,
        pcd_quote_line_items: (quote.pcd_quote_line_items || []).map((line) => ({
          ...line,
          cabinet_config: configsByLineId.get(line.id) || null,
        })),
      },
      details: prefillDetails({ customer, quote }),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load quote." }, { status: 500 });
  }
}
