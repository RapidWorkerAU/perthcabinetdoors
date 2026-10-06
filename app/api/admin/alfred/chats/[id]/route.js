import { requireAdminApiContext } from "../../../../../../lib/admin-api";

// One of Ask Alfred's chats.
//
//   GET     the chat with its turns
//   PUT     replace its turns as the page now shows them: { turns }
//   DELETE  remove it from the list. What was sent or changed stays recorded
//           where it always is; only the chat goes.

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  const { data, error } = await context.supabase.from("pcd_alfred_chats").select("*").eq("id", id).maybeSingle();
  if (error || !data) return Response.json({ ok: false, error: "That chat no longer exists." }, { status: 404 });
  return Response.json({ ok: true, chat: data });
}

export async function PUT(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.turns)) return Response.json({ ok: false, error: "No turns." }, { status: 400 });
  const { error } = await context.supabase
    .from("pcd_alfred_chats")
    .update({ turns: body.turns.slice(-60), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  const { error } = await context.supabase.from("pcd_alfred_chats").delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
