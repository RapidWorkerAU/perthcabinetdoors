"use client";

// LOADING THE PROFILE LIBRARY, once, for whichever screen needs it.
//
// The public quote form, the quote editor and the variation editor all ask the
// same three questions of the same rows. One hook so they cannot drift into
// fetching differently, caching differently, or disagreeing about what an empty
// result means.
//
// ── WHY `status` AND NOT JUST A LIST ─────────────────────────────────────────
//
// An empty list is ambiguous and the ambiguity is dangerous here. "Laminex makes
// no edge profiles" and "the library could not be read" both arrive as zero
// rows, and a form that treats the second as the first hides a field that should
// have been there, quietly, with nothing on screen to say so.
//
// So callers get "loading", "ready" or "failed", and only "ready" means an empty
// list is a real answer about the catalogue.

import { useEffect, useState } from "react";

export function useProfileLibrary() {
  const [profiles, setProfiles] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/profile-library", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setStatus("failed");
          setError(payload?.error || "Could not load the profile library.");
          setProfiles([]);
          return;
        }
        setProfiles(payload.profiles || []);
        setStatus("ready");
      } catch (thrown) {
        if (cancelled) return;
        setStatus("failed");
        setError(thrown?.message || "Could not reach the profile library.");
        setProfiles([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { profiles, status, error, isReady: status === "ready", hasFailed: status === "failed" };
}

/**
 * The rows in the shape lib/pcd-supplier-selection.js expects.
 *
 * That module works on library rows with snake_case column names, because it
 * also runs on the server against rows straight out of the table. The API
 * returns camelCase for the browser. Converted in one place rather than each
 * screen remembering which shape it has.
 */
export function asSelectionRows(profiles = []) {
  return (profiles || []).map((profile) => ({
    kind: profile.kind,
    supplier_name: profile.supplier,
    category: profile.category,
    name: profile.name,
    image_url: profile.imageUrl,
    available_18mm: profile.available18mm,
    available_21mm: profile.available21mm,
    is_active: true,
  }));
}
