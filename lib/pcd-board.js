// The Board: everything waiting on us, and everything sitting with a customer.
//
// Framework-free and pure. The page fetches rows, this decides what becomes a
// card, and every rule that could quietly mislead somebody is tested rather
// than trusted.
//
// THE TWO RULES THAT MATTER
//
// A failed source is never a zero. If the query behind a column errors, that
// column reports itself as unloaded. A board that says "all clear" when it is
// actually broken is worse than no board.
//
// The age clock starts when the obligation began and never resets. Not
// updated_at: that measures our activity on a record rather than how long a
// thing has been outstanding, so opening an enquiry without answering it would
// reset its clock to today and hide it.

export const COLUMNS = [
  { key: "issue",     label: "Fix the problem",       clock: "since raised",     source: "issues",
    note: "A panel with an open issue against it." },
  { key: "reply",     label: "Reply to the customer", clock: "since they wrote", source: "messages",
    note: "Website enquiries and emails with no answer sent." },
  { key: "price",     label: "Send a formal quote",   clock: "since they asked", source: "requests",
    note: "Quote requests that never became a sent quote." },
  { key: "depo",      label: "Chase the deposit",     clock: "since we asked",   source: "orders",
    note: "Accepted but never paid, so the job is not confirmed." },
  { key: "plan",      label: "Finish the job planning", clock: "since accepted", source: "orders",
    note: "Active orders missing a schedule or their panel decisions." },
  { key: "materials", label: "Order the materials",   clock: "since accepted",   source: "orders",
    note: "Starting soon with panels still unordered." },
  { key: "late",      label: "Chase the workshop",    clock: "overdue",          source: "orders",
    note: "Booked in and not moving, or past the date we promised." },
  { key: "chase",     label: "Chase the customer",    clock: "since we sent it", source: "sent",
    note: "Quotes, payments and variations sitting with them." },
  // A FINISHED JOB WITH MONEY STILL ON IT.
  //
  // The board only ever looked at orders that were pending a deposit or active,
  // so the moment a job was marked complete it left the board owing whatever it
  // owed. Worse, only the DEPOSIT payment row is raised automatically, so a
  // balance nobody had asked for did not exist as a row for anything to find:
  // there was no screen anywhere saying "this job is done and nobody has asked
  // for the money".
  { key: "balance",   label: "Get the job paid for",  clock: "since it finished", source: "orders",
    note: "Finished jobs with money still outstanding." },
];

export const COLUMN_KEYS = COLUMNS.map((c) => c.key);

export function column(key) {
  return COLUMNS.filter((c) => c.key === key)[0] || null;
}

export function clockFor(key) {
  const found = column(key);
  return found ? found.clock : "";
}

// No gaps and no overlaps: every card falls in exactly one.
export const AGE_COLS = [
  { key: "today", label: "Today", note: "Since yesterday", min: 0, max: 1 },
  { key: "d2", label: "2 to 7 days", note: "Still fine. Do not leave it.", min: 2, max: 7 },
  { key: "d8", label: "8 to 14 days", note: "They have noticed by now.", min: 8, max: 14, urgent: true },
  { key: "d15", label: "Over 14 days", note: "This is where jobs are lost.", min: 15, max: Infinity, urgent: true },
];

// The age at which a card starts reading as late. Not a threshold for appearing:
// there is deliberately no grace period, so a card exists the moment the thing
// it describes does.
export const LATE_AT = 8;

export const ACTORS = [
  { key: "all", label: "Everything" },
  { key: "us", label: "Our action" },
  { key: "customer", label: "Customer action" },
];

const DAY = 86400000;

export function daysSince(value, today) {
  if (!value) return 0;
  const then = new Date(String(value).slice(0, 10));
  const now = today ? new Date(String(today).slice(0, 10)) : new Date();
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / DAY));
}

export function daysUntil(value, today) {
  if (!value) return null;
  const then = new Date(String(value).slice(0, 10));
  const now = today ? new Date(String(today).slice(0, 10)) : new Date();
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return null;
  return Math.round((then.getTime() - now.getTime()) / DAY);
}

export function ageColFor(days) {
  return AGE_COLS.filter((col) => days >= col.min && days <= col.max)[0] || null;
}

// One card. `href` is where the body of the card goes; the record chips carry
// their own links, so nobody is forced through a page they did not want.
function card(input) {
  const days = Number(input.days) || 0;
  return {
    id: input.id,
    cat: input.cat,
    who: input.who || "Unknown",
    what: input.what || "",
    why: input.why || "",
    days,
    late: days >= LATE_AT,
    amt: Number(input.amt) || 0,
    tags: input.tags || [],
    theirs: Boolean(input.theirs),
    blocks: Boolean(input.blocks),
    href: input.href || "",
    // Set only on cards that can be closed without replying, which today means
    // an email conversation. Everything else leaves the board by being done.
    ticketId: input.ticketId || null,
    // WHO THE CARD IS ABOUT, as a record rather than a name.
    //
    // The body of a card goes wherever the work is: an order, a quote, the
    // issues tab. The NAME goes to the person, which is the other question
    // somebody has in front of a card and used to mean leaving the board to
    // search for them. Null where there is no record yet, which is a real
    // answer: a website enquiry from an address we have never seen has nobody
    // to link to, and the name stays plain text rather than a dead link.
    customerId: input.customerId || null,
    // WHAT THE CARD IS ABOUT, and how current that thing is.
    //
    // Together these are what let a card be set aside and come back on its own.
    // The subject is the person or record it hangs off; the stamp is the moment
    // it is currently about, which for a reply is their newest message and for a
    // quote is the day it went out. Setting a card aside remembers the stamp, so
    // the card returns the moment that moves. See lib/pcd-board-dismissal.js.
    subjectId: input.subjectId || null,
    subjectType: input.subjectType || null,
    stamp: input.stamp || null,
  };
}

// ── the filters ────────────────────────────────────────────────────────────

export function byActor(cardRow, actor) {
  if (actor === "us") return !cardRow.theirs;
  if (actor === "customer") return Boolean(cardRow.theirs);
  return true;
}

// The dropdown follows whatever the columns are grouped by: by action when the
// columns are ages, by age when the columns are actions. Either way it answers
// the question the columns cannot.
export function byCross(cardRow, view, value) {
  if (!value) return true;
  if (view === "age") return cardRow.cat === value;
  const col = ageColFor(cardRow.days);
  return Boolean(col) && col.key === value;
}

export function visibleCards(cards, { actor = "all", view = "age", cross = "" } = {}) {
  return (cards || []).filter((c) => byActor(c, actor) && byCross(c, view, cross));
}

// Anything blocking a whole order comes first, because nothing on that job can
// move until it is dealt with. Age decides the rest.
export function sortCards(cards) {
  return (cards || []).slice().sort((a, b) => (b.blocks ? 1 : 0) - (a.blocks ? 1 : 0) || b.days - a.days);
}

// Ours first, then the customer's, each blocking-first within itself.
export function splitByActor(cards) {
  return {
    ours: sortCards((cards || []).filter((c) => !c.theirs)),
    theirs: sortCards((cards || []).filter((c) => c.theirs)),
  };
}

// ── grouping ───────────────────────────────────────────────────────────────

// A column reports whether its source loaded. `failed` is the set of source
// names whose query errored, so an empty column and a broken one can never look
// the same.
// An age column draws from every source, so a broken one makes it INCOMPLETE
// rather than unknown. It still shows everything that did load, because hiding
// a hundred real cards over one failed query is worse than the gap it was
// trying to warn about. The banner says what is missing.
export function groupByAge(cards, failed) {
  const broken = failed instanceof Set ? failed : new Set(failed || []);
  const incomplete = COLUMNS.some((c) => broken.has(c.source));
  return AGE_COLS.map((col) => ({
    key: col.key,
    label: col.label,
    note: col.note,
    urgent: Boolean(col.urgent),
    failed: false,
    incomplete,
    cards: (cards || []).filter((c) => c.days >= col.min && c.days <= col.max),
  }));
}

// Grouped by action a column maps to ONE source, so a broken one really is
// unknown and says so. The others are unaffected and show normally.
// The order is PINNED to the one COLUMNS declares, with empty columns sent to
// the end. Sorting by how full they are moved a column every time a count
// changed, which is the opposite of what a board you look at ten times a day
// needs: you learn where a column lives and it stops being there.
export function groupByCategory(cards, failed) {
  const broken = failed instanceof Set ? failed : new Set(failed || []);
  return COLUMNS.map((col, order) => ({
    order,
    key: col.key,
    label: col.label,
    note: col.note,
    urgent: false,
    failed: broken.has(col.source),
    incomplete: false,
    cards: (cards || []).filter((c) => c.cat === col.key),
  })).sort((a, b) => (b.cards.length ? 1 : 0) - (a.cards.length ? 1 : 0) || a.order - b.order);
}

// What the banner says is missing, in the words of the columns it affects
// rather than the name of a table.
export function missingWords(failed) {
  const broken = failed instanceof Set ? failed : new Set(failed || []);
  const hit = COLUMNS.filter((c) => broken.has(c.source)).map((c) => c.label);
  if (!hit.length) return "";
  if (hit.length === 1) return hit[0];
  return hit.slice(0, -1).join(", ") + " and " + hit[hit.length - 1];
}

export function groupCards(cards, view, failed) {
  return view === "cat" ? groupByCategory(cards, failed) : groupByAge(cards, failed);
}

// What the dropdown offers, and how many are behind each choice. Counts respect
// the actor filter, so they never promise cards the current view would hide.
export function crossOptions(cards, view, actor) {
  const pool = (cards || []).filter((c) => byActor(c, actor));
  if (view === "age") {
    return COLUMNS.map((col) => ({
      value: col.key,
      label: col.label,
      count: pool.filter((c) => c.cat === col.key).length,
    }));
  }
  return AGE_COLS.map((col) => ({
    value: col.key,
    label: col.label,
    count: pool.filter((c) => c.days >= col.min && c.days <= col.max).length,
  }));
}

export function counts(cards) {
  const all = cards || [];
  const ours = all.filter((c) => !c.theirs).length;
  return { all: all.length, us: ours, customer: all.length - ours };
}

// ── building the cards ─────────────────────────────────────────────────────
//
// Each builder takes rows already shaped by the page and returns cards. Kept
// separate so a source can be tested on its own, and so a broken one cannot
// take the others down with it.

export function issueCards(rows, today) {
  return (rows || []).map((row) =>
    card({
      id: `issue:${row.id}`,
      cat: "issue",
      customerId: row.customerId || null,
      who: row.customerName || row.orderNumber || "Order",
      what: [row.panelLabel, row.kindLabel && row.kindLabel.toLowerCase()].filter(Boolean).join(", "),
      why: [
        `Open issue raised ${daysSince(row.raised_at, today)} days ago.`,
        row.stage_at_report ? `The panel is still at ${row.stage_at_report}.` : "",
        row.blocks === "order" ? "Nothing on this order moves until it is dealt with." : "",
      ].filter(Boolean).join(" "),
      days: daysSince(row.raised_at, today),
      subjectId: row.id,
      subjectType: "issue",
      stamp: row.raised_at || null,
      amt: row.extra_cost_ex_gst,
      tags: [
        row.orderNumber ? [row.orderNumber, "ref"] : null,
        row.blocks === "order" ? ["Blocks the order", "miss"] : null,
        row.stage_at_report ? [`${row.progress_kind || "Stage"}: ${row.stage_at_report}`, ""] : null,
      ].filter(Boolean),
      // An issue the customer or a supplier has to fix is a chase, not work.
      theirs: row.owner !== "us",
      blocks: row.blocks === "order",
      href: `/admin/orders/${row.order_id}?section=issues`,
    })
  );
}

// ONE CARD PER CUSTOMER, NOT ONE PER THREAD.
//
// Whose turn it is was decided per email thread, and a reply usually starts a
// NEW thread rather than landing back on the old one. So a customer we had
// answered a fortnight ago still had their old thread on the board saying we
// had never replied, and someone with three threads took up three cards. 16 of
// 66 reply cards were wrong that way, and 39 of them were duplicates of a
// person already on the board.
//
// The question is about a PERSON: is the last thing that passed between us
// theirs? Whichever thread it happened on. One person, one card, and it names
// how many conversations are waiting so nothing is hidden by the grouping.
export function replyCards({ enquiries, tickets }, today) {
  const fromEnquiries = (enquiries || []).map((row) =>
    card({
      id: `enquiry:${row.id}`,
      cat: "reply",
      customerId: row.customerId || null,
      who: row.customer_name || row.customer_email || "Unknown",
      what: row.topic || row.message || "Website enquiry",
      why: "Website enquiry. No outbound email to that address since it arrived.",
      days: daysSince(row.created_at, today),
      tags: [["Enquiry", ""]],
      subjectId: row.id,
      subjectType: "enquiry",
      stamp: row.created_at || null,
      href: "/admin/enquiries",
    })
  );

  const fromTickets = (tickets || []).map((row) => {
    const waiting = Number(row.waitingThreads) || 1;
    return card({
      id: `reply:${row.subjectId || row.id}`,
      cat: "reply",
      customerId: row.customerId || row.customer_id || null,
      who: row.customerName || row.from_email || "Unknown",
      what: row.subject || "No subject",
      why: waiting > 1
        ? `The last thing that passed between us was theirs, across ${waiting} conversations. The oldest is the one timed here.`
        : "The last thing that passed between us was theirs, and nothing has gone back.",
      // Since THEIR oldest unanswered message, not since the newest. A customer
      // who has written three times is owed an answer from the first one.
      days: daysSince(row.oldestUnanswered || row.last_message_at, today),
      tags: [
        row.customer_id ? ["Existing", ""] : ["New sender", "new"],
        waiting > 1 ? [`${waiting} conversations`, "miss"] : null,
      ].filter(Boolean),
      ticketId: row.id,
      subjectId: row.subjectId || row.id,
      subjectType: "customer",
      // Their newest message. A card set aside comes back the moment they write
      // again, because that pushes this past the mark it was set aside at.
      stamp: row.newestInbound || row.last_message_at || null,
      href: row.customer_id ? `/admin/customers/${row.customer_id}` : "/admin/customers",
    });
  });

  return fromEnquiries.concat(fromTickets);
}

// A REQUEST IS DONE WHEN A QUOTE HAS BEEN SENT, NOT WHEN ONE HAS BEEN STARTED.
//
// Converting a request marked it converted_to_quote, which took it off the
// board, and the draft quote it created was never looked at, because the board
// only asks for quotes that are sent or viewed. So a customer who asked for a
// price could wait indefinitely with nothing anywhere, as long as somebody had
// clicked convert. That is the exact thing this column exists to catch.
//
// The card now runs from the day they ASKED and stays until a quote actually
// goes out. Converting changes what the card says and where it points, because
// it is progress, but it is not an answer to the person waiting.
/**
 * Has this person actually been sent a price since they asked?
 *
 * ── THE FAULT THIS FIXES ─────────────────────────────────────────────────────
 *
 * The board decided a request was answered by following converted_quote_id, the
 * link the "convert this request" button writes. Nothing else writes it. A
 * quote raised for the same customer any other way, from the quotes page or off
 * the back of a design, never set it, so the board could not see the quote at
 * all.
 *
 * Dylan Yarwood had a request from the design tool, two quotes, one of them
 * approved and already an order, and a card telling somebody to send him a
 * formal quote. It would have said that forever. A column that asks for work
 * already done is worse than no column, because it teaches people to stop
 * reading it.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * A request is answered when a quote WAS SENT to that customer at or after the
 * moment they asked. Sent, not drafted: a draft nobody posted is exactly the
 * hole the converted_to_quote status left, and it stays open.
 *
 * At or AFTER, because a quote sent last month for a different job is not an
 * answer to a question asked this week.
 *
 * @param request     the quote request, needing created_at
 * @param sentAtList  when quotes were sent to this same customer, any format
 *                    Date can read. Only ones actually sent belong in it.
 */
export function requestAnswered(request, sentAtList = []) {
  const askedAt = toTime(request?.created_at);
  if (askedAt === null) return false;
  return (sentAtList || []).some((value) => {
    const sentAt = toTime(value);
    return sentAt !== null && sentAt >= askedAt;
  });
}

function toTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function requestCards(rows, today) {
  return (rows || []).map((row) =>
    card({
      id: `request:${row.id}`,
      cat: "price",
      customerId: row.customerId || null,
      who: row.customer_name || row.customer_email || "Unknown",
      what: row.product_name || "Quote request",
      why: row.draftQuoteNumber
        ? `Quote ${row.draftQuoteNumber} is drafted and has never been sent, ${daysSince(row.created_at, today)} days after they asked.`
        : "Quote request with no quote sent to them yet.",
      days: daysSince(row.created_at, today),
      // A quote request has no price. There is no total on the table, because
      // it is a request rather than a quote, so the card carries a count.
      tags: [
        row.draftQuoteNumber ? ["Drafted, not sent", "miss"] : null,
        row.source === "design_tool" ? ["From the design tool", "new"] : null,
        row.company_name ? ["Business", ""] : null,
        row.itemCount ? [`${row.itemCount} item${row.itemCount === 1 ? "" : "s"}`, ""] : null,
      ].filter(Boolean),
      subjectId: row.id,
      subjectType: "quote_request",
      // Moves when the draft is created, so a request set aside before anybody
      // started on it comes back once there is a draft sitting unsent.
      stamp: row.draftQuoteAt || row.created_at || null,
      href: row.draftQuoteId ? `/admin/quotes/${row.draftQuoteId}` : "/admin/quote-requests",
    })
  );
}

export function depositCards(rows, today) {
  return (rows || []).map((row) =>
    card({
      id: `depo:${row.id}`,
      cat: "depo",
      customerId: row.customerId || null,
      who: row.customer_name || row.order_number || "Order",
      what: row.name || "Order awaiting its deposit",
      why: `Order status is Pending Deposit.${
        row.requested_at ? ` Requested ${daysSince(row.requested_at, today)} days ago and still unpaid.` : " The deposit has not been requested yet."
      } Nothing is cut.`,
      days: daysSince(row.requested_at || row.created_at, today),
      amt: row.deposit_amount,
      subjectId: row.id,
      subjectType: "order",
      stamp: row.requested_at || row.created_at || null,
      tags: [[row.order_number, "ref"], ["Pending Deposit", "miss"]],
      // Theirs once we have ASKED. A deposit nobody has requested is our job,
      // and marking it as theirs hid the one case where the next move is ours
      // from anybody filtering the board to "our action".
      theirs: Boolean(row.requested_at),
      href: `/admin/orders/${row.id}?section=payments`,
    })
  );
}

export function planningCards(rows, today) {
  return (rows || []).map((row) => {
    const missing = row.missing || [];
    return card({
      id: `plan:${row.id}`,
      cat: "plan",
      customerId: row.customerId || null,
      who: row.customer_name || row.order_number || "Order",
      what: row.name || "Order",
      why: row.why || `${missing.join(", ")} outstanding.`,
      days: daysSince(row.accepted_at, today),
      amt: row.total_inc_gst,
      subjectId: row.id,
      subjectType: "order",
      stamp: row.updated_at || row.accepted_at || null,
      tags: [[row.order_number, "ref"]].concat(missing.map((m) => [m, "miss"])),
      href: `/admin/orders/${row.id}?section=${row.panelsMissing ? "items" : "overview"}`,
    });
  });
}

export function materialCards(rows, today) {
  return (rows || []).map((row) => {
    const until = daysUntil(row.scheduled_start_date, today);
    return card({
      id: `mat:${row.id}`,
      cat: "materials",
      customerId: row.customerId || null,
      who: row.customer_name || row.order_number || "Order",
      what: row.name || "Order",
      why: `${row.notOrdered} panel${row.notOrdered === 1 ? "" : "s"} still Not Ordered, and the job is booked to start ${
        until === null ? "soon" : until <= 0 ? "already" : `in ${until} day${until === 1 ? "" : "s"}`
      }.`,
      days: daysSince(row.accepted_at, today),
      amt: row.total_inc_gst,
      subjectId: row.id,
      subjectType: "order",
      stamp: row.updated_at || row.accepted_at || null,
      tags: [[row.order_number, "ref"], [`${row.notOrdered} not ordered`, "miss"]],
      href: `/admin/orders/${row.id}?section=supplierMade`,
    });
  });
}

export function lateCards(rows, today) {
  return (rows || []).map((row) =>
    card({
      id: `late:${row.id}`,
      cat: "late",
      customerId: row.customerId || null,
      who: row.customer_name || row.order_number || "Order",
      what: row.name || "Order",
      why: row.why || "Past the date we promised and still active.",
      // Overdue by, not old by. The clock on this column is the only one that
      // counts from a date in the future having passed.
      days: row.overdueDays || 0,
      amt: row.total_inc_gst,
      subjectId: row.id,
      subjectType: "order",
      stamp: row.updated_at || row.target_completion_date || null,
      tags: [[row.order_number, "ref"], [row.reasonTag || "Past due date", "miss"]],
      href: `/admin/orders/${row.id}?section=cutList`,
    })
  );
}

// FINISHED, AND STILL OWED FOR.
//
// The amount is the order total less everything marked paid against it, so a
// job that was part paid shows what is actually left rather than the whole
// total again.
//
// Whose move it is depends on whether anybody has ASKED. A balance that has
// been requested and not paid is a chase; one nobody has raised is our job, and
// it is the more common of the two, because only the deposit is ever raised
// automatically.
export function balanceCards(rows, today) {
  return (rows || []).map((row) => {
    const asked = Boolean(row.requestedAt);
    return card({
      id: `bal:${row.id}`,
      cat: "balance",
      customerId: row.customerId || null,
      who: row.customer_name || row.order_number || "Order",
      what: row.name || "Finished job",
      why: asked
        ? `Job finished. ${money(row.outstanding)} still outstanding, asked for ${daysSince(row.requestedAt, today)} days ago.`
        : `Job finished and ${money(row.outstanding)} has never been asked for.`,
      // Since the job finished, not since we asked. The asking is the thing
      // that has not happened on most of these.
      days: daysSince(row.completed_at, today),
      amt: row.outstanding,
      subjectId: row.id,
      subjectType: "order",
      // Moves when a payment is raised or paid, so a card set aside comes back
      // if the amount owing changes.
      stamp: row.stamp || row.completed_at || null,
      tags: [
        [row.order_number, "ref"],
        asked ? ["Requested", ""] : ["Never asked for", "miss"],
      ],
      theirs: asked,
      href: `/admin/orders/${row.id}?section=payments`,
    });
  });
}

// Whole dollars. A card is a prompt, not an invoice.
function money(value) {
  const amount = Math.round(Number(value) || 0);
  return "$" + amount.toLocaleString("en-AU");
}

export function chaseCards({ quotes, payments, variations }, today) {
  // A QUOTE IS ONLY A CHASE WHILE THEY HAVE NOT WRITTEN BACK.
  //
  // "Sent, no answer either way" was said about quotes the customer had replied
  // to, sometimes weeks earlier. If they wrote after we sent it, the ball is
  // ours: the card moves to the reply column and reads as a message to answer.
  // Send them a revised quote and it moves back to the chase, because sending
  // is the newer act. It follows whichever happened last, every time the board
  // is built, so it can never get stuck on the wrong side.
  const fromQuotes = (quotes || []).map((row) => {
    // AND HAVE WE ANSWERED THEM SINCE?
    //
    // This used to ask only whether their last email came after the quote went
    // out. It never asked what we did next, so the moment a customer wrote back
    // the card moved to the reply column and STAYED there, ageing, long after
    // somebody had answered them. Two weeks later it read "they wrote back 16
    // days ago" about a conversation that was finished on day three.
    //
    // The reply column already answers this properly, by comparing what they
    // sent to our last reply to that person on any thread. This now uses the
    // same fact. See answeredAt in app/admin/board/page.tsx.
    const theyReplied = Boolean(
      row.repliedAt &&
      row.sent_at &&
      row.repliedAt > row.sent_at &&
      !(row.answeredAt && row.answeredAt > row.repliedAt)
    );
    return card({
      id: `quote:${row.id}`,
      cat: theyReplied ? "reply" : "chase",
      customerId: row.customerId || null,
      who: row.customer_name || row.quote_number || "Quote",
      what: row.title || "Quote",
      why: theyReplied
        ? `They wrote back ${daysSince(row.repliedAt, today)} days ago about this quote, and it is still not approved.`
        : row.viewed_at
          ? `Quote opened ${daysSince(row.viewed_at, today)} days ago. Never approved or rejected.`
          : `Quote sent ${daysSince(row.sent_at, today)} days ago and never opened. Usually means it went to spam.`,
      // The clock starts at whichever of the two happened last, so a card that
      // has just changed sides does not arrive already looking overdue.
      days: daysSince(theyReplied ? row.repliedAt : row.sent_at, today),
      amt: row.total_inc_gst,
      tags: [[row.quote_number, "ref"]].concat(theyReplied ? [["They replied", "new"]] : []),
      theirs: !theyReplied,
      subjectId: row.id,
      subjectType: "quote",
      stamp: (theyReplied ? row.repliedAt : row.sent_at) || null,
      href: `/admin/quotes/${row.id}`,
    });
  });

  const fromPayments = (payments || []).map((row) =>
    card({
      id: `pay:${row.id}`,
      cat: "chase",
      customerId: row.customerId || null,
      who: row.customerName || row.orderNumber || "Order",
      what: `${row.payment_type === "final" ? "Final balance" : "Payment"} on a live job`,
      why: `Payment requested ${daysSince(row.requested_at, today)} days ago, still unpaid.`,
      days: daysSince(row.requested_at, today),
      amt: row.amount,
      subjectId: row.id,
      subjectType: "payment",
      stamp: row.requested_at || null,
      tags: [[row.orderNumber, "ref"], [row.payment_type === "final" ? "Final" : "Progress", ""]],
      theirs: true,
      href: `/admin/orders/${row.order_id}?section=payments`,
    })
  );

  const fromVariations = (variations || []).map((row) =>
    card({
      id: `var:${row.id}`,
      cat: "chase",
      customerId: row.customerId || null,
      who: row.customerName || row.orderNumber || "Order",
      what: row.title || "Variation",
      why: `Variation sent ${daysSince(row.sent_at, today)} days ago, no answer either way.`,
      days: daysSince(row.sent_at, today),
      amt: row.total_inc_gst,
      subjectId: row.id,
      subjectType: "variation",
      stamp: row.sent_at || null,
      tags: [[row.orderNumber, "ref"], ["Variation", ""]],
      theirs: true,
      href: `/admin/orders/${row.order_id}/variations/${row.id}`,
    })
  );

  return fromQuotes.concat(fromPayments, fromVariations);
}

/**
 * One person, one reply.
 *
 * ── THE FAULT THIS FIXES ─────────────────────────────────────────────────────
 *
 * Two columns could each raise their own reply card off the SAME email. A
 * customer who answered a quote got one card from the email column, which
 * groups by person, and a second from the quote column, which does not. Both
 * asked for the one reply. The email column went to real trouble to be one card
 * per person; a second column raising its own undid that work.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * Whether somebody is owed a reply is a fact about a PERSON, so it gets decided
 * once. Where a person already has a reply card, anything else asking for the
 * same reply is folded into it and named there, so nothing is hidden by the
 * collapse: the card says which quote is waiting.
 *
 * ── WHY IT RUNS LAST, AFTER SET ASIDE ────────────────────────────────────────
 *
 * A card that has been set aside is not on the board, so it cannot stand in for
 * anything. Collapsing before that point would let somebody set the reply card
 * aside and take the quote away with it, and the quote would then be waiting
 * with nothing anywhere saying so. Running afterwards means setting the reply
 * aside brings the quote chase straight back, which is the truthful outcome.
 *
 * A quote whose customer has NO reply card is never collapsed. That is the
 * safety net for a closed ticket or an email that never filed: the card stays,
 * as its own reply, rather than disappearing because something that does not
 * exist was assumed to cover it.
 */
export function collapseReplies(cards) {
  const list = cards || [];

  // Who already has a reply card of their own, from the email column.
  const owed = new Set(
    list
      .filter((c) => c.cat === "reply" && c.subjectType === "customer" && c.customerId)
      .map((c) => c.customerId)
  );
  if (!owed.size) return list;

  const folded = new Map();
  const kept = list.filter((c) => {
    const isQuoteReply = c.cat === "reply" && c.subjectType === "quote" && c.customerId;
    if (!isQuoteReply || !owed.has(c.customerId)) return true;
    const names = folded.get(c.customerId) || [];
    // The quote number, so the reply card can say what is waiting on the answer.
    names.push((c.tags || []).filter((t) => t[1] === "ref").map((t) => t[0])[0] || c.what);
    folded.set(c.customerId, names);
    return false;
  });

  if (!folded.size) return kept;

  return kept.map((c) => {
    const names = c.cat === "reply" && c.subjectType === "customer" ? folded.get(c.customerId) : null;
    if (!names || !names.length) return c;
    return {
      ...c,
      why: `${c.why} ${names.length === 1 ? "Their" : "Theirs"} on ${names.join(", ")}, still waiting on an answer.`,
      tags: (c.tags || []).concat(names.map((name) => [name, "ref"])),
    };
  });
}

// Everything, in one list. Sources that failed contribute nothing and are
// reported instead, so a column can say it could not load rather than lying
// about being empty.
export function buildBoard(sources, today) {
  const s = sources || {};
  return []
    .concat(issueCards(s.issues, today))
    .concat(replyCards({ enquiries: s.enquiries, tickets: s.tickets }, today))
    .concat(requestCards(s.requests, today))
    .concat(depositCards(s.deposits, today))
    .concat(planningCards(s.planning, today))
    .concat(materialCards(s.materials, today))
    .concat(lateCards(s.late, today))
    .concat(balanceCards(s.balances, today))
    .concat(chaseCards({ quotes: s.quotes, payments: s.payments, variations: s.variations }, today));
}
