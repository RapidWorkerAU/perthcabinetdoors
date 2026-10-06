import { requireAdminApiContext } from "../../../../lib/admin-api";
import { alfredWaitingBy } from "../../../../lib/pcd-alfred-dots";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_enquiries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, enquiries: data || [], alfredWaiting: await alfredWaitingBy(context.supabase, "enquiry_id", { questionPrefix: "enquiry:" }) });
  } catch (error) {
    return Response.json({ ok: false, enquiries: [], setupRequired: true, error: error?.message || "Could not load enquiries." });
  }
}

