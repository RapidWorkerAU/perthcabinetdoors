import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { closureNote, validateClosure, closureReasonLabel } from "../../../../../../lib/pcd-ticket-closure";

async function ticketIdFromParams(params) {
  const resolved = await params;
  return resolved?.ticketId;
}

async function agentIdFor(supabase, email) {
  if (!email) return null;
  const { data } = await supabase.from("pcd_agents").select("id, name").ilike("login_email", email).maybeSingle();
  return data || null;
}

// Closing draws a line in time. It is NOT a dismissal: lib/pcd-desk-sync.js
// sets a ticket back to open on any inbound message, so the same customer
// writing next month brings the conversation straight back onto the board.
export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const ticketId = await ticketIdFromParams(params);
    const payload = await request.json();

    const errors = validateClosure(payload);
    if (Object.keys(errors).length) {
      return Response.json({ ok: false, error: "Say why it is being closed.", fieldErrors: errors }, { status: 422 });
    }

    const { data: ticket } = await context.supabase
      .from("pcd_tickets")
      .select("id, customer_id, status, subject")
      .eq("id", ticketId)
      .maybeSingle();
    if (!ticket) {
      return Response.json({ ok: false, error: "Conversation not found." }, { status: 404 });
    }

    const agent = await agentIdFor(context.supabase, context.user?.email);
    const words = closureNote(payload.reason, payload.detail);

    // The note goes on the thread first. If the status write failed after it,
    // the worst case is a conversation that says it was closed and is not,
    // which somebody can see and fix. The other way round leaves a closed
    // conversation with no record of who closed it or why.
    const { error: noteError } = await context.supabase.from("pcd_messages").insert({
      ticket_id: ticket.id,
      customer_id: ticket.customer_id,
      direction: "note",
      note_kind: "closure",
      agent_id: agent?.id || null,
      subject: `Closed: ${closureReasonLabel(payload.reason)}`,
      body_html: `<p>${words}</p>`,
      body_text: words,
    });
    if (noteError) throw noteError;

    const { error: statusError } = await context.supabase
      .from("pcd_tickets")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", ticket.id);
    if (statusError) throw statusError;

    return Response.json({ ok: true, closed: true, note: words });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not close the conversation." }, { status: 500 });
  }
}
