import { requireAdminApiContext } from "../../../../lib/admin-api";
import { getBusinessDefaults, upsertBusinessDefaults } from "../../../../lib/pcd-business-defaults";
import { gstRateProblem } from "../../../../lib/pcd-quote-utils";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const defaults = await getBusinessDefaults(context.supabase);
    return Response.json({ ok: true, defaults });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load business defaults." }, { status: 500 });
  }
}

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const sent = payload.defaults || payload;

    // Refused here, not only in the browser. A rate of 0 prices every quote in
    // the system with no GST and says nothing about it; a rate of 10 charges a
    // thousand percent. See gstRateProblem, which the settings screen shows
    // from as it is typed so the two cannot disagree.
    const gstFault = gstRateProblem(sent.gst_rate);
    if (gstFault) {
      return Response.json({ ok: false, error: gstFault.message }, { status: 400 });
    }

    const defaults = await upsertBusinessDefaults(context.supabase, sent);
    return Response.json({ ok: true, defaults });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save business defaults." }, { status: 500 });
  }
}
