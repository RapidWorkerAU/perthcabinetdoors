import { requireAdminApiContext } from "../../../../lib/admin-api";
import {
  dbRowToLaunchSettings,
  getLaunchSettingsFromSupabase,
  launchSettingsToDbRow,
  normalizeLaunchSettings,
} from "../../../../lib/launch-settings";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const settings = await getLaunchSettingsFromSupabase(context.supabase);
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load launch settings." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const settings = normalizeLaunchSettings(payload?.settings || payload || {});
    const row = {
      ...launchSettingsToDbRow(settings),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await context.supabase
      .from("pcd_launch_settings")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return Response.json({ ok: true, settings: dbRowToLaunchSettings(data) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save launch settings." },
      { status: 500 }
    );
  }
}
