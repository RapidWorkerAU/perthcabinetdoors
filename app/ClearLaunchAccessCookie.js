"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ClearLaunchAccessCookie() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === "/launch" || pathname.startsWith("/admin")) {
      return;
    }

    fetch("/api/launch-access", {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
