// PUBLIC design planner, "Save & share". Someone who wants their design link
// emailed to them gives us a name and an email, which is a real lead, so it
// goes on the customer list and the design is attached to them.
//
// ONE CUSTOMER PER EMAIL. This goes through upsertCustomerByEmail, the same
// path the quote request conversion uses, so saving a design today and sending
// a quote request next week lands on one record rather than two. See
// lib/pcd-customer-utils.js.
//
// Emailing the link is best effort. The customer is saved and the response is a
// success either way, because the point of the form is the lead, not the email,
// and Resend being unconfigured locally should not look like a failure.

import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { resolvePublicProject, canEditPublicProject, VIEW_ONLY_REFUSAL } from "../../../../../../lib/pcd-public-design";
import { upsertCustomerByEmail } from "../../../../../../lib/pcd-customer-utils";
import { sendDesignLinkEmail } from "../../../../../../lib/pcd-design-share-email";

export const dynamic = "force-dynamic";

async function getCode(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.code;
}

// Deliberately loose. This is a lead capture, not an account signup, so the bar
// is "could plausibly be delivered to" rather than a strict RFC check that
// rejects real addresses.
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export async function POST(request, { params }) {
  try {
    const code = await getCode(params);
    const body = await request.json();
    const supabase = createSupabaseAdminClient();

    const project = await resolvePublicProject(supabase, code);
    if (!project) {
      return Response.json({ ok: false, error: "Design not found." }, { status: 404 });
    }

    // THIS WRITES customer_id ONTO THE PROJECT, which is the whole point of it
    // for a visitor's own design and exactly wrong for one of ours: it would
    // reassign a design we drew for a customer to whoever happened to be
    // holding the link. The planner hides the Save and share button on a
    // view-only share, and this is the rule behind it.
    if (!canEditPublicProject(project)) {
      return Response.json({ ok: false, error: VIEW_ONLY_REFUSAL }, { status: 403 });
    }

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const shareUrl = String(body?.shareUrl || "").trim();

    if (!name) {
      return Response.json({ ok: false, error: "Please enter your name." }, { status: 422 });
    }
    if (!looksLikeEmail(email)) {
      return Response.json({ ok: false, error: "Please enter a valid email address." }, { status: 422 });
    }

    const customer = await upsertCustomerByEmail(supabase, {
      name,
      email,
      phone: String(body?.phone || "").trim() || null,
    });

    // Attach the design to them. Best effort: the column is added by
    // 202608141600_pcd_design_saved_by_customer.sql, and a database that has not
    // run it yet should still save the customer rather than 500.
    if (customer?.id) {
      await supabase
        .from("pcd_design_projects")
        .update({ customer_id: customer.id })
        .eq("id", project.id);
    }

    let emailed = false;
    try {
      emailed = await sendDesignLinkEmail({ name, email, shareUrl });
    } catch {
      // Saved is saved. The link is on their screen to copy regardless.
    }

    return Response.json({ ok: true, emailed });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not save your details." },
      { status: 500 }
    );
  }
}
