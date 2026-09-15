// THE ONE DEFINITION OF WHAT AN ADMIN TABLE LOOKS LIKE.
//
// An audit on 15 September 2026 found ten table styles across twenty six
// files. Most were hand copies of AdminDataTable's classes that had drifted: a
// different header grey here, a row line that stopped a column short there, four
// empty states, five divider colours. Nobody could tell a deliberate difference
// from an accident, because both looked the same in the code.
//
// So there are two kinds of table and nothing else:
//
//   SCROLL     inside one record, where every row is needed while you work: an
//              order's lines, its panels, its payments. A box as tall as the
//              window less the page header, with the header row pinned.
//
//   PAGINATE   a list of records: customers, orders, quotes. AdminDataTable, or
//              raw markup built from these same tokens with AdminPagination
//              under it. 10 rows on a list, 15 on a report.
//
// A table with a real reason to behave differently (the financial ledger's
// totals row, the board cut list that selects on the drawing, the quote items
// editor) keeps that behaviour and still takes its look from here.
//
// Never copy these strings into a page. Import them, so the next change to how
// a table looks is a change to this file and nothing else.

export const tableStyles = {
  // The card every table sits in.
  card: 'overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white',
  // A title, a count, a search box or a button above the table.
  toolbar: 'flex flex-wrap items-center justify-between gap-3 border-b border-[#edf4eb] px-4 py-3',
  title: 'text-[13px] font-semibold text-[#1a1a18]',
  meta: 'text-[11px] text-[#8b8a81]',

  // SCROLL. Vertical scroll in a box sized to the window, and sideways scroll
  // when the columns do not fit. Put `thSticky` on every header cell with it.
  scrollBox: 'overflow-auto md:max-h-[calc(100vh-260px)]',
  // PAGINATE. Sideways scroll only; the page itself carries the height.
  sideScroll: 'overflow-x-auto',

  // The table element. `wide` stops a many-column table being crushed into the
  // card; `fixed` is for a table whose column shares are declared, such as the
  // production list that has to match the printed sheet.
  table: 'w-full border-collapse text-[13px]',
  tableWide: 'w-full min-w-max border-collapse text-[13px]',
  tableFixed: 'w-full table-fixed border-collapse text-[13px]',

  // The line sits on the header CELL, not the row, so it stays put when the
  // header is pinned. A line on a sticky row's <tr> scrolls away with the body.
  th: 'whitespace-nowrap border-b border-[#dbd8cc] bg-[#f5f8f4] px-4 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]',
  thSticky: 'sticky top-0 z-10',

  // The row line sits on every CELL, the last column included. On the row it
  // could not survive a sticky header; left off the last cell it stopped one
  // column short of the edge, which is how most of the drift started.
  td: 'border-b border-[#edf4eb] px-4 py-[11px] align-middle text-[#1a1a18]',
  // On the <tbody>. The card's own edge is the last row's line, so the row line
  // is dropped there rather than drawn twice.
  body: '[&>tr:last-child>td]:border-b-0',
  // Only a row that goes somewhere lights up. Hover on a row that does nothing
  // promises a click that is not there.
  rowClickable: 'cursor-pointer transition-colors hover:bg-[#f5f8f4]',

  // Money and anything added up. Tabular figures so a column of totals lines up.
  num: 'font-mono tabular-nums',

  // Nothing to show. One look everywhere, in a cell spanning every column.
  empty: 'px-4 py-12 text-center text-[13px] text-[#8b8a81]',

  checkbox: 'accent-[#6b9e61]',

  // Below md every table becomes a list of cards.
  desktopOnly: 'hidden md:block',
  mobileList: 'flex flex-col gap-3 md:hidden',
  mobileCard: 'rounded-[8px] border border-[#dbd8cc] bg-white p-4',
} as const

// Rows per page. See AdminPagination, which reads these.
export const LIST_PAGE_SIZE = 10
export const REPORT_PAGE_SIZE = 15
