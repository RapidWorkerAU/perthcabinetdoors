import { Resend } from "resend";
import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { SALES_EMAIL, customerUpdateHtml } from "../../../../../../lib/pcd-email-templates";
import { sendEmail } from "../../../../../../lib/pcd-send-email";
import { UPDATE_SENT_ACTION } from "../../../../../../lib/pcd-weekly-updates";

// SENDING AN UPDATE. Always because somebody pressed the button.
//
// There is no schedule behind this and there must not be one. The report says
// who has had something happen; a person reads it, opens the email, edits it if
// it needs it and sends. That review step is what keeps a machine from telling
// a customer their doors are finished on the morning we found a problem.
//
// WHAT GOES OUT IS WHAT WAS ON SCREEN. The body is taken from the request, not
// rebuilt here, because it may have been edited. Rebuilding it would quietly
// discard whatever was typed and send something nobody read.
//
// IT IS RECORDED AGAINST THE CUSTOMER. One activity row, so the desk timeline
// shows it, the report can show "sent", and the next email knows where to start
// from. That row IS the record: nothing is stored on the customer, so there is
// no second copy to fall out of step.

export const dynamic = "force-dynamic";

const MAX_SUBJECT = 200;
const MAX_BODY = 20000;

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json().catch(() => ({}));
    const email = String(payload.email || "").trim();
    const subject = String(payload.subject || "").trim();
    const body = String(payload.body || "").trim();
    const customerId = payload.customer_id || null;
    const customerName = String(payload.customer_name || "").trim();
    const orders = Array.isArray(payload.orders) ? payload.orders : [];

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Response.json({ ok: false, error: "That customer has no usable email address." }, { status: 400 });
    }
    if (!subject || subject.length > MAX_SUBJECT) {
      return Response.json({ ok: false, error: "Give the email a subject." }, { status: 400 });
    }
    if (!body || body.length > MAX_BODY) {
      return Response.json({ ok: false, error: "The message is empty." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return Response.json(
        { ok: false, error: "Email is not configured, so nothing was sent." },
        { status: 503 }
      );
    }

    const sent = await sendEmail(new Resend(process.env.RESEND_API_KEY), {
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      subject,
      html: customerUpdateHtml({ customerName, body }),
      text: body,
      // THE EMAIL PROMISES A REPLY REACHES US, so this points at the mailbox we
      // actually read rather than at whatever the sending address happens to
      // be. Hard wired to SALES_EMAIL on purpose: an environment variable would
      // be one unset value away from a promise we do not keep, and nobody would
      // find out until a customer said they had replied and heard nothing.
      reply_to: SALES_EMAIL,
    });

    // NOT RECORDED UNLESS IT WENT. A row saying an update was sent, written
    // after a refusal, is worse than no row: the report would show the customer
    // as handled and the next email would start from a date nothing was sent
    // on, so that week would be lost for good.
    if (!sent.ok) {
      return Response.json({ ok: false, error: sent.error || "The email could not be sent." }, { status: 502 });
    }

    await logOrderActivity(context.supabase, {
      customer_id: customerId,
      // Against the first order too, so it shows on that order's history and
      // not only on the customer desk.
      order_id: orders[0]?.id || null,
      actor_type: "admin",
      action_type: UPDATE_SENT_ACTION,
      title: "Order update sent to customer",
      description: [customerName, orders.map((o) => o.number).filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" - "),
      metadata: {
        email,
        subject,
        orders: orders.map((o) => o.number).filter(Boolean),
        // Kept so a question later about what a customer was actually told can
        // be answered from the record rather than from somebody's memory.
        body,
        sent_by: context.user?.email || null,
        resend_id: sent.id || null,
      },
    });

    return Response.json({ ok: true, sentAt: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not send the update." },
      { status: 500 }
    );
  }
}
