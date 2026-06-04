import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function POST(request) {
  try {
    const { code } = await request.json();
    const accessCode = String(code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    if (!accessCode) {
      return Response.json({ ok: false, error: "Enter your access code." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("pcd_quotes")
      .select("id,status")
      .eq("access_code", accessCode)
      .maybeSingle();

    if (error || !data) {
      return Response.json({ ok: false, error: "We could not validate that code." }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not validate quote." }, { status: 500 });
  }
}
