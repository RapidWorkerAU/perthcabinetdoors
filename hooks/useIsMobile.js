"use client";

import { useEffect, useState } from "react";

/**
 * True when the viewport is narrower than `breakpoint` (px).
 *
 * SSR-safe: renders `false` on the server and the first client paint, then
 * corrects after mount so we never read `window` during render. The default
 * 1280 matches the desktop design tool's `min-width:1280px` — below that the
 * desktop 3-pane layout can't lay out, so we hand off to the mobile shell.
 */
export default function useIsMobile(breakpoint = 1280) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
