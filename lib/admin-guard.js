import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { getAllowedAdminEmailServer } from "./admin-access";

export async function requireAdminSession() {
  const supabase = await createSupabaseServerClient();

  // Validate against Auth server (not cookie-only session data)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const allowedAdminEmail = getAllowedAdminEmailServer();
  const userEmail = user?.email?.toLowerCase() || "";

  if (error) {
    redirect("/admin?authError=session");
  }

  if (!user) {
    redirect("/admin?authError=missing");
  }

  if (userEmail !== allowedAdminEmail) {
    redirect("/admin?authError=unauthorized");
  }

  return { user, allowedAdminEmail };
}
