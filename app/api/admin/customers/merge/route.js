import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { isEmptyRecord, validateMerge } from "../../../../../lib/pcd-customer-links";

// Everything that points at a customer. Counted before a record is deleted, so
// "there is nothing on it" is something we checked rather than assumed.
const LINKED = [
  ["pcd_quotes", "quotes"],
  ["pcd_orders", "orders"],
  ["pcd_tickets", "tickets"],
  ["pcd_messages", "messages"],
  ["pcd_enquiries", "enquiries"],
  ["pcd_quote_requests", "requests"],
];

async function historyFor(supabase, customerId) {
  const counts = {};
  for (const [table, key] of LINKED) {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);
    counts[key] = count || 0;
  }
  return counts;
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const action = payload?.action || "merge";

    // ── separate ──────────────────────────────────────────────────────────
    // Deleting the link and nothing else. Every row is already sitting where it
    // was written, so the record comes back exactly as it was.
    if (action === "separate") {
      const { data, error } = await context.supabase
        .from("pcd_customers")
        .update({ merged_into_id: null, merged_at: null, merged_by: null })
        .eq("id", payload.customerId)
        .select("id, name, email")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, separated: data });
    }

    // ── delete an empty record ────────────────────────────────────────────
    // A record nobody has ever quoted, ordered, written to or heard from is a
    // mistake rather than a second contact. Merging one would keep a contact
    // that never existed. The counts are re-checked here rather than trusted
    // from the browser, because this is the one action that cannot be undone.
    if (action === "delete") {
      const counts = await historyFor(context.supabase, payload.customerId);
      if (!isEmptyRecord(counts)) {
        return Response.json(
          { ok: false, error: "That record has history on it. Merge it instead of deleting it.", counts },
          { status: 409 }
        );
      }
      const { data: owns } = await context.supabase
        .from("pcd_customers")
        .select("id")
        .eq("merged_into_id", payload.customerId)
        .limit(1);
      if (owns?.length) {
        return Response.json(
          { ok: false, error: "That record has contacts linked to it. Separate them first." },
          { status: 409 }
        );
      }
      const { error } = await context.supabase.from("pcd_customers").delete().eq("id", payload.customerId);
      if (error) throw error;
      return Response.json({ ok: true, deleted: true });
    }

    // ── merge ─────────────────────────────────────────────────────────────
    const { data: customers, error: readError } = await context.supabase
      .from("pcd_customers")
      .select("id, name, email, merged_into_id");
    if (readError) throw readError;

    const secondary = customers.find((c) => c.id === payload.customerId) || null;
    const primary = customers.find((c) => c.id === payload.intoId) || null;

    const problem = validateMerge({ secondary, primary, customers });
    if (problem) return Response.json({ ok: false, error: problem }, { status: 422 });

    const { error } = await context.supabase
      .from("pcd_customers")
      .update({
        merged_into_id: primary.id,
        merged_at: new Date().toISOString(),
        merged_by: context.user?.email || null,
      })
      .eq("id", secondary.id);
    if (error) throw error;

    return Response.json({
      ok: true,
      merged: { secondary: secondary.id, into: primary.id },
      // Said back, because the wording on screen should be about people rather
      // than records: nothing was moved and nothing was lost.
      note: `${secondary.name || secondary.email} now reads as a contact of ${primary.name || primary.email}. Nothing was moved, and separating them puts it straight back.`,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not do that." }, { status: 500 });
  }
}

// The duplicates worth looking at, with what each record actually holds, so the
// choice of which is the primary is made on evidence rather than on which one
// happens to be first.
export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data: customers, error } = await context.supabase
      .from("pcd_customers")
      .select("id, name, email, phone, company_name, merged_into_id, created_at");
    if (error) throw error;

    const { possibleDuplicates } = await import("../../../../../lib/pcd-customer-links");
    const groups = possibleDuplicates(customers);

    const withHistory = [];
    for (const group of groups) {
      const records = [];
      for (const record of group.records) {
        records.push({ ...record, counts: await historyFor(context.supabase, record.id) });
      }
      withHistory.push({ name: group.name, records });
    }

    // What is ALREADY linked, so it can be separated again. Without this the
    // panel would hide a pair the moment it was merged and there would be no
    // way back, which would make the whole thing a one way door.
    const linked = [];
    for (const secondary of customers.filter((c) => c.merged_into_id)) {
      const primary = customers.find((c) => c.id === secondary.merged_into_id) || null;
      linked.push({
        secondary: { ...secondary, counts: await historyFor(context.supabase, secondary.id) },
        primary,
      });
    }

    return Response.json({ ok: true, duplicates: withHistory, linked });
  } catch (error) {
    return Response.json({ ok: false, duplicates: [], error: error?.message || "Could not load." }, { status: 500 });
  }
}
