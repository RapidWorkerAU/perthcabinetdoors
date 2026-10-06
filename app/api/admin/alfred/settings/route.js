import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { getAlfredSettings, saveAlfredSettings } from "../../../../../lib/pcd-alfred-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const result = await getAlfredSettings(context.supabase);
  return Response.json({ ok: result.available, ...result });
}

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const body = await request.json();
    const settings = await saveAlfredSettings(context.supabase, body.settings || body);
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save Alfred's settings." }, { status: 500 });
  }
}
