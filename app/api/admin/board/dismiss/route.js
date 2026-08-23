import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { dismissNote, dismissReasonLabel, validateDismissal } from "../../../../../lib/pcd-board-dismissal";

async function agentFor(supabase, email) {
  if (!email) return null;
  const { data } = await supabase.from("pcd_agents").select("id, name").ilike("login_email", email).maybeSingle();
  return data || null;
}

// The card is set aside AND the reason is written where a person will find it
// later. A card that vanished with no trace would be worse than one that never
// went away: nobody could tell whether it had been dealt with or lost.
//
// Where the note goes depends on what the card is about. A customer gets it on
// their newest conversation, beside everything else that happened with them. An
// order gets it on the order's own activity. A card about neither is still set
// aside; it just has nowhere narrative to write to.
async function recordTheReason(supabase, { subjectType, subjectId, words, reason, agent }) {
  if (subjectType === "customer") {
    const { data: ticket } = await supabase
      .from("pcd_tickets")
      .select("id, customer_id")
      .eq("customer_id", subjectId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ticket) return false;
    const { error } = await supabase.from("pcd_messages").insert({
      ticket_id: ticket.id,
      customer_id: ticket.customer_id,
      direction: "note",
      note_kind: "board",
      agent_id: agent?.id || null,
      subject: `Set aside: ${dismissReasonLabel(reason)}`,
      body_html: `<p>${words}</p>`,
      body_text: words,
    });
    return !error;
  }

  if (["order", "payment", "variation"].includes(subjectType)) {
    // A payment or a variation belongs to an order, and that is where somebody
    // reading the job's history will look.
    let orderId = subjectId;
    if (subjectType === "payment") {
      const { data } = await supabase.from("pcd_order_payments").select("order_id").eq("id", subjectId).maybeSingle();
      orderId = data?.order_id || null;
    }
    if (subjectType === "variation") {
      const { data } = await supabase.from("pcd_order_variations").select("order_id").eq("id", subjectId).maybeSingle();
      orderId = data?.order_id || null;
    }
    if (!orderId) return false;
    const { logOrderActivity } = await import("../../../../../lib/pcd-activity-log");
    await logOrderActivity(supabase, {
      order_id: orderId,
      actor_type: "admin",
      action_type: "board_card_set_aside",
      title: `Set aside: ${dismissReasonLabel(reason)}`,
      description: words,
    });
    return true;
  }

  return false;
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();

    if (payload?.restore) {
      const { error } = await context.supabase
        .from("pcd_board_dismissals")
        .delete()
        .eq("cat", payload.cat)
        .eq("subject_id", payload.subjectId);
      if (error) throw error;
      return Response.json({ ok: true, restored: true });
    }

    const errors = validateDismissal(payload);
    if (Object.keys(errors).length) {
      return Response.json(
        { ok: false, error: "Say why it is being set aside.", fieldErrors: errors },
        { status: 422 }
      );
    }

    const agent = await agentFor(context.supabase, context.user?.email);
    const words = dismissNote(payload.label, payload.reason, payload.detail);

    // The mark. A card with no clock of its own is stamped with now, so it stays
    // set aside until somebody puts it back rather than reappearing at once.
    const seenStamp = payload.stamp || new Date().toISOString();

    const { error } = await context.supabase.from("pcd_board_dismissals").upsert(
      {
        cat: String(payload.cat),
        subject_type: String(payload.subjectType || "unknown"),
        subject_id: String(payload.subjectId),
        reason: String(payload.reason),
        detail: String(payload.detail || "").trim() || null,
        seen_stamp: seenStamp,
        dismissed_at: new Date().toISOString(),
        dismissed_by: context.user?.email || null,
      },
      { onConflict: "cat,subject_id" }
    );
    if (error) throw error;

    const logged = await recordTheReason(context.supabase, {
      subjectType: payload.subjectType,
      subjectId: payload.subjectId,
      words,
      reason: payload.reason,
      agent,
    });

    return Response.json({ ok: true, note: words, logged });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not set the card aside." },
      { status: 500 }
    );
  }
}
