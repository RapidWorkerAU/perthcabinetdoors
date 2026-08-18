import { requireAdminApiContext } from "@/lib/admin-api";
import { fetchMessagesFrom, graphConfig } from "@/lib/pcd-graph-mail";
import { customerForAddress, fileMessagesForCustomer } from "@/lib/pcd-desk-file-messages";
import { storeMessageAttachments } from "@/lib/pcd-desk-sync";
import {
  PENDING_TABLE,
  domainOf,
  listPendingSenders,
  normaliseEmail,
  resolvePendingSender,
  saveSenderRule,
} from "@/lib/pcd-mail-senders";

// Deciding whether a sender is a customer, and acting on it.
//
// Approving REACHES BACK: their earlier mail is still in the mailbox, so the
// decision files what they already sent rather than only what comes next. The
// conversation somebody wants to read is usually the one that already happened.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    return Response.json({ ok: true, senders: await listPendingSenders(context.supabase) });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load new senders." }, { status: 500 });
  }
}

async function currentAgentId(context) {
  const { data } = await context.supabase
    .from("pcd_agents")
    .select("id")
    .ilike("login_email", context.user?.email || graphConfig().mailbox)
    .maybeSingle();
  return data?.id || null;
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json().catch(() => ({}));
  const email = normaliseEmail(body.email);
  const decision = body.decision === "customer" ? "customer" : "ignore";
  // "domain" answers for the whole company in one go, which is what makes 80
  // suppliers a handful of decisions instead of eighty.
  const scope = body.scope === "domain" ? "domain" : "address";

  if (!email) return Response.json({ ok: false, error: "Which address?" }, { status: 422 });

  try {
    const agentId = await currentAgentId(context);
    const pattern = scope === "domain" ? domainOf(email) : email;
    if (!pattern) return Response.json({ ok: false, error: "That address has no domain to match on." }, { status: 422 });

    await saveSenderRule(context.supabase, {
      matchType: scope,
      pattern,
      decision,
      note: body.note || null,
      agentId,
    });

    // Everybody the rule now covers, not just the one that was clicked. A
    // domain rule for polytec.com.au must clear all five of their addresses
    // from the list, or the same decision gets asked four more times.
    const covered = (await listPendingSenders(context.supabase)).filter((sender) =>
      scope === "domain" ? domainOf(sender.email) === pattern : sender.email === pattern
    );

    const filed = { added: 0, tickets: 0, attachments: 0, customers: 0, problems: [] };

    if (decision === "customer") {
      for (const sender of covered) {
        const customer = await customerForAddress(context.supabase, {
          email: sender.email,
          name: sender.display_name,
          source: { source: "inbound_email", label: `Approved from new senders` },
        });
        if (!customer?.id) continue;
        filed.customers += 1;

        const messages = await fetchMessagesFrom(sender.email);
        const result = await fileMessagesForCustomer(context.supabase, {
          customer,
          messages,
          agentId,
          storeAttachments: (args) => storeMessageAttachments(context.supabase, args),
        });
        filed.added += result.added;
        filed.tickets += result.tickets;
        filed.attachments += result.attachments;
        filed.problems.push(...result.problems);
      }
    }

    for (const sender of covered) {
      await resolvePendingSender(context.supabase, {
        email: sender.email,
        status: decision === "customer" ? "approved" : "ignored",
        agentId,
      });
    }

    return Response.json({
      ok: true,
      decision,
      scope,
      pattern,
      cleared: covered.length,
      ...filed,
      senders: await listPendingSenders(context.supabase),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not save that decision." }, { status: 500 });
  }
}

// Undo. A rule removed puts nothing back by itself, but it stops the answer
// being applied to future mail, and the sender returns to the list next sync.
export async function DELETE(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { searchParams } = new URL(request.url);
  const email = normaliseEmail(searchParams.get("email"));
  if (!email) return Response.json({ ok: false, error: "Which address?" }, { status: 422 });

  try {
    await context.supabase.from(PENDING_TABLE).delete().ilike("email", email);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not remove that sender." }, { status: 500 });
  }
}
