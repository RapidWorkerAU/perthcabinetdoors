import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { rateLimit, tooManyAttempts } from "../../../../lib/pcd-rate-limit";

export async function POST(request) {
  try {
    // GUESSING AT AN ACCESS CODE HAS TO COST SOMETHING.
    // See lib/pcd-rate-limit.js. Fails open and shouts if it cannot count.
    const limited = await rateLimit(request, "lookup");
    if (!limited.allowed) return tooManyAttempts(limited.retryAfterSeconds);

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
    // OUR WORDING, NOT THE DATABASE'S. The real error goes to the log, where
    // it is useful; the customer gets a sentence they can act on. Anything
    // this route genuinely means them to read is returned further up with its
    // own status, not thrown.
    console.error("[quote-workflow/validate]", error?.message || error);
    return Response.json(
      {
        ok: false,
        error:
          "We could not check this quote just now. Please try again in a few minutes.",
      },
      { status: 500 }
    );
  }
}
