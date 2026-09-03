import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { generateSessionCode, EDITABLE, VIEW_ONLY } from "../../../../../../../lib/pcd-public-design";
import { sendDesignLinkEmail } from "../../../../../../../lib/pcd-design-share-email";
import { upsertCustomerByEmail } from "../../../../../../../lib/pcd-customer-utils";
import { siteUrl } from "../../../../../../../lib/pcd-stripe";

// SHARING A DESIGN WE DREW.
//
// The public planner already renders any project from its access_code, in plan
// and in 3D, and its read path returns every item, so a design with scribes and
// obstructions in it displays correctly there. This is the switch that turns one
// on, and the place the choice between look and change is made.
//
// ── VIEW IS THE DEFAULT HERE, AND ONLY HERE ─────────────────────────────────
//
// The column defaults to 'edit', because every row that existed before this was
// a session somebody drew themselves on the public planner and has always been
// able to change. The safe default belongs at the moment of sharing instead: a
// design we drafted goes out to be looked at unless somebody deliberately says
// otherwise. See the migration for why that split is deliberate.
//
// ── THE CODE IS GENERATED ONCE AND KEPT ─────────────────────────────────────
//
// Re-sharing a design reuses the code it already has, so a link sent last week
// still opens the same design and switching from edit to view takes effect on
// the link they are already holding. A new code every time would leave old
// emails pointing at nothing and no way to tell that from a revoked share.
//
// ── REVOKING IS is_public = false ───────────────────────────────────────────
//
// Same as a quote or a variation. The code is left on the row so the same link
// works again if it is turned back on, and resolvePublicProject refuses it
// meanwhile because it checks both.

export const dynamic = "force-dynamic";

const PROJECTS = "pcd_design_projects";

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { projectId } = await params;

  try {
    const payload = await request.json().catch(() => ({}));
    const mode = payload.mode === EDITABLE ? EDITABLE : VIEW_ONLY;
    const email = String(payload.email || "").trim().toLowerCase();
    const name = String(payload.name || "").trim();

    const { data: project, error: readError } = await context.supabase
      .from(PROJECTS)
      .select("id, name, access_code, is_public, share_mode, customer_id")
      .eq("id", projectId)
      .maybeSingle();
    if (readError) throw readError;
    if (!project) return Response.json({ ok: false, error: "That design no longer exists." }, { status: 404 });

    const code = project.access_code || generateSessionCode();
    const patch = {
      access_code: code,
      is_public: true,
      share_mode: mode,
    };
    // Only stamped when it is actually sent to somebody. Turning sharing on to
    // copy the link yourself is not the same event as emailing it, and the
    // design screen says "sent to X on Y", which would be a lie otherwise.
    if (email) {
      patch.shared_at = new Date().toISOString();
      patch.shared_to = email;
    }

    const { data: saved, error: writeError } = await context.supabase
      .from(PROJECTS)
      .update(patch)
      .eq("id", projectId)
      .select("id, access_code, is_public, share_mode, shared_at, shared_to")
      .single();
    if (writeError) throw writeError;

    const shareUrl = `${String(siteUrl(request.url)).replace(/\/+$/, "")}/design?code=${encodeURIComponent(code)}`;

    // ── the email is best effort ────────────────────────────────────────────
    // The link works the moment the row is saved. A refused email means the
    // link has to be copied out by hand, not that the design is unshared, so it
    // is reported rather than thrown.
    let emailed = false;
    let emailError = "";
    if (email) {
      try {
        // Same path the public planner's own share form uses, so a customer who
        // is emailed a design today and sends a quote request next week lands on
        // one record rather than two. See lib/pcd-customer-utils.js.
        await upsertCustomerByEmail(
          context.supabase,
          { email, name: name || null },
          { source: "design_share" }
        );
        emailed = await sendDesignLinkEmail({ name, email, shareUrl });
        if (!emailed) emailError = "The email did not go out. Copy the link and send it yourself.";
      } catch (thrown) {
        emailError = thrown?.message || "The email did not go out.";
      }
    }

    return Response.json({
      ok: true,
      share: { ...saved, shareUrl },
      emailed,
      ...(emailError ? { emailError } : {}),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not share the design." },
      { status: 500 }
    );
  }
}

/** Turn the link off. The code is kept so turning it back on is the same link. */
export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { projectId } = await params;

  try {
    const { data: saved, error } = await context.supabase
      .from(PROJECTS)
      .update({ is_public: false })
      .eq("id", projectId)
      .select("id, is_public, share_mode, shared_at, shared_to")
      .single();
    if (error) throw error;
    return Response.json({ ok: true, share: saved });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not stop sharing the design." },
      { status: 500 }
    );
  }
}
