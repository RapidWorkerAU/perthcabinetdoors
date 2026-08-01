import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "colour-tiles";

function cleanPath(value) {
  const path = String(value || "").trim();
  if (!path || path.startsWith("/") || path.includes("..")) return "";
  return path;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
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
      "Cache-Control": "public, max-age=21600, stale-while-revalidate=86400",
    },
  });
}
