import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { askAlfred, changeCard } from "../../../../../lib/pcd-alfred-ask";
import { applyChange, previewChange } from "../../../../../lib/pcd-alfred-changes";
import { applyBooking, bookingCard, previewBooking } from "../../../../../lib/pcd-alfred-bookings";
import { siteUrl } from "../../../../../lib/pcd-stripe";

// ASK ALFRED.
//
//   action "ask"             the chat so far. Streams what Alfred is looking up
//                            as it goes, one JSON line each, then his reply.
//                            Reads only.
//   action "change_preview"  the exact changes a picked value and items make,
//                            from and to. Nothing is saved.
//   action "change_apply"    a person approves that preview by name. Checked
//                            again, and refused if anything moved since.
//   action "booking_preview" the booking as it will be, or as it will change.
//   action "booking_apply"   a person approves it by name. Saved through the
//                            calendar's own save (lib/pcd-calendar-save.js).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function finishReply(supabase, reply) {
  // The buttons for a change are built here, from the database, never from
  // what the model said. If the change cannot be offered, say why instead.
  if (reply.kind === "change") {
    const built = await changeCard(supabase, reply.proposal);
    if (!built.ok) return { kind: "cannot", text: built.problem, options: [], facts: [] };
    reply.card = built.card;
    delete reply.proposal;
  }
  // The booking form, from the database: the calendar's kinds and durations
  // and the customer's real jobs. Alfred's reading only fills it in.
  if (reply.kind === "booking") {
    try {
      reply.card = await bookingCard(supabase, reply.proposal);
      delete reply.proposal;
    } catch (error) {
      return { kind: "cannot", text: error?.message || "That booking cannot be offered.", options: [], facts: [] };
    }
  }
  return reply;
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));
  const supabase = context.supabase;

  try {
    if (body.action === "change_preview") {
      return Response.json({ ok: true, preview: await previewChange(supabase, body.selection) });
    }
    if (body.action === "booking_preview") {
      return Response.json({ ok: true, preview: await previewBooking(supabase, body.card || {}, body.draft || {}) });
    }
    if (body.action === "booking_apply") {
      return Response.json(await applyBooking(supabase, body.card || {}, body.draft || {}, { approvedBy: body.approvedBy, baseUrl: siteUrl(request.url) }));
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
