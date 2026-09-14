// A WEB ORDER, FROM A CART TO A STRIPE PAGE.
//
// ── A QUOTE SITS BEHIND EVERY WEB ORDER ──────────────────────────────────────
//
// Checkout writes a quote and its lines, priced by the quote's own arithmetic
// (lib/pcd-shop-pricing.js), holds it in its own status and hands its total to
// Stripe. Nothing is an order until the money lands: then the deposit gate's
// claim turns the quote into an order, exactly once, whichever of the webhook,
// the confirmation page or the sweep gets there first.
//
// So a web order is cut, labelled, delivered, invoiced and varied like every
// other job from the moment it exists, and the quote is its record of what was
// bought and at what price. It is marked as the shop's (source web_shop), so
// nobody wonders who quoted a job nobody quoted.
//
// ── WHAT IS CHECKED AGAIN HERE ───────────────────────────────────────────────
//
// Everything. The browser has shown a price and a set of answers, and neither
// is trusted: the lines are priced again from the library, every answer the
// product page insisted on is insisted on again, the address has to be one we
// deliver to, and the total the customer was shown has to be the total we are
// about to charge. If it is not, nothing is written and they are shown the new
// figure before anything is taken.

import { randomBytes } from "node:crypto";
import { logOrderActivity } from "./pcd-activity-log";
import { addressColumns } from "./pcd-contact-details";
import { resolveQuoteCustomer } from "./pcd-customer-utils";
import { abandonWebCheckout, archiveWebCheckout, WEB_CHECKOUT, WEB_ORDER_FLOW } from "./pcd-deposit-gate";
import { defaultQuoteTermsFor } from "./pcd-quote-terms";
import { calculateQuoteLine, roundMoney } from "./pcd-quote-utils";
import { createCheckoutSession, expireCheckoutSession } from "./pcd-stripe";
import { checkoutDetailProblems } from "./pcd-shop";
import { priceShopCart, webQuoteCosts } from "./pcd-shop-pricing";
import {
  isMissingSupplierNameSchemaError,
  quoteLineRow,
  recalculateQuoteTotals,
  withoutSupplierName,
} from "../app/api/admin/quotes/[id]/_quote-line-save";

export const WEB_SHOP_SOURCE = "web_shop";

const text = (value) => String(value ?? "").trim();

// The same two helpers the other quote writers keep locally. A web order's
// quote is numbered and coded like any other, so it can be found the same way.
function makeQuoteNumber() {
  return `PCD-Q-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

/** "Jane Smith, Subiaco", which is how a job is looked for on the orders list. */
function projectName(details) {
  return [text(details.name), text(details.suburb)].filter(Boolean).join(", ") || null;
}

/**
 * Write the quote behind a web order and open a Stripe page for its total.
 *
 * Returns { ok, checkoutUrl, quoteId, quoteNumber, amount }, or { ok: false,
 * status, error, problems?, price? } without having written anything.
 */
export async function startWebCheckout(supabase, { lines = [], details = {}, expectedTotalIncGst = null, previousQuoteId = "", baseUrl }) {
  const detailProblems = checkoutDetailProblems(details);
  if (Object.keys(detailProblems).length) {
    return { ok: false, status: 400, error: "Some of your details need another look.", problems: detailProblems };
  }

  // Back from Stripe without paying, and trying again. The page they left is
  // closed first, so there are never two live ways to pay for one cart.
  if (previousQuoteId) await abandonWebCheckout(supabase, previousQuoteId);

  const price = await priceShopCart(supabase, { lines, postcode: details.postcode });
  if (!price.ready) {
    return {
      ok: false,
      status: 400,
      error: "Something in your cart needs changing before it can be paid for.",
      lines: price.lines.filter((entry) => !entry.ok).map(({ id, problems }) => ({ id, problems })),
    };
  }

  // THE FIGURE THEY WERE SHOWN IS THE FIGURE WE TAKE. A rate that moved while
  // they were typing their address is told to them, not quietly charged.
  if (expectedTotalIncGst !== null && roundMoney(expectedTotalIncGst) !== price.totals.totalIncGst) {
    return {
      ok: false,
      status: 409,
      error: "Our prices changed while you were checking out. Please check the new total before you pay.",
      totals: price.totals,
    };
  }

  const defaults = price.catalogue.defaults;
  const address = { street: details.street, suburb: details.suburb, postcode: details.postcode };
  const customerId = await resolveQuoteCustomer(supabase, {
    customer_name: text(details.name),
    customer_email: text(details.email).toLowerCase(),
    customer_phone: text(details.phone),
    ...addressColumns(address),
  });
  const terms = await defaultQuoteTermsFor(supabase);

  const { data: quote, error: quoteError } = await supabase
    .from("pcd_quotes")
    .insert({
      quote_number: makeQuoteNumber(),
      access_code: makeAccessCode(),
      title: "Web order",
      status: WEB_CHECKOUT,
      source: WEB_SHOP_SOURCE,
      customer_id: customerId,
      customer_name: text(details.name),
      customer_email: text(details.email).toLowerCase(),
      customer_phone: text(details.phone),
      ...addressColumns(address),
      project_name: projectName(details),
      currency: defaults.currency,
      gst_rate: defaults.gst_rate,
      // The same figures the price was worked out from, so the saved quote
      // totals exactly what the customer was shown.
      ...webQuoteCosts(defaults, { deliveryExGst: price.totals.deliveryExGst }),
      deposit_required: false,
      terms: terms.terms || null,
      terms_term_ids: terms.terms_term_ids,
    })
    .select("*")
    .single();
  if (quoteError) throw quoteError;

  try {
    const rows = price.quoteLines.map((line, index) => quoteLineRow(calculateQuoteLine(line, defaults), quote.id, index));
    let { error: lineError } = await supabase.from("pcd_quote_line_items").insert(rows);
    if (lineError && isMissingSupplierNameSchemaError(lineError)) {
      ({ error: lineError } = await supabase
        .from("pcd_quote_line_items")
        .insert(rows.map((row) => withoutSupplierName(row, lineError))));
    }
    if (lineError) throw lineError;

    // The quote's own total, from its own saved lines, is what is charged.
    const saved = await recalculateQuoteTotals(supabase, quote.id, defaults);
    const amount = Number(saved.total_inc_gst) || 0;
    if (roundMoney(amount) !== price.totals.totalIncGst) {
      // Should never happen: both are the same calculation. If it ever does,
      // nobody is charged a figure they were not shown.
      console.error(
        `[shop] ${quote.quote_number} saved at ${amount} but was priced at ${price.totals.totalIncGst}. Not charged.`
      );
      await archiveWebCheckout(supabase, quote.id);
      return {
        ok: false,
        status: 409,
        error: "We could not confirm your total just now. Nothing has been charged. Please try again.",
      };
    }

    const session = await createCheckoutSession({
      amount,
      currency: saved.currency || "AUD",
      customerEmail: saved.customer_email,
      description: `${saved.quote_number} web order`,
      successUrl: `${baseUrl}/orders/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/checkout?returned=1`,
      metadata: {
        flow: WEB_ORDER_FLOW,
        quote_id: saved.id,
        quote_number: saved.quote_number,
      },
    });

    const { error: checkoutError } = await supabase.from("pcd_quote_checkouts").insert({
      quote_id: saved.id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      checkout_url: session.url,
      amount,
      currency: saved.currency || "AUD",
      status: "open",
      client_name: text(details.name) || null,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    });
    // A session we cannot file is money that would arrive with nowhere to go.
    if (checkoutError) {
      try {
        await expireCheckoutSession(session.id);
      } catch {
        /* best effort; the row failing is what is reported */
      }
      throw checkoutError;
    }

    await logOrderActivity(supabase, {
      quote_id: saved.id,
      actor_type: "customer",
      action_type: "web_checkout_started",
      title: "Web order started, not yet paid",
      description: [saved.quote_number, saved.customer_name].filter(Boolean).join(" - "),
      metadata: { quote_number: saved.quote_number, amount, stripe_checkout_session_id: session.id, source: WEB_SHOP_SOURCE },
      event_key: `quote:${saved.id}:web_checkout:${session.id}`,
    });

    return { ok: true, checkoutUrl: session.url, quoteId: saved.id, quoteNumber: saved.quote_number, amount };
  } catch (error) {
    // Nothing half made is left looking like a live order.
    await archiveWebCheckout(supabase, quote.id);
    throw error;
  }
}
