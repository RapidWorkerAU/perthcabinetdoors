import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { siteUrl } from "../../../../../../lib/pcd-stripe";
import { paymentLinkDraft, sendPaymentLink } from "../../../../../../lib/pcd-site-measure-payment-link-store";

// The payment link for a site measure booked by hand.
//
// GET is what the email window opens with: who it goes to, the words, and when
// the link closes by default (which is also the latest it can close). POST
// sends it. The work is in lib/pcd-site-measure-payment-link-store.js.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  try {
    const draft = await paymentLinkDraft(context.supabase, id);
    return Response.json({ ok: true, draft });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not load the payment link." },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await sendPaymentLink(context.supabase, id, body, {
      baseUrl: siteUrl(request.url),
      user: context.user,
    });
    return Response.json({ ok: true, sentTo: result.sentTo, warning: result.warning });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "The payment link could not be sent." },
      { status: error?.status || 500 }
    );
  }
}
