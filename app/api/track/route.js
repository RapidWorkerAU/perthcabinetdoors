// WHERE A PAGE VIEW LANDS.
//
// ── IT NEVER FAILS OUT LOUD ──────────────────────────────────────────────────
//
// Every path through this returns 204. A visitor reading the finishes page must
// never see anything go wrong because a counting table was busy, so a bad body,
// a missing salt, a database that is down and a crawler all end the same way:
// nothing said, nothing shown, a line in the server log if it was our fault.
//
// ── IT IS CALLED WITH sendBeacon ─────────────────────────────────────────────
//
// Which means the browser fires it as the page is being torn down and does not
// wait for the answer, and it arrives as text/plain rather than JSON. So the
// body is read as text and parsed by hand, and nothing here reads a cookie or a
// session, because there is neither.
//
// ── WHAT IT WILL NOT STORE ───────────────────────────────────────────────────
//
// The address and the browser string are used to work out a device, a region
// and a daily hash, and are then thrown away. Neither is written to a column.
// See lib/pcd-site-hash.js for what that hash is and is not worth.

import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { clientIp, visitorHash } from "../../../lib/pcd-site-hash";
import {
  MAX_DWELL_MS,
  channelFrom,
  deviceFrom,
  isBot,
  normalisePath,
  perthDay,
  shouldTrackPath,
} from "../../../lib/pcd-site-tracking";

export const dynamic = "force-dynamic";

// Long enough for anything real, short enough that nobody can post a novel.
const MAX_BODY = 4000;

const trim = (value, max) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

// Said once per cold start rather than once per visitor, so a missing salt is
// visible in the log without burying everything else in it.
let saltWarned = false;
function trackingSalt() {
  const salt = process.env.SITE_TRACKING_SALT;
  if (!salt && !saltWarned) {
    saltWarned = true;
    console.warn(
      "[api/track] SITE_TRACKING_SALT is not set. Visits are still counted and no address is stored, " +
        "but the daily visitor hash is guessable by anybody who knows the date and the address. Set it."
    );
  }
  return salt || "";
}

const done = () => new Response(null, { status: 204 });

export async function POST(request) {
  let body;
  try {
    const text = await request.text();
    if (!text || text.length > MAX_BODY) return done();
    body = JSON.parse(text);
  } catch {
    return done();
  }
  if (!body || typeof body !== "object") return done();

  const viewId = trim(body.v, 64);
  if (!viewId) return done();

  try {
    // ── a dwell time arriving after the page has gone ───────────────────────
    //
    // An update rather than an insert, because the row was written when the
    // page opened. If it is not there, the view was never recorded and there is
    // nothing to attach this to, which is fine and says nothing.
    if (body.t === "dwell") {
      const ms = Number(body.d);
      if (!Number.isFinite(ms) || ms <= 0) return done();
      const supabase = createSupabaseAdminClient();
      await supabase
        .from("pcd_site_events")
        .update({ dwell_ms: Math.min(Math.round(ms), MAX_DWELL_MS) })
        .eq("view_id", viewId);
      return done();
    }

    const path = normalisePath(body.p);
    if (!shouldTrackPath(path)) return done();

    const sessionId = trim(body.s, 64);
    if (!sessionId) return done();

    const headers = request.headers;
    const userAgent = headers.get("user-agent") || "";
    const day = perthDay();

    const row = {
      view_id: viewId,
      session_id: sessionId,
      visitor_hash: visitorHash({
        ip: clientIp(headers),
        userAgent,
        day,
        secret: trackingSalt(),
      }),
      path,
      referrer: trim(body.r, 500),
      channel: channelFrom({
        referrer: body.r,
        gclid: body.g,
        utmMedium: body.um,
        utmSource: body.us,
        siteHost: headers.get("host") || "",
      }),
      utm_source: trim(body.us, 120),
      utm_medium: trim(body.um, 120),
      utm_campaign: trim(body.uc, 200),
      gclid: trim(body.g, 200),
      device: deviceFrom(userAgent, body.w),
      // Vercel's own headers. City and state only, and only when it is behind
      // Vercel at all, so this is empty in development and that is correct.
      region: trim(
        [headers.get("x-vercel-ip-city"), headers.get("x-vercel-ip-country-region")].filter(Boolean).join(", "),
        120
      ),
      // Kept rather than dropped, so "how much of this was crawlers" stays an
      // answerable question instead of a silent exclusion.
      is_bot: isBot(userAgent),
    };

    const supabase = createSupabaseAdminClient();
    // Nothing on a repeat. React mounting twice in development and a beacon the
    // browser decides to retry both send the same view id, and a page view
    // counted twice is a number nobody can reconcile later.
    //
    // An upsert that ignores duplicates rather than an insert: `insert` has no
    // such option, so a repeat would come back as a unique violation and have to
    // be recognised by its error code, which is a thing to get wrong later.
    const { error } = await supabase
      .from("pcd_site_events")
      .upsert(row, { onConflict: "view_id", ignoreDuplicates: true });
    if (error) console.error(`[api/track] could not record a view: ${error.message}`);
  } catch (error) {
    console.error(`[api/track] ${error?.message || error}`);
  }

  return done();
}
