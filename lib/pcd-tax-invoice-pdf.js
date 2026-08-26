// THE TAX INVOICE, DRAWN.
//
// Laid out to match the Xero invoices this replaces, because the customer has
// had those for years and a document that looks like a different company's is
// a document somebody rings up about.
//
// WHAT IS DELIBERATELY NOT ON IT. No due date, no bank details, no pay online,
// no QR code, no card logos. It is issued once the job is paid in full, so
// there is nothing to pay and every one of those would be an instruction to do
// something that is already done. What stays is the money SUMMARY, because that
// is what makes it useful as a receipt: it says what the work cost, what the
// GST on it was, and that it is settled.
//
// The drawing primitives are lib/pcd-cabinet-pdf.js's, so this is the same
// engine and the same fonts as the quote and the production sheet.

// The same engine and the same fonts as the quote and the production sheet, so
// the three documents a customer sees are drawn by one thing rather than by
// three that render slightly differently.
import { PdfDocument, loadLogo, MARGIN, PORTRAIT_PAGE_WIDTH, PORTRAIT_PAGE_HEIGHT } from "./pcd-cabinet-pdf";
import { toNumber } from "./pcd-quote-utils";
// Real Helvetica advance widths. The shared page.text right-aligns using a flat
// rate per character, which is close enough to wrap a paragraph and nowhere
// near close enough to LINE UP: it put the business block 23pt short of the
// column of figures under it, because it thought a line of narrow letters was
// the wider of the two.
import { textWidth } from "./pcd-pdf-text-width";
import { DETAIL_SEPARATOR } from "./pcd-tax-invoice";
import {
  ACCOUNTS_CONTACT,
  BUSINESS_PHONE,
  INVOICE_BUSINESS_LINES,
  SALES_EMAIL,
} from "./pcd-business-identity";

const INK = [0.1, 0.1, 0.09];
const MUTED = [0.42, 0.42, 0.39];
const RULE = [0.86, 0.85, 0.8];
const HEAVY = [0.1, 0.1, 0.09];

const RIGHT = PORTRAIT_PAGE_WIDTH - MARGIN;
const WIDTH = RIGHT - MARGIN;

// THE TABLE IS A TABLE, so every cell has its own boundary and stays inside it.
//
// It was a set of x positions to align against, with the description given a
// width that ran 19pt past where the Quantity column began. Nothing overlapped
// exactly, so nothing looked broken, but a long description ran on under the
// Quantity heading and read as though it had spilled into the next column.
//
// Laid out from the RIGHT, because the four figure columns need a known width
// and the description takes whatever is left.
const CELL_PAD = 9;

const NUMERIC_COLUMNS = [
  { key: "qty", head: "Quantity", width: 62 },
  { key: "price", head: "Price", width: 72 },
  { key: "tax", head: "Tax", width: 52 },
  { key: "total", head: "Total", width: 78 },
];

const NUMERIC_WIDTH = NUMERIC_COLUMNS.reduce((sum, column) => sum + column.width, 0);

/** Every column as a band, left to right, description first. */
const BANDS = (() => {
  const bands = { description: { left: MARGIN, right: MARGIN + WIDTH - NUMERIC_WIDTH } };
  let x = bands.description.right;
  NUMERIC_COLUMNS.forEach((column) => {
    bands[column.key] = { left: x, right: x + column.width };
    x += column.width;
  });
  return bands;
})();

/** Where right aligned text in a cell ends, padded off the boundary. */
const cellRight = (key) => BANDS[key].right - CELL_PAD;
/** How much room a cell's text actually has. */
const cellWidth = (key) => BANDS[key].right - BANDS[key].left - CELL_PAD * 2;

const DESCRIPTION_WIDTH = BANDS.description.right - BANDS.description.left - CELL_PAD;

function money(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency || "AUD",
    currencyDisplay: "narrowSymbol",
  }).format(toNumber(value));
}

/** Plain, so a column of figures lines up without a symbol on every row. */
function plain(value) {
  return toNumber(value).toFixed(2);
}

function longDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Perth",
  }).format(date);
}

/**
 * Right aligned to a real measured width.
 *
 * Drawn LEFT aligned from a computed x rather than by passing align:"right", so
 * this is exact without changing how every other document in the app measures
 * its own text.
 */
function right(page, value, rightX, y, size, options = {}) {
  const shown = String(value ?? "");
  page.text(shown, rightX - textWidth(shown, size, options), y, size, options);
}

/** Greedy wrap at a width, in the font size given. */
function wrap(value, width, size) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  const fits = (candidate) => textWidth(candidate, size) <= width;
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate) || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// THE DESCRIPTION CELL IS TWO THINGS, not one paragraph.
//
// The name of the item on its own line, bold, so a customer scanning the
// invoice for what they bought finds it without reading a sentence. Everything
// else underneath it, smaller, italic and grey, with its groups separated so
// they can be told apart at a glance.
const TITLE_SIZE = 9;
const DETAIL_SIZE = 8;
// Baseline to baseline. The first gap is bigger because it steps down from the
// bold name to the small print.
const TITLE_TO_DETAIL = 11;
const DETAIL_TO_DETAIL = 10;

/** The two halves of a description cell, wrapped to the column. */
function describeCell(line) {
  const title = String(line.title || line.description || "").trim();
  const detail = (line.details || []).join(DETAIL_SEPARATOR);
  return {
    title,
    detailLines: detail ? wrap(detail, DESCRIPTION_WIDTH, DETAIL_SIZE) : [],
  };
}

/** Top of the name's glyphs to the bottom of the last detail line. */
function describeHeight(detailCount) {
  if (!detailCount) return TITLE_SIZE * (ASCENT + DESCENT);
  return (
    TITLE_SIZE * ASCENT +
    TITLE_TO_DETAIL +
    (detailCount - 1) * DETAIL_TO_DETAIL +
    DETAIL_SIZE * DESCENT
  );
}

function rowHeight(line) {
  const { detailLines } = describeCell(line);
  return Math.max(26, describeHeight(detailLines.length) + 14);
}

/** How many rows fit on each page, so a long order does not run off the bottom. */
export function paginateInvoiceLines(lines, firstPageTop, laterPageTop, bottom) {
  const pages = [];
  let current = [];
  let y = firstPageTop;
  lines.forEach((line) => {
    const height = rowHeight(line);
    if (y + height > bottom && current.length) {
      pages.push(current);
      current = [];
      y = laterPageTop;
    }
    current.push(line);
    y += height;
  });
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

function drawMasthead(page, invoice, businessDefaults) {
  // Logo left, the words "Tax Invoice" right, exactly as the ones this replaces.
  if (page.hasLogo) page.image("Logo", MARGIN, MARGIN, 168, 34);
  page.fillColor(INK);
  right(page, "Tax Invoice", RIGHT, MARGIN + 4, 20, { bold: true });

  let y = MARGIN + 58;
  page.fillColor(INK);
  page.text(invoice.customer.name || "Customer", MARGIN, y, 10.5);
  page.fillColor(MUTED);
  if (invoice.customer.email) page.text(invoice.customer.email, MARGIN, y + 15, 9.5);
  if (invoice.customer.address) {
    wrap(invoice.customer.address, 240, 9.5).forEach((line, index) => {
      page.text(line, MARGIN, y + 30 + index * 12, 9.5);
    });
  }

  // Who we are, right aligned, the same wording as the invoices this replaces.
  //
  // READ FROM CONSTANTS, NOT FROM businessDefaults. These used to be
  // `businessDefaults.phone || "+61 0405263332"` and friends, and
  // pcd_business_defaults has no phone, email or abn column, so the fallback
  // won every single time: every invoice we have issued carried a personal
  // mobile as the business number. A fallback that always fires is
  // indistinguishable from a value, which is why it went unnoticed.
  // See lib/pcd-business-identity.js.
  const business = INVOICE_BUSINESS_LINES;
  business.forEach((line, index) => {
    if (!line) return;
    page.fillColor(MUTED);
    right(page, line, RIGHT, y + index * 13, 9.5);
  });

  return y + business.length * 13 + 18;
}

function drawSummaryStrip(page, invoice, top) {
  // Three, across the full width. Reference said the same thing the invoice
  // number already says on a job whose reference is its own quote, so it was a
  // column of nothing. Due date went for the same reason it is not in the
  // totals: this is issued once the job is paid.
  const cells = [
    { label: "Amount due", value: money(invoice.due, invoice.currency) },
    { label: "Issue date", value: longDate(invoice.issuedOn) },
    { label: "Invoice number", value: invoice.number },
  ];
  const step = WIDTH / cells.length;
  cells.forEach((cell, index) => {
    const x = MARGIN + step * index;
    page.fillColor(MUTED);
    page.text(cell.label, x, top, 9);
    page.fillColor(INK);
    page.text(cell.value, x, top + 17, 14, { bold: true });
  });
  return top + 50;
}

function drawTableHead(page, top) {
  page.fillColor(MUTED);
  page.text("Description", BANDS.description.left, top, 9);
  NUMERIC_COLUMNS.forEach((column) => right(page, column.head, cellRight(column.key), top, 9));

  const ruleY = top + 15;
  page.strokeColor(HEAVY);
  page.line(MARGIN, ruleY, RIGHT, ruleY);
  return ruleY;
}

// A line of text sits between its ascender and its descender. Centring on the
// baseline alone puts a row noticeably high in its band.
const ASCENT = 0.72;
const DESCENT = 0.21;
const LINE_GAP = 12;

/** The baseline that centres a block of `lines` lines in a band. */
function centredBaseline(bandTop, bandHeight, lineCount, size) {
  const blockHeight = (lineCount - 1) * LINE_GAP + size * (ASCENT + DESCENT);
  return bandTop + (bandHeight - blockHeight) / 2 + size * ASCENT;
}

function drawRow(page, line, rowTop, gstRate) {
  const { title, detailLines } = describeCell(line);
  const height = rowHeight(line);

  // The whole block centred in the band, then drawn downwards from the name.
  const blockHeight = describeHeight(detailLines.length);
  const firstBaseline = rowTop + (height - blockHeight) / 2 + TITLE_SIZE * ASCENT;

  page.fillColor(INK);
  page.text(title, BANDS.description.left, firstBaseline, TITLE_SIZE, { bold: true });

  page.fillColor(MUTED);
  detailLines.forEach((part, index) =>
    page.text(
      part,
      BANDS.description.left,
      firstBaseline + TITLE_TO_DETAIL + index * DETAIL_TO_DETAIL,
      DETAIL_SIZE,
      { italic: true }
    )
  );
  page.fillColor(INK);

  // The figures sit on the FIRST line of the description, which is where the
  // eye goes, rather than centred against a description that may be two lines.
  const values = {
    qty: String(line.qty),
    price: plain(line.unitPriceExGst),
    tax: `${Math.round(gstRate * 100)}%`,
    total: plain(line.totalExGst),
  };
  NUMERIC_COLUMNS.forEach((column) =>
    right(page, values[column.key], cellRight(column.key), firstBaseline, 9)
  );

  page.strokeColor(RULE);
  page.line(MARGIN, rowTop + height, RIGHT, rowTop + height);
  return rowTop + height;
}

function drawTotals(page, invoice, top) {
  // BANDS, like the table above it, rather than a stack of baselines.
  //
  // It was the second: each row was drawn a fixed step below the last, so the
  // first one sat almost against the rule closing the table and the rest drifted
  // wherever the step left them. Every row now owns a band of known height and
  // its text is centred in it, so the air above a line equals the air below it
  // whatever size the row is set in.
  const labelX = BANDS.price.left;
  const valueRight = cellRight("total");
  let y = top;

  // ONE BAND HEIGHT FOR EVERY ROW, and a rule drawn ON a band boundary rather
  // than in a gap of its own.
  //
  // The gap used to be there, and it is what made the block look uneven: a row
  // sat 7.4pt below the rule above it and 12.6pt above the rule below it, so
  // the same separator had different air on each side. With the rule on the
  // boundary, the air above it and below it are both the band's own padding,
  // which is the same number by construction.
  const ROW_HEIGHT = 24;

  const band = (label, value, { bold = false, italic = false, ruleAbove = false } = {}) => {
    if (ruleAbove) {
      page.strokeColor(RULE);
      page.line(labelX, y, RIGHT, y);
    }
    const size = bold ? 10 : 9.5;
    const baseline = centredBaseline(y, ROW_HEIGHT, 1, size);
    page.fillColor(bold ? INK : MUTED);
    page.text(label, labelX, baseline, size, { bold, italic });
    page.fillColor(INK);
    right(page, value, valueRight, baseline, size, { bold, italic });
    y += ROW_HEIGHT;
  };

  band("Subtotal", plain(invoice.subtotal));
  band(`Total GST ${Math.round(invoice.gstRate * 100)}%`, plain(invoice.gst));
  band("Total", plain(invoice.total), { bold: true, ruleAbove: true });
  // Kept, and this is the point of the document: it says the job is settled.
  band("Less amount paid", plain(invoice.paid), { italic: true });
  if (invoice.refunded > 0) band("Less refunded", plain(invoice.refunded), { italic: true });
  band("Amount due", money(invoice.due, invoice.currency), { bold: true, ruleAbove: true });

  return y + 10;
}

function drawFooter(page, invoice, top, businessDefaults) {
  let y = top + 10;

  // What a bank block and a pay-online button would have said, replaced by the
  // one sentence that is true: it is done.
  page.fillColor(INK);
  page.text("This invoice has been paid in full. Thank you.", MARGIN, y, 10, { bold: true });
  y += 22;

  page.fillColor(MUTED);
  // Constants, for the same reason as the masthead: businessDefaults has no
  // email column and no accountsContact column, so both of these were phantom
  // reads whose fallback always won. The name stays written out because there
  // is nowhere to configure it and pretending otherwise is what caused this.
  [
    `For accounts enquiries, please contact ${ACCOUNTS_CONTACT} at ${SALES_EMAIL} or ${BUSINESS_PHONE}.`,
    "Please retain this invoice for your records.",
  ].forEach((line) => {
    wrap(line, WIDTH, 9).forEach((part) => {
      page.text(part, MARGIN, y, 9);
      y += 12;
    });
  });
  return y;
}

/**
 * @param {object} input
 * @param {object} input.invoice           from taxInvoiceModel
 * @param {object} [input.businessDefaults] email, phone, abn, accountsContact
 * @returns {Buffer}
 */
export function generateTaxInvoicePdf({ invoice, businessDefaults = {} }) {
  // An invoice that does not add up is a tax document that is wrong, which is
  // worse than not having one. The caller checks this too; this is the last
  // gate before ink.
  if (!invoice?.reconciled) {
    throw new Error(
      "The invoice lines do not add up to what the order says it charged, so it has not been issued. " +
        "Check the order's costs and totals."
    );
  }

  const logo = loadLogo();
  const pdf = new PdfDocument({ logo, producer: "PCD tax invoice" });

  const firstTop = 250;
  const laterTop = MARGIN + 40;
  const bottom = 640;
  const pages = paginateInvoiceLines(invoice.lines, firstTop, laterTop, bottom);

  pages.forEach((rows, pageIndex) => {
    pdf.addPage((page) => {
      page.hasLogo = Boolean(logo);
      let y;
      if (pageIndex === 0) {
        const afterMasthead = drawMasthead(page, invoice, businessDefaults);
        const afterStrip = drawSummaryStrip(page, invoice, afterMasthead);
        y = drawTableHead(page, Math.max(afterStrip, firstTop - 26));
      } else {
        page.fillColor(MUTED);
        page.text(`Tax Invoice ${invoice.number}`, MARGIN, MARGIN, 9);
        right(page, `Page ${pageIndex + 1} of ${pages.length}`, RIGHT, MARGIN, 9);
        y = drawTableHead(page, laterTop);
      }

      rows.forEach((line) => {
        y = drawRow(page, line, y, invoice.gstRate);
      });

      if (pageIndex === pages.length - 1) {
        const afterTotals = drawTotals(page, invoice, y);
        drawFooter(page, invoice, afterTotals, businessDefaults);
      }
    // A4 PORTRAIT. The shared engine defaults to landscape, which is right for
    // a cut list and wrong for anything a customer files: an invoice that comes
    // out sideways is one they cannot put with their other invoices.
    }, { width: PORTRAIT_PAGE_WIDTH, height: PORTRAIT_PAGE_HEIGHT });
  });

  return pdf.toBuffer();
}
