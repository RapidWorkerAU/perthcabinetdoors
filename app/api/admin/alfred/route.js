import { requireAdminApiContext } from "../../../../lib/admin-api";
import { alfredUsage, getAlfredSettings } from "../../../../lib/pcd-alfred-settings";

// What the Alfred page needs before the chat opens: his settings and where the
// monthly limit stands.

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const supabase = context.supabase;

  try {
    const { settings, available, error: settingsError } = await getAlfredSettings(supabase);
    if (!available) return Response.json({ ok: false, setup: true, error: settingsError }, { status: 503 });
    return Response.json({ ok: true, settings, usage: await alfredUsage(supabase) });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load Alfred." }, { status: 500 });
  }
}
