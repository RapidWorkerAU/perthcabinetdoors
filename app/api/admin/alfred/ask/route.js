import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { askAlfred, changeCard, draftBatch, sendChatEmail } from "../../../../../lib/pcd-alfred-ask";
import { applyChange, previewChange } from "../../../../../lib/pcd-alfred-changes";

// ASK ALFRED.
//
//   action "ask"             the chat so far. Streams what Alfred is looking up
//                            as it goes, one JSON line each, then his reply.
//                            Reads only.
//   action "send"            a person approves an email from the chat, or saves
//                            it to the Waiting list (send: false).
//   action "batch"           a person approves a list of customers; one draft
//                            each goes to the Waiting list. Nothing is sent.
//   action "change_preview"  the exact changes a picked value and items make,
//                            from and to. Nothing is saved.
//   action "change_apply"    a person approves that preview by name. Checked
//                            again, and refused if anything moved since.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function finishReply(supabase, reply) {
  // Who an email goes to, shown above it: always the address on their record.
  if (reply.kind === "plan") {
    const { data: customer } = await supabase.from("pcd_customers").select("name, email").eq("id", reply.email.customerId).maybeSingle();
    reply.email.toName = customer?.name || "";
    reply.email.toEmail = customer?.email || "";
  }
  // The buttons for a change are built here, from the database, never from
  // what the model said. If the change cannot be offered, say why instead.
  if (reply.kind === "change") {
    const built = await changeCard(supabase, reply.proposal);
    if (!built.ok) return { kind: "cannot", text: built.problem, options: [], facts: [] };
    reply.card = built.card;
    delete reply.proposal;
  }
  if (reply.kind === "batch") {
    const { data: people } = await supabase.from("pcd_customers").select("id, name, email").in("id", reply.batch.customerIds);
    reply.batch.customers = reply.batch.customerIds.map((id) => {
      const person = (people || []).find((p) => p.id === id);
      return { id, name: person?.name || "Unnamed", email: person?.email || "" };
    });
  }
  return reply;
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));
  const supabase = context.supabase;

  try {
    if (body.action === "send") {
      return Response.json(
        await sendChatEmail(supabase, {
          email: body.email,
          facts: body.facts,
          request: body.request,
          approvedBy: body.approvedBy,
          bodyText: body.bodyText,
          agentEmail: context.user?.email || "",
          send: body.send !== false,
        })
      );
    }
    if (body.action === "batch") {
      return Response.json(await draftBatch(supabase, { customerIds: body.customerIds, instruction: String(body.instruction || ""), approvedBy: body.approvedBy }));
    }
    if (body.action === "change_preview") {
      return Response.json({ ok: true, preview: await previewChange(supabase, body.selection) });
    }
    if (body.action === "change_apply") {
      return Response.json(await applyChange(supabase, body.selection, body.expected, { approvedBy: body.approvedBy }));
    }
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not do that." }, { status: error?.status || 500 });
  }

  // The chat itself, streamed so the page can show what Alfred is doing.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const started = new Date().toISOString();
        const answer = await askAlfred(supabase, { turns: body.turns, onEvent: send });
        // What it cost, so the monthly limit counts the chat too.
        if (answer.cost) {
          await supabase.from("pcd_alfred_runs").insert({
            job: "ask",
            started_at: started,
            finished_at: new Date().toISOString(),
            input_tokens: answer.usage?.input_tokens || 0,
            output_tokens: answer.usage?.output_tokens || 0,
            cost_usd: answer.cost,
            problems: answer.ok ? null : answer.problem,
          });
        }
        if (!answer.ok) send({ type: "done", ok: false, error: answer.problem });
        else send({ type: "done", ok: true, reply: await finishReply(supabase, answer.result) });
      } catch (error) {
        send({ type: "done", ok: false, error: error?.message || "Alfred could not answer." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
