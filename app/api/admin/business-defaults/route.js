import { requireAdminApiContext } from "../../../../lib/admin-api";
import { getBusinessDefaults, upsertBusinessDefaults } from "../../../../lib/pcd-business-defaults";

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
    const defaults = await upsertBusinessDefaults(context.supabase, payload.defaults || payload);
    return Response.json({ ok: true, defaults });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save business defaults." }, { status: 500 });
  }
}
