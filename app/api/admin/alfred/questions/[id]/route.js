import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { answerQuestion } from "../../../../../../lib/pcd-alfred-drafts";

// A person answers one of Alfred's questions. Alfred then drafts from the
// answer, and the draft waits for approval like any other.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(await answerQuestion(context.supabase, id, { answeredBy: body.answeredBy, answer: body.answer }));
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save the answer." }, { status: error?.status || 500 });
  }
}
