import AdminShell from '../_components/AdminShell'
import { requireAdminSession } from '../../../lib/admin-guard'
import { createSupabaseAdminClient } from '../../../lib/supabase/admin'
import { buildBoard, daysUntil } from '../../../lib/pcd-board'
import { applyDismissals } from '../../../lib/pcd-board-dismissal'
import { primaryIdIndex } from '../../../lib/pcd-customer-links'
import { issueKindLabel } from '../../../lib/pcd-order-issues'
import BoardClient from './BoardClient'

export const dynamic = 'force-dynamic'

// Panels a supplier makes carry an order status; the ones we cut carry a
// production stage. "Nothing has moved" has to mean the start of whichever
// list applies, or a job that is part supplier made can never be judged.
const START_OF_LIST = new Set(['Not Started', 'Not Ordered'])

type Json = Record<string, unknown>

function panelPlans(item: Json): Json[] {
  const planning = item?.panel_planning
  if (!planning || typeof planning !== 'object' || Array.isArray(planning)) return []
  return Object.values(planning as Record<string, Json>).filter(
    (value): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  )
}

// A panel's decisions come from its own plan first, then the line it sits on.
// Both can be blank, which is the point: an undecided panel has to read as
// undecided rather than falling back to a guess.
function panelsOf(item: Json) {
  const plans = panelPlans(item)
  if (plans.length) return plans
  return [{ fulfilment_method: item.fulfilment_method, status: item.status, production_stage: item.production_stage }]
}

export default async function AdminBoardPage() {
  await requireAdminSession()
  const supabase = createSupabaseAdminClient()
  // THE DATE HERE, NOT THE DATE IN LONDON.
  //
  // Every age on this board is worked out from this. Taken as UTC it was a day
  // behind for the first eight hours of every working day in Perth, so cards
  // crossed the 8 and 15 day marks a day late, all morning, every day.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date())

  // Read first, so everything that hangs off an order can be scoped to the ones
  // actually on the board rather than the whole table.
  // Finished jobs are read as well as live ones. A job leaving the board the
  // moment it was marked complete took whatever it was still owed with it, and
  // only the deposit is ever raised as a payment automatically, so an unasked
  // balance had nowhere to show up at all.
  // Archived orders are not in any of these status lists, so they are off the
  // board, and the payments, items and issues below are all read by the ids of
  // the orders that are.
  const ordersQ = await supabase.from('pcd_orders')
    .select('id, order_number, name, customer_id, customer_name, customer_email, status, accepted_at, created_at, completed_at, total_inc_gst, scheduled_start_date, production_lead_days, target_completion_date, deposit_amount')
    .in('status', ['pending_deposit', 'active', 'complete'])
  const liveOrderIds = (ordersQ.data || []).map(o => o.id)

  const [
    issuesQ, enquiriesQ, ticketsQ, messagesQ, requestsQ, requestLinesQ,
    itemsQ, paymentsQ, quotesQ, variationsQ, customersQ,
  ] = await Promise.all([
    supabase.from('pcd_order_issues').select('*').is('resolved_at', null),
    supabase.from('pcd_enquiries').select('id, customer_id, customer_name, customer_email, topic, message, created_at')
      .in('status', ['new', 'in_progress']),
    supabase.from('pcd_tickets').select('id, customer_id, subject, status, last_message_at').neq('status', 'closed'),
    // Who spoke last on a ticket, and when we last wrote to an address. Both
    // are asked of the database rather than pulled here and sifted, so there
    // is no cap to silently fall off the end of.
    supabase.rpc('pcd_board_message_state'),
    supabase.from('pcd_quote_requests').select('id, customer_id, customer_name, customer_email, product_name, source, status, converted_quote_id, created_at')
      // waiting_on_customer is deliberately not here. The column says "send a
      // formal quote", and that status means somebody has already answered them
      // and is waiting on THEM, so it is not the next thing for us to do. Three
      // of the five cards in this column were in that state.
      //
      // converted_to_quote IS here now, and used to be the way off this board.
      // Converting only creates a DRAFT, which nothing else looks at, so
      // clicking convert silenced the card while the customer still had
      // nothing. The card stays until a quote is actually sent; see below.
      .in('status', ['new', 'reviewing', 'converted_to_quote']),
    supabase.from('pcd_quote_request_line_items').select('id, quote_request_id'),
    // Scoped to the orders on the board. Reading every line item on every order
    // ever raised was the most expensive thing on this page.
    supabase.from('pcd_order_line_items').select('id, order_id, status, production_stage, fulfilment_method, panel_planning')
      .in('order_id', liveOrderIds),
    // Paid rows as well as unpaid. What is still owed on a finished job is the
    // total less what has been paid, which cannot be worked out from the unpaid
    // rows alone: a balance nobody raised has no row.
    supabase.from('pcd_order_payments').select('id, order_id, payment_type, amount, is_paid, requested_at, created_at')
      .in('order_id', liveOrderIds),
    supabase.from('pcd_quotes').select('id, quote_number, title, customer_id, customer_name, customer_email, status, sent_at, viewed_at, total_inc_gst')
      .in('status', ['sent', 'viewed']),
    supabase.from('pcd_order_variations').select('id, order_id, title, status, sent_at, total_inc_gst')
      .in('status', ['sent', 'viewed']).in('order_id', liveOrderIds),
    supabase.from('pcd_customers').select('id, name, email, company_name, merged_into_id'),
  ])

  // WHICH SOURCE FAILED, not whether anything did. A query that errors returns
  // no rows, and no rows renders as a confident empty column. Tracked per
  // source so the column that cannot be trusted is the one that says so.
  const failed = new Set<string>()
  const rows = <T,>(q: { data: T[] | null; error: unknown }, source: string, table: string): T[] => {
    if (q.error) {
      failed.add(source)
      // Named, so a broken board can be diagnosed from the terminal rather than
      // by guessing which of a dozen queries it was.
      console.error(`[board] ${table} failed:`, (q.error as { message?: string })?.message || q.error)
    }
    return q.data || []
  }

  const issues = rows(issuesQ, 'issues', 'pcd_order_issues')
  const enquiries = rows(enquiriesQ, 'messages', 'pcd_enquiries')
  const tickets = rows(ticketsQ, 'messages', 'pcd_tickets')
  // { last_by_ticket: [...], last_outbound: [...], last_inbound: [...] }
  const messageState = (messagesQ.error ? null : messagesQ.data) as {
    last_by_ticket?: { ticket_id: string; direction: string; created_at?: string }[]
    last_outbound?: { email: string; sent_at: string }[]
    last_inbound?: { email: string; received_at: string }[]
  } | null
  if (messagesQ.error) failed.add('messages')
  const requests = rows(requestsQ, 'requests', 'pcd_quote_requests')
  const requestLines = rows(requestLinesQ, 'requests', 'pcd_quote_request_line_items')
  const orders = rows(ordersQ, 'orders', 'pcd_orders')
  const items = rows(itemsQ, 'orders', 'pcd_order_line_items')
  const allPayments = rows(paymentsQ, 'sent', 'pcd_order_payments')
  // The columns below were written against unpaid rows only, so they keep that.
  const payments = allPayments.filter(p => !p.is_paid)
  const quotes = rows(quotesQ, 'sent', 'pcd_quotes')
  const variations = rows(variationsQ, 'sent', 'pcd_order_variations')
  const customers = rows(customersQ, 'messages', 'pcd_customers')

  const customerById = new Map(customers.map(c => [c.id, c]))
  const customerByEmail = new Map(customers.filter(c => c.email).map(c => [String(c.email).toLowerCase(), c]))

  // ONE PERSON, ONE CARD, EVEN WITH TWO RECORDS.
  //
  // The same person writes from two addresses and the mail sync makes a second
  // customer record, so Kristy Smith was on the board twice: once under her
  // outlook address and once under her gmail one. Where those records have been
  // merged, everything here reads through the primary, so they collapse into one
  // card and one clock. Nothing was moved to make that true.
  const primaryId = primaryIdIndex(customers as { id: string; merged_into_id?: string | null }[])
  const asPrimary = (id?: string | null) => (id ? primaryId.get(id) || id : null)
  // WHO A CARD IS ABOUT, resolved once.
  //
  // Always through the primary record, so a card about somebody with two
  // customer rows links to the one their history is on rather than the empty
  // duplicate the mail sync made. Falls back to matching the address, which is
  // how a website enquiry or a quote request from a sender nobody has linked
  // yet still finds their record once one exists.
  const whoIsIt = (customerId?: string | null, email?: string | null): string | null => {
    const direct = asPrimary(customerId)
    if (direct) return direct
    const byEmail = email ? customerByEmail.get(String(email).trim().toLowerCase()) : null
    return asPrimary(byEmail?.id as string | undefined) || null
  }

  const orderById = new Map(orders.map(o => [o.id, o]))
  const itemsByOrder = new Map<string, Json[]>()
  items.forEach(item => {
    const list = itemsByOrder.get(item.order_id) || []
    list.push(item as Json)
    itemsByOrder.set(item.order_id, list)
  })

  // ── who spoke last ────────────────────────────────────────────────────────
  //
  // When we last wrote to each address, and the test that uses it. Matched on
  // the address rather than a customer link, so it works on rows that were never
  // joined to a customer record.
  const outboundByEmail = new Map<string, string>()
  ;(messageState?.last_outbound || []).forEach(m => {
    if (m.email) outboundByEmail.set(String(m.email).toLowerCase(), String(m.sent_at))
  })
  const answered = (email?: string | null, since?: string | null) => {
    if (!email || !since) return false
    const last = outboundByEmail.get(String(email).toLowerCase())
    return Boolean(last && last > since)
  }

  const lastByTicket = new Map<string, { direction: string; at: string }>()
  ;(messageState?.last_by_ticket || []).forEach(m =>
    lastByTicket.set(m.ticket_id, { direction: m.direction, at: String(m.created_at || '') })
  )

  // ONE CARD PER CUSTOMER. Whose turn it is is a question about a PERSON, not
  // about an email thread: a reply usually starts a new thread rather than
  // landing back on the old one, so judging it per thread left customers we
  // had answered sitting on the board, and put anyone with three threads on it
  // three times. Threads still decide which conversations are waiting; the
  // person is what gets a card.
  // A THREAD ONLY COUNTS IF IT IS NEWER THAN OUR LAST REPLY TO THAT PERSON.
  //
  // This is the second half of the same fix, and without it the card was still
  // wrong. Grouping by customer stopped one person taking three cards, but the
  // card was timed from their oldest waiting thread, so Kristy Smith, who we
  // answered 13 days ago and who wrote back 12 days ago, showed as 35 days
  // overdue because a stale thread from July was still in the group.
  //
  // A thread whose last message came BEFORE our last reply has been overtaken.
  // We answered that customer; whether the reply threaded onto that particular
  // conversation is an email client's business, not ours. Only what came after
  // our reply is still owed, and that is what the clock should count.
  // Every address that reaches this person, so a reply sent to either of a
  // merged pair counts as having answered them.
  const addressesFor = (customerId?: string | null) => {
    const primary = asPrimary(customerId)
    if (!primary) return []
    return customers
      .filter(c => c.id === primary || c.merged_into_id === primary)
      .map(c => String(c.email || '').trim().toLowerCase())
      .filter(Boolean)
  }

  const lastReplyTo = (customerId?: string | null) => {
    const sent = addressesFor(customerId)
      .map(email => outboundByEmail.get(email) || '')
      .filter(Boolean)
      .sort()
    return sent.length ? sent[sent.length - 1] : ''
  }

  const waitingThreads = tickets.filter(t => {
    const last = lastByTicket.get(t.id)
    if (last?.direction !== 'inbound') return false
    const replied = lastReplyTo(t.customer_id as string)
    // No reply on record to that person at all: everything they sent is still
    // waiting, however long ago.
    if (!replied) return true
    return String(last.at || '') > replied
  })

  const byCustomer = new Map<string, {
    key: string
    ticket: Json
    customerId: string | null
    customerName: string | null
    subjects: string[]
    oldest: string
    newest: string
  }>()

  waitingThreads.forEach(t => {
    const last = lastByTicket.get(t.id)
    const at = last?.at || String(t.last_message_at || '')
    // Grouped by customer where there is one, and by the thread otherwise, so a
    // sender we have never linked to a record still gets their own card rather
    // than being lumped in with every other unlinked email.
    const key = t.customer_id ? `customer:${asPrimary(t.customer_id as string)}` : `ticket:${t.id}`
    const existing = byCustomer.get(key)
    if (!existing) {
      byCustomer.set(key, {
        key,
        ticket: t as Json,
        customerId: asPrimary(t.customer_id as string),
        customerName: customerById.get(asPrimary(t.customer_id as string) || '')?.name
          || customerById.get(t.customer_id || '')?.name || null,
        subjects: [String(t.subject || 'No subject')],
        oldest: at,
        newest: at,
      })
      return
    }
    existing.subjects.push(String(t.subject || 'No subject'))
    if (at && at < existing.oldest) {
      existing.oldest = at
      // The card names the conversation that has been waiting longest, because
      // that is the one that is actually overdue an answer.
      existing.ticket = t as Json
    }
    if (at && at > existing.newest) existing.newest = at
  })

  // AND THEN: have we written to them since, on ANY thread?
  //
  // This is the bug as it was reported. A thread sat on the board saying we had
  // never replied while the customer profile showed a fortnight of back and
  // forth, because our reply had started a new thread and the old one could not
  // see it. Judging the turn per thread is what made that possible; asking it
  // of the PERSON is what fixes it.
  const openTickets = Array.from(byCustomer.values())
    .map(group => ({
      ...group.ticket,
      customerName: group.customerName,
      customerId: group.customerId,
      subjectId: group.customerId || group.ticket.id,
      waitingThreads: group.subjects.length,
      oldestUnanswered: group.oldest,
      newestInbound: group.newest,
    }))

  const openEnquiries = enquiries
    .filter(e => !answered(e.customer_email, e.created_at))
    .map(e => ({ ...e, customerId: whoIsIt(e.customer_id as string, e.customer_email as string) }))

  // When each customer last wrote to us, whatever thread it was on. Used to flip
  // a quote between "chase them" and "answer them".
  const inboundByEmail = new Map<string, string>()
  ;(messageState?.last_inbound || []).forEach(m => {
    if (m.email) inboundByEmail.set(String(m.email).toLowerCase(), String(m.received_at))
  })

  // ── quote requests ────────────────────────────────────────────────────────
  const lineCount = new Map<string, number>()
  requestLines.forEach(l => lineCount.set(l.quote_request_id, (lineCount.get(l.quote_request_id) || 0) + 1))
  // Whether the quote a request became has actually gone out. The quotes read
  // above are only the sent and viewed ones, so a draft has to be asked for by
  // id: not finding one is not the same as one having been sent.
  const convertedIds = requests.map(r => r.converted_quote_id).filter(Boolean) as string[]
  const draftsQ = convertedIds.length
    ? await supabase.from('pcd_quotes').select('id, quote_number, status, sent_at, created_at').in('id', convertedIds)
    : { data: [] as Json[], error: null }
  if (draftsQ.error) failed.add('requests')
  const quoteById = new Map<string, Json>((draftsQ.data || []).map(q => [String(q.id), q as Json] as [string, Json]))

  // A REQUEST IS ANSWERED BY A QUOTE, NOT BY AN EMAIL.
  //
  // The old rule also cleared the card if we had written to that address since,
  // which reads as answered on a column that says "send a formal quote". Saying
  // "I will get you a price next week" is not a price. The card now goes when
  // one is sent, when the request is closed or marked waiting on them, or when
  // somebody sets it aside with a reason.
  const openRequests = requests
    .filter(r => {
      if (!r.converted_quote_id) return true
      const quote = quoteById.get(r.converted_quote_id as string)
      // A quote we cannot find is not a quote that was sent.
      return !quote?.sent_at
    })
    .map(r => {
      const quote = r.converted_quote_id ? quoteById.get(r.converted_quote_id as string) : null
      return {
        ...r,
        itemCount: lineCount.get(r.id) || 0,
        customerId: whoIsIt(r.customer_id as string, r.customer_email as string),
        company_name: customerByEmail.get(String(r.customer_email || '').toLowerCase())?.company_name || null,
        draftQuoteId: quote?.id || null,
        draftQuoteNumber: quote?.quote_number || null,
        draftQuoteAt: quote?.created_at || null,
      }
    })

  // ── orders, split four ways ───────────────────────────────────────────────
  const requestedByOrder = new Map<string, string>()
  payments.filter(p => p.payment_type === 'deposit' && p.requested_at)
    .forEach(p => requestedByOrder.set(p.order_id, p.requested_at as string))

  const deposits = orders
    .filter(o => o.status === 'pending_deposit')
    .map(o => ({ ...o, requested_at: requestedByOrder.get(o.id) || null, customerId: whoIsIt(o.customer_id as string, o.customer_email as string) }))

  const active = orders.filter(o => o.status === 'active')

  // A JOB IS NOT READY TO SCHEDULE UNTIL IT IS PAID FOR. Every active order was
  // raising a planning card because none of them carries a start date or a
  // timeframe, which read as thirteen problems when it is one habit. The card
  // now waits until the deposit is in, so it appears when the job becomes real
  // and there is actually something to book onto the bench.
  const depositPaid = new Set(
    payments.filter(p => p.payment_type === 'deposit' && p.is_paid).map(p => p.order_id as string)
  )

  const planning: Json[] = []
  const materials: Json[] = []
  const late: Json[] = []

  active.forEach(order => {
    const lines = itemsByOrder.get(order.id) || []
    const panels = lines.flatMap(panelsOf)

    // Planning: the schedule, or the panel decisions.
    const missing: string[] = []
    if (!order.scheduled_start_date) missing.push('Scheduled start')
    if (!order.production_lead_days) missing.push('How long it takes')
    const undecided = panels.filter(p => !p.fulfilment_method).length
    if (undecided) missing.push('Item planning')
    if (missing.length && (depositPaid.has(order.id as string) || !order.deposit_amount)) {
      planning.push({
        ...order,
        customerId: whoIsIt(order.customer_id as string, order.customer_email as string),
        missing,
        panelsMissing: undecided > 0,
        why: [
          !order.scheduled_start_date && !order.production_lead_days
            ? 'No start date and no timeframe, so the job has no due date.'
            : !order.scheduled_start_date
              ? 'No start date, so it cannot be booked onto the bench.'
              : !order.production_lead_days
                ? 'Has a start date but no timeframe, so the job has no due date.'
                : '',
          undecided ? `${undecided} panel${undecided === 1 ? '' : 's'} with nobody set to make ${undecided === 1 ? 'it' : 'them'}.` : '',
        ].filter(Boolean).join(' '),
      })
    }

    // Materials: starting within a week with panels still unordered.
    const until = daysUntil(order.scheduled_start_date, today)
    const notOrdered = lines.filter(l => l.status === 'Not Ordered').length
    if (notOrdered && until !== null && until <= 7) {
      materials.push({ ...order, notOrdered, customerId: whoIsIt(order.customer_id as string, order.customer_email as string) })
    }

    // Late: past the promised date, or booked in and nothing has moved.
    const overdue = order.target_completion_date ? -1 * (daysUntil(order.target_completion_date, today) ?? 0) : 0
    const startPassed = until !== null && until < 0
    const nothingMoved = panels.length > 0 && panels.every(p => {
      const at = p.production_stage || p.status
      return !at || START_OF_LIST.has(String(at))
    })

    if (overdue > 0) {
      late.push({
        ...order,
        customerId: whoIsIt(order.customer_id as string, order.customer_email as string),
        overdueDays: overdue,
        reasonTag: 'Past due date',
        why: `Past its due date and still active.${nothingMoved ? ' Nothing on it has moved at all.' : ''}`,
      })
    } else if (startPassed && nothingMoved) {
      late.push({
        ...order,
        customerId: whoIsIt(order.customer_id as string, order.customer_email as string),
        overdueDays: Math.abs(until as number),
        reasonTag: 'Never started',
        why: 'Booked to start and every panel is still at the start of its list: Not Started for ours, Not Ordered for the supplier\'s.',
      })
    }
  })

  // ── finished jobs still owed for ──────────────────────────────────────────
  //
  // What is left is the order total less everything marked paid against it.
  // Worked out from the total rather than from the payment rows, because the
  // rows are the problem: only a deposit is ever raised automatically, so a
  // balance nobody has asked for has no row to be found by.
  const paidByOrder = new Map<string, number>()
  const askedByOrder = new Map<string, Json>()
  const paymentMovedAt = new Map<string, string>()
  allPayments.forEach(p => {
    const orderId = p.order_id as string
    const moved = String(p.requested_at || p.created_at || '')
    if (moved > (paymentMovedAt.get(orderId) || '')) paymentMovedAt.set(orderId, moved)
    if (p.is_paid) {
      paidByOrder.set(orderId, (paidByOrder.get(orderId) || 0) + Number(p.amount || 0))
      return
    }
    // The unpaid row that has been asked for, newest request first.
    const held = askedByOrder.get(orderId)
    if (p.requested_at && (!held || String(p.requested_at) > String(held.requested_at || ''))) {
      askedByOrder.set(orderId, p as Json)
    }
  })

  const balances = orders
    .filter(o => o.status === 'complete')
    .map(o => {
      const paid = paidByOrder.get(o.id as string) || 0
      const outstanding = Math.round((Number(o.total_inc_gst || 0) - paid) * 100) / 100
      const asked = askedByOrder.get(o.id as string)
      return {
        ...o,
        customerId: whoIsIt(o.customer_id as string, o.customer_email as string),
        outstanding,
        requestedAt: asked?.requested_at || null,
        // Moves when a payment is raised, requested or paid, so a card set
        // aside comes back if the money situation changes.
        stamp: [String(o.completed_at || ''), paymentMovedAt.get(o.id as string) || '', String(paid)]
          .filter(Boolean).sort().slice(-1)[0] || null,
      }
    })
    // A dollar of rounding is not a debt.
    .filter(b => b.outstanding >= 1)

  // ── things sitting with the customer ──────────────────────────────────────
  const chasePayments = payments
    .filter(p => p.payment_type !== 'deposit' && p.requested_at)
    .filter(p => orderById.get(p.order_id)?.status === 'active')
    .map(p => ({
      ...p,
      orderNumber: orderById.get(p.order_id)?.order_number || null,
      customerName: orderById.get(p.order_id)?.customer_name || null,
      customerId: whoIsIt(
        orderById.get(p.order_id)?.customer_id as string,
        orderById.get(p.order_id)?.customer_email as string
      ),
    }))

  const chaseVariations = variations.filter(v => v.sent_at).map(v => ({
    ...v,
    orderNumber: orderById.get(v.order_id)?.order_number || null,
    customerName: orderById.get(v.order_id)?.customer_name || null,
    customerId: whoIsIt(
      orderById.get(v.order_id)?.customer_id as string,
      orderById.get(v.order_id)?.customer_email as string
    ),
  }))

  // ── issues, named ─────────────────────────────────────────────────────────
  const issueRows = issues.map(i => ({
    ...i,
    kindLabel: issueKindLabel(i.kind),
    orderNumber: orderById.get(i.order_id)?.order_number || null,
    customerName: orderById.get(i.order_id)?.customer_name || null,
    customerId: whoIsIt(
      orderById.get(i.order_id)?.customer_id as string,
      orderById.get(i.order_id)?.customer_email as string
    ),
    panelLabel: i.panel_label || 'a panel',
  }))

  const built = buildBoard(
    {
      issues: issueRows,
      enquiries: openEnquiries,
      tickets: openTickets,
      requests: openRequests,
      deposits,
      planning,
      materials,
      late,
      balances,
      quotes: quotes.filter(q => q.sent_at).map(q => ({
        ...q,
        customerId: whoIsIt(q.customer_id as string, q.customer_email as string),
        repliedAt: inboundByEmail.get(String(q.customer_email || '').toLowerCase()) || null,
      })),
      payments: chasePayments,
      variations: chaseVariations,
    },
    today
  )

  // Cards somebody has set aside, and the mark they were set aside at. A card
  // comes back by itself when the thing it is about moves past that mark: a new
  // email, a reissued quote, another payment request. See
  // lib/pcd-board-dismissal.js.
  const dismissalsQ = await supabase
    .from('pcd_board_dismissals')
    .select('cat, subject_id, seen_stamp')
  if (dismissalsQ.error) failed.add('set aside')
  const { cards, setAsideCount } = applyDismissals(built, dismissalsQ.data || [])

  return (
    <AdminShell>
      <BoardClient
        cards={cards}
        setAsideCount={setAsideCount}
        failed={Array.from(failed)}
        today={today}
        loadedAt={new Date().toISOString()}
      />
    </AdminShell>
  )
}
