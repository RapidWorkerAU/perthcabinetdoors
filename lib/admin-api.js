import { getAllowedAdminEmailServer } from "./admin-access";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Is the caller the signed-in admin? Returns a boolean instead of a 401, for
 * routes that serve BOTH the website and the admin and only need to decide how
 * much to include in the response (our board costs, for one).
 */
export async function isAdminRequest() {
  try {
    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser();
    if (error || !user) return false;
    return (user.email?.toLowerCase() || "") === getAllowedAdminEmailServer();
  } catch {
    return false;
  }
}

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
