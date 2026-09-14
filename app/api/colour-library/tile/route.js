import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { allowedTileUrl } from "../../../../lib/pcd-colour-tiles";

export const dynamic = "force-dynamic";

const BUCKET = "colour-tiles";

function cleanPath(value) {
  const path = String(value || "").trim();
  if (!path || path.startsWith("/") || path.includes("..")) return "";
  return path;
}

const TILE_CACHE = "public, max-age=21600, stale-while-revalidate=86400";

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // A tile linked to a supplier's site, fetched and re-served from here so it
  // reaches a WebGL texture the same way an uploaded one does.
  const remote = allowedTileUrl(searchParams.get("url"));
  if (remote) {
    let upstream;
    try { upstream = await fetch(remote); } catch { upstream = null; }
    const type = upstream?.headers.get("content-type") || "";
    // A row whose "picture" is really a product page is a broken row, not an
    // image, and passing the HTML through would only fail further down.
    if (!upstream?.ok || !type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "Tile could not be fetched." }, { status: 404 });
    }
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: { "Content-Type": type, "Cache-Control": TILE_CACHE },
    });
  }

  const path = cleanPath(searchParams.get("path"));
  if (!path) {
    return NextResponse.json({ ok: false, error: "Missing tile path." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch {
    supabase = await createSupabaseServerClient();
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Tile not found." }, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": data.type || "image/jpeg",
      "Cache-Control": TILE_CACHE,
    },
  });
}
