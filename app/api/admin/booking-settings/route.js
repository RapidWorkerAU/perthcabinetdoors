// The settings behind the public site measure booking page.
//
// One row, read and written whole. Everything is normalised on the way in and
// on the way out by lib/pcd-booking-settings.js, so a bad window or a nonsense
// cap cannot reach the website through this route.

import { requireAdminApiContext } from "../../../../lib/admin-api";
import { getBookingSettings, saveBookingSettings } from "../../../../lib/pcd-booking-store";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const settings = await getBookingSettings(context.supabase);
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load the booking settings." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();

    // SAID OUT LOUD RATHER THAN CORRECTED. normalizeBookingSettings shuts a day
    // whose window closes before it opens, which is right, but a settings screen
    // that silently turns Tuesday off is a settings screen nobody trusts. So the
    // save is refused and the box is named.
    const backwards = Object.entries(payload?.days || {})
      .filter(([, value]) => value?.open && String(value.to || "") <= String(value.from || ""))
      .map(([key]) => key);
    if (backwards.length) {
      return Response.json(
        {
          ok: false,
          error: `The window closes before it opens on ${backwards.join(", ")}. Fix the times or close the day.`,
        },
        { status: 400 }
      );
    }

    const settings = await saveBookingSettings(context.supabase, payload);
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save the booking settings." },
      { status: 500 }
    );
  }
}
