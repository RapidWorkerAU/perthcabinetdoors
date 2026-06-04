import { getAllowedAdminEmailServer } from "./admin-access";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

export async function requireAdminApiContext() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  const allowedAdminEmail = getAllowedAdminEmailServer();
  const userEmail = user?.email?.toLowerCase() || "";

  if (error || !user || userEmail !== allowedAdminEmail) {
    return {
      error: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    return {
      user,
      supabase: createSupabaseAdminClient(),
    };
  } catch (setupError) {
    return {
      error: Response.json(
        { ok: false, error: setupError?.message || "Admin API is not configured." },
        { status: 500 }
      ),
    };
  }
}
