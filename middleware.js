import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

function clearLaunchAccessCookie(response) {
  response.cookies.set("pcd_launch_access", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

function isBypassedPath(pathname) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/api/launch-access" ||
    pathname === "/api/enquiries" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/css") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  );
}

export function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (isBypassedPath(pathname)) {
    return NextResponse.next();
  }

  const hasLaunchAccess = request.cookies.get("pcd_launch_access")?.value === "granted";

  if (pathname === "/launch") {
    if (hasLaunchAccess) {
      const nextPath = request.nextUrl.searchParams.get("next") || "/";
      return clearLaunchAccessCookie(NextResponse.redirect(new URL(nextPath, request.url)));
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

  return clearLaunchAccessCookie(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
