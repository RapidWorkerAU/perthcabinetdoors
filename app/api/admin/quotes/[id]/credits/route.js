// PUTTING A CUSTOMER'S CREDIT ON A QUOTE, AND TAKING IT OFF.
//
// A save already claims whatever is available, so these two exist for the
// cases a save does not cover: taking a credit off because you want it on a
// different quote, and putting it back afterwards.
//
// ── NEITHER ASKS FOR A REASON ────────────────────────────────────────────────
//
// Both only move money between our own quotes. The customer holds the same
// amount before and after either one, so there is nothing to justify. The
// operation that TAKES money off somebody is a write off, and that lives on the
// customer record behind a justification box. See lib/pcd-customer-credits.js.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import {
  claimCreditsForQuote,
  creditsHeldByQuote,
  releaseCreditsForQuote,
  syncQuoteCreditTotal,
} from "../../../../../../lib/pcd-customer-credits";

function money(amount, currency = "AUD") {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const id = await quoteIdFromParams(params);
    const credits = await creditsHeldByQuote(context.supabase, id);
    return Response.json({ ok: true, credits });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not read the credits." }, { status: 500 });
  }
}

export async function POST(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const { data: quote } = await context.supabase
      .from("pcd_quotes")
      .select("id, customer_id, currency, status")
      .eq("id", id)
      .maybeSingle();
    if (!quote) return Response.json({ ok: false, error: "Quote not found." }, { status: 404 });
    if (!quote.customer_id) {
      return Response.json(
        { ok: false, error: "This quote has no customer on it yet, so there is nothing to look up." },
        { status: 409 }
      );
    }

    await claimCreditsForQuote(context.supabase, { quoteId: id, customerId: quote.customer_id });
    const applied = await syncQuoteCreditTotal(context.supabase, id);

    return Response.json({
      ok: true,
      applied,
      message: applied > 0
        ? `${money(applied, quote.currency)} applied to this quote.`
        : "There was nothing available to apply.",
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not apply the credit." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await quoteIdFromParams(params);
    const released = await releaseCreditsForQuote(context.supabase, id);
    await syncQuoteCreditTotal(context.supabase, id);

    return Response.json({
      ok: true,
      released,
      message: released
        ? `${released} credit${released === 1 ? "" : "s"} taken off this quote and back on the customer.`
        : "There was no credit on this quote.",
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not remove the credit." }, { status: 500 });
  }
}
