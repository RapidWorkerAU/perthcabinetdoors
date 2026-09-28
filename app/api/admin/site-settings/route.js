// The website's settings: whether the shop is open, the shop lead time, and the
// banner and notices. Read and saved from Settings > Shop and Site Messages.
// One row, cleaned both ways by lib/pcd-site-settings.js.

import { requireAdminApiContext } from "../../../../lib/admin-api";
import { getSiteSettings, saveSiteSettings } from "../../../../lib/pcd-site-settings-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const result = await getSiteSettings(context.supabase);
  return Response.json({ ok: true, ...result });
}

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const payload = await request.json();
    const result = await saveSiteSettings(context.supabase, payload?.settings || {});
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save the website settings." }, { status: 500 });
  }
}
