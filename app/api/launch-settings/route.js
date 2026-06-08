import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import {
  DEFAULT_LAUNCH_SETTINGS,
  getLaunchSettingsFromSupabase,
} from "../../../lib/launch-settings";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const settings = await getLaunchSettingsFromSupabase(supabase);
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json({
      ok: true,
      settings: DEFAULT_LAUNCH_SETTINGS,
      fallback: true,
      error: error?.message || "Launch settings are using defaults.",
    });
  }
}
