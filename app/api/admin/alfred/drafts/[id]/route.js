import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { approveDraft, declineDraft } from "../../../../../../lib/pcd-alfred-drafts";

// The two things a person does with a draft: approve it (it is sent, through
// the same steps as a desk reply) or decline it with a reason. There is no
// third. Nothing Alfred prepares goes anywhere without one of these.

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === "approve") {
      const result = await approveDraft(context.supabase, id, {
        approvedBy: body.approvedBy,
        bodyText: body.bodyText,
        agentEmail: context.user?.email || "",
      });
      return Response.json(result);
    }
    if (body.action === "decline") {
      return Response.json(await declineDraft(context.supabase, id, { declinedBy: body.approvedBy, reason: body.reason }));
    }
    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not do that." }, { status: error?.status || 500 });
  }
}
