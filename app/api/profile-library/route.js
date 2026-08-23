// THE PROFILE LIBRARY, read by both the website and the admin.
//
// The public quote form needs it to answer three questions, in this order:
// which suppliers do we sell, which door profiles does the chosen one make, and
// does it make edge profiles at all. Choosing the supplier first is what stops
// somebody putting a Laminex colour on a Polytec profile.
//
// ── WHAT IS AND IS NOT SENT ──────────────────────────────────────────────────
//
// Everything here is already public: a name, a category, a photo and which board
// it can be routed into. Unlike the colour library there is no cost on these
// rows, so nothing has to be stripped.
//
// Retired profiles are filtered out for everyone, not by RLS alone. The row
// level policy already hides inactive rows from an anon reader, but the ADMIN
// reads this endpoint too and is allowed to see them, so the filter is applied
// here as well: a retired profile must never be offered on a new quote, whoever
// is filling it in.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { normaliseSupplierName } from "../../../lib/pcd-colour-library";
import { getProfileLibraryRows } from "../../../lib/pcd-profile-library";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    const supabase = await createSupabaseServerClient();

    // Thrown, not swallowed. A quote form that silently offers no profiles looks
    // exactly like a supplier that makes none, and the caller has to be able to
    // tell those apart. See the profile library page for the same reasoning.
    const rows = await getProfileLibraryRows(supabase, {
      throwOnError: true,
      kind: kind === "door" || kind === "edge" ? kind : null,
    });

    const active = rows.filter((row) => row.is_active !== false);

    return NextResponse.json({
      ok: true,
      profiles: active.map((row) => ({
        id: row.id,
        kind: row.kind || "door",
        supplier: normaliseSupplierName(row.supplier_name),
        category: row.category || "",
        name: row.name || "",
        imageUrl: row.image_url || "",
        available18mm: row.available_18mm !== false,
        available21mm: row.available_21mm !== false,
      })),
    });
  } catch (error) {
    // An empty list and a failed read look identical to a picker, so this says
    // which it is rather than returning [] and letting the form conclude the
    // catalogue is empty.
    return NextResponse.json(
      { ok: false, error: error?.message || "Could not read the profile library.", profiles: [] },
      { status: 500 }
    );
  }
}
