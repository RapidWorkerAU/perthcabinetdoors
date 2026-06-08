import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;
const LAUNCH_SETTINGS_ID = "main";

function isBypassedPath(pathname) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/api/colour-library" ||
    pathname === "/api/quote" ||
    pathname === "/api/quote-config" ||
    pathname === "/api/quote-requests" ||
    pathname.startsWith("/api/quote-workflow") ||
    pathname === "/api/launch-access" ||
    pathname === "/api/launch-settings" ||
    pathname === "/api/enquiries" ||
    pathname.startsWith("/quotes") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/css") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  );
}

async function isLaunchGateActive() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return false;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/pcd_launch_settings?id=eq.${LAUNCH_SETTINGS_ID}&select=is_active,live_at`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return false;
    }

    const rows = await response.json();
    const settings = rows?.[0];
    if (settings?.is_active !== true) {
      return false;
    }

    const liveAt = settings.live_at ? new Date(settings.live_at).getTime() : Number.NaN;
    if (Number.isNaN(liveAt)) {
      return true;
    }

    return Date.now() < liveAt;
  } catch {
    return false;
  }
}

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  const launchGateActive = await isLaunchGateActive();

  if (!launchGateActive) {
    return NextResponse.next();
  }

  if (isBypassedPath(pathname)) {
    return NextResponse.next();
  }

  const hasLaunchAccess = request.cookies.get("pcd_launch_access")?.value === "granted";

  if (pathname === "/launch") {
    if (hasLaunchAccess) {
      const nextPath = request.nextUrl.searchParams.get("next") || "/";
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
    return NextResponse.next();
  }

  if (!hasLaunchAccess) {
    const launchUrl = request.nextUrl.clone();
    launchUrl.pathname = "/launch";
    launchUrl.search = "";
    launchUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(launchUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
