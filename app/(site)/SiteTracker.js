"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { shouldTrackPath } from "@/lib/pcd-site-tracking";

// COUNTING A PAGE VIEW, FROM THE BROWSER.
//
// ── WHY THIS AND NOT THE MIDDLEWARE ──────────────────────────────────────────
//
// The middleware sees every request, which sounds like the better place until
// you want two things it cannot give you. It cannot tell how long somebody
// stayed, because it is gone before the page is drawn. And it runs on the edge
// in front of every request, so writing a row there would put a database call
// in the way of the site loading for everybody.
//
// ── WHAT IT SENDS ────────────────────────────────────────────────────────────
//
// Two small messages per page. One when the page opens, one when it is left,
// carrying how long the page was actually VISIBLE. Not how long the tab was
// open: a tab left behind for an hour would otherwise report an hour of
// reading, and the median stay would become a number about how people manage
// their tabs.
//
// ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────────
//
// It stores nothing on the visitor's machine that survives the tab closing,
// reads no cookie, and sends nothing that identifies anybody. The session id is
// a random string in sessionStorage that dies with the tab. That is the whole
// reason no consent banner is needed.

const ENDPOINT = "/api/track";
const KEY = "pcd.site.session";

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* falls through to the string below */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The id for this tab's visit.
 *
 * Every read and write is wrapped, because storage throws outright in a few
 * contexts: a private window with site data blocked, an iframe, a browser set
 * to refuse it. A counting script must never be the reason a page fails to
 * render, so a failure just means this view is counted as its own session.
 */
function sessionId() {
  try {
    const held = sessionStorage.getItem(KEY);
    if (held) return held;
    const made = randomId();
    sessionStorage.setItem(KEY, made);
    return made;
  } catch {
    return randomId();
  }
}

/** sendBeacon where it exists, because it survives the page being torn down. */
function send(payload) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
      return;
    }
  } catch {
    /* falls through to fetch */
  }
  try {
    fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } });
  } catch {
    /* nothing to do, and nothing worth telling the visitor */
  }
}

export default function SiteTracker() {
  const pathname = usePathname();
  const view = useRef(null);

  useEffect(() => {
    if (!pathname || !shouldTrackPath(pathname)) return undefined;

    const id = randomId();
    const params = new URLSearchParams(window.location.search);

    view.current = { id, visibleMs: 0, since: document.visibilityState === "visible" ? Date.now() : null, sent: false };

    send({
      t: "view",
      v: id,
      s: sessionId(),
      p: pathname,
      // The page that linked here. Empty on a typed address, on a bookmark, and
      // on any move inside the site after the first page.
      r: document.referrer || "",
      w: window.innerWidth,
      g: params.get("gclid") || "",
      us: params.get("utm_source") || "",
      um: params.get("utm_medium") || "",
      uc: params.get("utm_campaign") || "",
    });

    // Only the time the page was actually on screen. Switching tabs stops the
    // clock; coming back starts it again.
    function stopClock() {
      const current = view.current;
      if (!current || current.since === null) return;
      current.visibleMs += Date.now() - current.since;
      current.since = null;
    }
    function startClock() {
      const current = view.current;
      if (current && current.since === null) current.since = Date.now();
    }

    function report() {
      const current = view.current;
      if (!current || current.sent) return;
      stopClock();
      if (current.visibleMs < 500) return;   // a flicker, not a read
      current.sent = true;
      send({ t: "dwell", v: current.id, d: Math.round(current.visibleMs) });
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        // Reported here rather than only on unload, because a phone being
        // locked or the app being switched away from often never fires pagehide
        // at all. This is the send that actually arrives on a phone.
        report();
      } else {
        startClock();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", report);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", report);
      // Moving to another page inside the site ends this view too, and this is
      // the only place that gets told about it.
      report();
    };
  }, [pathname]);

  return null;
}
