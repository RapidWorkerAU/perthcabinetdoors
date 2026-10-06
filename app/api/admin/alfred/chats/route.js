import { requireAdminApiContext } from "../../../../../lib/admin-api";

// ASK ALFRED'S CHATS: one shared list, newest first.
//
//   GET   the latest 40, without their turns
//   POST  start a chat: { title, turns, startedBy }

export const dynamic = "force-dynamic";

const SETUP = "Chats are not kept yet. Run supabase/202610061800_pcd_alfred_chats.sql.";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { data, error } = await context.supabase
    .from("pcd_alfred_chats")
    .select("id, title, started_by, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) return Response.json({ ok: false, setup: true, error: SETUP, chats: [] });
  return Response.json({ ok: true, chats: data || [] });
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));
  const { data, error } = await context.supabase
    .from("pcd_alfred_chats")
    .insert({
      title: String(body.title || "").trim().slice(0, 120) || "Chat",
      turns: Array.isArray(body.turns) ? body.turns.slice(-60) : [],
      started_by: String(body.startedBy || "").trim() || null,
    })
    .select("id, title, started_by, created_at, updated_at")
    .single();
  if (error) return Response.json({ ok: false, setup: true, error: SETUP });
  return Response.json({ ok: true, chat: data });
}
