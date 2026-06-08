import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;
const LAUNCH_GATE_ACTIVE = false;

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
    pathname === "/api/enquiries" ||
    pathname.startsWith("/quotes") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/css") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  );
}

export function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (!LAUNCH_GATE_ACTIVE) {
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
