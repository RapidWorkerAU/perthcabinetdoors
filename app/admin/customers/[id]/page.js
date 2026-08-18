import { notFound } from "next/navigation";
import AdminShell from "../../_components/AdminShell";
import CustomerDeskClient from "./CustomerDeskClient";
import { requireAdminSession } from "../../../../lib/admin-guard";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { loadCustomerDesk } from "../../../../lib/pcd-desk-data";

// The customer desk. Replaces the details modal on the customers list: a
// customer is a place you work from, not a dialog you glance at and close.
//
// Loaded on the server so the page arrives with its history already in it. A
// desk that flashes empty and then fills in is a desk that looks like the
// customer has no history, which is the exact question it exists to answer.

export const dynamic = "force-dynamic";

export default async function CustomerDeskPage({ params }) {
  // Authenticate first, then query with the service role. This is the same
  // shape requireAdminApiContext uses for every admin API route: the session
  // decides WHO you are, and the reads are done with a client that row level
  // security does not filter.
  //
  // It has to be this way round. A blocked read returns an empty result and no
  // error, so a session-scoped client made a customer who plainly exists look
  // like a customer who does not, and the page 404'd on real records.
  await requireAdminSession();
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const desk = await loadCustomerDesk(supabase, id);

  if (!desk) {
    // Say WHY in the server log. A bare 404 on a customer that plainly exists
    // is the least helpful thing this page could do, and a blocked read looks
    // exactly like a missing row: Supabase returns no error when row level
    // security refuses a select, only an empty result.
    console.error(
      `[customer-desk] No customer readable for id ${id || "(none supplied)"}. ` +
        `Either there is no such customer, or the signed-in session could not read pcd_customers.`
    );
    notFound();
  }

  return (
    <AdminShell>
      <CustomerDeskClient customerId={id} initial={desk} />
    </AdminShell>
  );
}
