import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { siteUrl } from "../../../../lib/pcd-stripe";
import {
  fillCustomerBlanks,
  joinAddress,
  missingFor,
  recordAnswer,
} from "../../../../lib/pcd-booking-confirmations";
import {
  sendAnswerToCustomer,
  sendAnswerToSales,
  suppliedLines,
  suppliedWords,
} from "../../../../lib/pcd-booking-confirmation-emails";
import { pushBooking } from "../../../../lib/pcd-calendar-sync";

// RECORDING THE ANSWER.
//
// ── THE ORDER MATTERS ────────────────────────────────────────────────────────
//
//   1. Refuse anything the booking still needs. Checked HERE and not only in
//      the browser, because a check in the browser is a suggestion.
//   2. Write the answer and the details in ONE update, so a confirmation can
//      never be recorded without the details that were required to give it.
//   3. Everything after that is a best effort and none of it may fail the
//      answer: filling blanks on the customer, pushing the flag to Outlook,
//      and the two emails. The customer pressed a button once and it worked.
//
// ── THEY MAY CHANGE THEIR MIND ───────────────────────────────────────────────
//
// The link keeps working until the visit starts and the last answer stands,
// because somebody whose plans changed twice should not have to ring us. A
// second answer sends the same pair of emails, which read correctly either way:
// they describe what the answer IS, not that it is new.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const payload = await request.json();
    const code = String(payload.code || "").trim();
    const answer = String(payload.answer || "").trim();

    if (!code) return bad("Missing link code.");
    if (!["confirmed", "declined"].includes(answer)) return bad("Tell us whether the time suits.");

    const supabase = createSupabaseAdminClient();
    const { data: row, error } = await supabase
      .from("pcd_calendar_events")
      .select("*")
      .eq("confirm_token", code)
      .maybeSingle();

    if (error) throw error;
    if (!row) return bad("We could not find that appointment. The link may be out of date.", 404);
    if (row.status === "cancelled") return bad("This appointment has been cancelled. There is nothing to answer.");
    if (new Date(row.starts_at).getTime() <= Date.now()) {
      return bad("This appointment has already started, so it can no longer be answered here.");
    }

    const answeredBy = String(payload.answeredBy || "").trim();
    const contactName = String(payload.contactName || "").trim();
    const mobile = String(payload.mobile || "").trim();
    const street = String(payload.street || "").trim();
    const suburb = String(payload.suburb || "").trim();
    const postcode = String(payload.postcode || "").trim();
    const siteAddress = joinAddress({ street, suburb, postcode });

    const linked = Boolean(row.customer_id);
    const missing = missingFor(row);

    // DECLINING ASKS FOR NOTHING. Somebody telling us not to come does not owe
    // us their address first.
    if (answer === "confirmed") {
      if (!answeredBy) return bad("Please tell us who you are.");

      // Only a linked customer is held to this. An unlinked booking is one of
      // ours being answered in the office, where the same fields are offered
      // and none are compulsory.
      if (linked) {
        if (missing.mobile) {
          if (!mobile) return bad("We need a number to call on the day.");
          if (!/^(\+?61|0)[2-478]\d{8}$/.test(mobile.replace(/[\s()-]/g, ""))) {
            return bad("That does not look like an Australian mobile or landline.");
          }
        }
        if (missing.address && (!street || !suburb || !postcode)) {
          return bad("We need a street address, a suburb and a postcode so we know where to go.");
        }
      }
    }

    const written = await recordAnswer(supabase, row, {
      answer,
      answeredBy,
      notes: payload.notes,
      contactName,
      mobile,
      siteAddress,
    });
    if (!written.ok) throw new Error(written.error);

    const saved = written.row;
    const confirmed = answer === "confirmed";
    const baseUrl = siteUrl(request.url);

    // ── everything below is best effort ──────────────────────────────────────
    let customer = null;
    if (linked) {
      const { data } = await supabase
        .from("pcd_customers")
        .select("id, name, email, phone")
        .eq("id", row.customer_id)
        .maybeSingle();
      customer = data || null;

      // Blanks only, never an overwrite. See fillCustomerBlanks.
      await fillCustomerBlanks(supabase, row.customer_id, { mobile, street, suburb, postcode });
    }

    // The flag reaches Outlook through the ordinary push, so there is one path
    // out to the mailbox calendar rather than a second one just for this.
    await pushBooking(supabase, saved).catch((thrown) => {
      console.error(`[booking-confirm] could not push ${saved.id} to Outlook: ${thrown?.message || thrown}`);
    });

    const supplied = suppliedWords(row, saved);
    if (linked && customer?.email) {
      await sendAnswerToCustomer(saved, { customer, confirmed, supplied });
    }
    await sendAnswerToSales(saved, {
      confirmed,
      supplied: suppliedLines(row, saved),
      baseUrl,
      linked,
    });

    return Response.json({ ok: true, answer });
  } catch (error) {
    console.error(`[booking-confirm] answer failed: ${error?.message || error}`);
    return Response.json(
      { ok: false, error: error?.message || "We could not record your answer. Please try again." },
      { status: 500 }
    );
  }
}

function bad(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}
