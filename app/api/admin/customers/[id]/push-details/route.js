import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { detailsFromCustomer, pushTargets, targetKey } from "../../../../../../lib/pcd-customer-push";

// Pushing a customer's details onto their quotes and orders.
//
// GET says what WOULD change. POST changes exactly what was ticked, and nothing
// that was not. The two read the same functions, so a job the screen offered
// can never be one this refuses, and one it did not offer can never be caught
// up in a push.
//
// A quote or an order keeps its own copy of the customer's details ON PURPOSE:
// a second kitchen at an investment property is a real job at an address that
// is not where the customer lives. So nothing here happens on its own. It
// happens because somebody ticked a box.

export const dynamic = "force-dynamic";

const QUOTE_FIELDS = "id, quote_number, title, project_name, status, customer_name, customer_phone, site_address, site_street, site_suburb, site_postcode";
const ORDER_FIELDS = "id, order_number, name, status, customer_name, customer_phone, site_address, site_street, site_suburb, site_postcode";

async function customerIdFrom(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

async function loadContext(supabase, customerId) {
  const [{ data: customer, error }, quotes, orders] = await Promise.all([
    supabase.from("pcd_customers").select("*").eq("id", customerId).maybeSingle(),
    supabase.from("pcd_quotes").select(QUOTE_FIELDS).eq("customer_id", customerId),
    supabase.from("pcd_orders").select(ORDER_FIELDS).eq("customer_id", customerId),
  ]);
  if (error) throw error;
  if (!customer) throw new Error("That customer could not be found.");

  const details = detailsFromCustomer(customer);
  return {
    customer,
    details,
    targets: pushTargets({ quotes: quotes.data || [], orders: orders.data || [], details }),
  };
}

/** What would change, so the screen can show it before anything is touched. */
export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const customerId = await customerIdFrom(params);
    const { details, targets } = await loadContext(context.supabase, customerId);
    return Response.json({ ok: true, details, targets });
  } catch (error) {
    return Response.json(
      { ok: false, targets: [], error: error?.message || "Could not work out what would change." },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const customerId = await customerIdFrom(params);
    const body = await request.json().catch(() => ({}));
    const wanted = new Set(Array.isArray(body.keys) ? body.keys : []);
    if (!wanted.size) return Response.json({ ok: true, updated: 0, skipped: 0 });

    const { details, targets } = await loadContext(context.supabase, customerId);

    // ONLY WHAT WAS OFFERED. A key that is not in targets is either a job that
    // already matches or one belonging to somebody else, and neither is
    // something a request should be able to reach by naming it.
    const chosen = targets.filter((target) => wanted.has(targetKey(target)));
    const skipped = wanted.size - chosen.length;

    const byType = {
      quote: { table: "pcd_quotes", ids: [] },
      order: { table: "pcd_orders", ids: [] },
    };
    for (const target of chosen) byType[target.type].ids.push(target.id);

    let updated = 0;
    const problems = [];
    for (const { table, ids } of Object.values(byType)) {
      if (!ids.length) continue;
      // One statement per table rather than one per job: every row gets the
      // same details, so a loop would be the same write done many times with
      // more ways to fail halfway.
      const { error } = await context.supabase
        .from(table)
        .update({ ...details, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) {
        problems.push(`${table}: ${error.message}`);
        continue;
      }
      updated += ids.length;
    }

    if (problems.length && !updated) {
      return Response.json({ ok: false, error: problems.join("; ") }, { status: 500 });
    }

    return Response.json({ ok: true, updated, skipped, problems });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update those jobs." }, { status: 500 });
  }
}
