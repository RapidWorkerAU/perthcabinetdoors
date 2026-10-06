import { requireAdminApiContext } from "@/lib/admin-api";
import { sendDeskReply } from "@/lib/pcd-desk-reply";

// Replying to a customer, and writing internal notes.
//
// The work is in lib/pcd-desk-reply.js, shared with Alfred's approve button, so
// there is one way to email a customer from the desk. This route only reads the
// request and says what happened.

export const dynamic = "force-dynamic";

async function customerIdFrom(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.customerId;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const customerId = await customerIdFrom(params);
  const body = await request.json().catch(() => ({}));

  try {
    const result = await sendDeskReply(context.supabase, {
      customerId,
      kind: body.kind === "note" ? "note" : "reply",
      bodyHtml: body.body_html || "",
      subject: body.subject,
      ticketId: body.ticket_id,
      newTicket: body.new_ticket,
      agentEmail: context.user?.email || "",
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save that." }, { status: error?.status || 500 });
  }
}
