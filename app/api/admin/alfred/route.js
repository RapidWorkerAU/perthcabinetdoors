import { requireAdminApiContext } from "../../../../lib/admin-api";
import { getAlfredSettings } from "../../../../lib/pcd-alfred-settings";
import { alfredUsage } from "../../../../lib/pcd-alfred-drafts";

// Everything the Alfred page shows, in one read: what is waiting, his
// questions, what he did, and where the limits stand.

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const supabase = context.supabase;

  try {
    const { settings, available, error: settingsError } = await getAlfredSettings(supabase);
    if (!available) return Response.json({ ok: false, setup: true, error: settingsError }, { status: 503 });

    const [waiting, decided, questions, runs, usage] = await Promise.all([
      supabase.from("pcd_alfred_drafts").select("*").eq("status", "waiting").order("created_at", { ascending: true }),
      supabase.from("pcd_alfred_drafts").select("*").neq("status", "waiting").order("updated_at", { ascending: false }).limit(100),
      supabase.from("pcd_alfred_questions").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("pcd_alfred_runs").select("*").order("started_at", { ascending: false }).limit(20),
      alfredUsage(supabase),
    ]);
    const failed = [waiting, decided, questions, runs].find((r) => r.error);
    if (failed) throw failed.error;

    // Names to show beside each row, read once.
    const rows = [...(waiting.data || []), ...(decided.data || []), ...(questions.data || [])];
    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
    const [{ data: customers }, { data: orders }] = await Promise.all([
      customerIds.length ? supabase.from("pcd_customers").select("id, name, email").in("id", customerIds) : Promise.resolve({ data: [] }),
      orderIds.length ? supabase.from("pcd_orders").select("id, order_number").in("id", orderIds) : Promise.resolve({ data: [] }),
    ]);

    return Response.json({
      ok: true,
      settings,
      usage,
      waiting: waiting.data || [],
      decided: decided.data || [],
      questions: questions.data || [],
      runs: runs.data || [],
      customers: customers || [],
      orders: orders || [],
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load Alfred." }, { status: 500 });
  }
}
