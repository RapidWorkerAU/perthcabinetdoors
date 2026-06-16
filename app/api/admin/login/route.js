import { getAllowedAdminEmailServer } from "../../../../lib/admin-access";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function POST(request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return Response.json(
      { ok: false, error: "Admin login is not configured. Supabase environment variables are missing." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Enter your admin password." }, { status: 400 });
  }

  const password = String(body?.password || "");
  if (!password) {
    return Response.json({ ok: false, error: "Enter your admin password." }, { status: 400 });
  }

  const allowedAdminEmail = getAllowedAdminEmailServer();
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: allowedAdminEmail,
      password,
    });

    if (error) {
      return Response.json({ ok: false, error: authErrorMessage(error) }, { status: 401 });
    }

    const signedInEmail = data?.user?.email?.toLowerCase() || "";
    if (signedInEmail !== allowedAdminEmail) {
      await supabase.auth.signOut();
      return Response.json({ ok: false, error: "This account is not authorized for admin access." }, { status: 403 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          "The server could not reach the login service. Please try again, or check whether Supabase is reachable from the hosting environment.",
      },
      { status: 502 }
    );
  }
}

function authErrorMessage(error) {
  const message = error?.message || "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (lowerMessage.includes("email not confirmed")) {
    return "This admin account has not confirmed its email address yet.";
  }

  if (lowerMessage.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (lowerMessage.includes("failed to fetch") || lowerMessage.includes("fetch failed")) {
    return "The login service could not be reached. Please try again from this site connection.";
  }

  return message || "Login failed. Please try again.";
}
