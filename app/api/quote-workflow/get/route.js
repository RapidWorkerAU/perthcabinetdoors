import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { getDatabaseColourItems } from "../../../../lib/pcd-colour-library";
import { prefillDetails } from "../../../../lib/pcd-contact-details";
import { getBusinessDefaults } from "../../../../lib/pcd-business-defaults";
import { quoteScheduleView } from "../../../../lib/pcd-quote-schedule";
import { creditsHeldByQuote, creditSentence, depositAfterCredit, quoteCreditView } from "../../../../lib/pcd-customer-credits";

// THE COLOUR'S PHOTO, RESOLVED HERE RATHER THAN IN THE BROWSER.
//
// colour_src is not a column on a quote line and never was, so the public page
// asked for it, got nothing, and the colour was the one selection a customer
// could not click to see. The image belongs to the colour library row, so it is
// looked up there, by the same library id the line already stores against its
// cost, falling back to matching on finish and colour for lines saved before
// ids were captured. Same rule the quote editor uses, so the swatch a customer
// opens is the swatch we priced.
//
// Done on the server because the page is read by somebody with no sign-in and
// should not be making a second call to work out a picture.
async function colourImageIndex(supabase) {
  const byId = new Map();
  const byName = new Map();
  let items = [];
  try {
    items = await getDatabaseColourItems(supabase);
  } catch {
    // A missing swatch is cosmetic. The colour name still reads, so a library
    // that will not load is not worth failing a quote over.
    return { byId, byName };
  }
  items.forEach((item) => {
    if (!item?.src) return;
    if (item.id) byId.set(item.id, item.src);
    const colour = String(item.colour || "").trim().toLowerCase();
    if (!colour) return;
    const finish = String(item.finish || "").trim().toLowerCase();
    if (!byName.has(`${finish}|${colour}`)) byName.set(`${finish}|${colour}`, item.src);
    if (!byName.has(`|${colour}`)) byName.set(`|${colour}`, item.src);
  });
  return { byId, byName };
}

function colourSrcForLine(line, index) {
  if (line.colour_src) return line.colour_src;
  if (!line.colour) return "";
  if (line.unit_cost_source_id) {
    const byId = index.byId.get(line.unit_cost_source_id);
    if (byId) return byId;
  }
  const colour = String(line.colour).trim().toLowerCase();
  const finish = String(line.finish || "").trim().toLowerCase();
  return index.byName.get(`${finish}|${colour}`) || index.byName.get(`|${colour}`) || "";
}

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

    const colours = await colourImageIndex(supabase);

    // THE DATES, WORKED OUT HERE RATHER THAN IN THE BROWSER.
    //
    // How long the suggested dates hold for is a Business Default, and the
    // browser has no business reading the settings row to find out. So the
    // page is handed the finished answer: the pair, how long the job runs, and
    // the one sentence that states the condition. Null when the quote suggests
    // no dates, which most older quotes do.
    const businessDefaults = await getBusinessDefaults(supabase);
    const schedule = quoteScheduleView(quote, businessDefaults);

    // WHAT THEY HAVE ALREADY PAID, WORKED OUT HERE.
    //
    // The page could add it up itself, but then two places would decide what a
    // credit is worth against a total and the customer's screen is the worst
    // place for that argument to be settled. The deposit comes with it for the
    // same reason: it is a share of the job less money already received, and
    // the rule for that lives in lib/pcd-quote-acceptance.js where the payment
    // gate reads it too.
    const heldCredits = await creditsHeldByQuote(supabase, quote.id).catch(() => []);
    const creditView = quoteCreditView(quote, heldCredits);
    const depositPercent = Number(quote.deposit_percent || 0);
    const depositFull = quote.deposit_required && depositPercent > 0
      ? Number(((Number(quote.total_inc_gst || 0) * depositPercent) / 100).toFixed(2))
      : 0;
    const credit = creditView
      ? {
          lines: creditView.lines.map((line) => ({ label: line.label, amount: line.amount })),
          applied: creditView.applied,
          payable: creditView.payable,
          depositBefore: depositFull,
          depositAfter: depositAfterCredit(depositFull, creditView.applied),
          sentence: creditSentence(creditView, {
            depositBefore: depositFull,
            depositAfter: depositAfterCredit(depositFull, creditView.applied),
          }),
        }
      : null;

    return Response.json({
      ok: true,
      quote: {
        ...quote,
        pcd_quote_line_items: (quote.pcd_quote_line_items || []).map((line) => ({
          ...line,
          cabinet_config: configsByLineId.get(line.id) || null,
          colour_src: colourSrcForLine(line, colours),
        })),
      },
      details: prefillDetails({ customer, quote }),
      schedule,
      credit,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load quote." }, { status: 500 });
  }
}
