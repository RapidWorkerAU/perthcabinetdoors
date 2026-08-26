// WHO WE ARE, ON ANYTHING A CUSTOMER KEEPS.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The tax invoice read these off pcd_business_defaults:
//
//     businessDefaults.phone || "+61 0405263332"
//
// pcd_business_defaults has no phone column. It has no email column and no abn
// column either. So that read was always undefined, the fallback always won,
// and every tax invoice we have ever issued carried a PERSONAL MOBILE NUMBER as
// the business contact. Nobody could see it was a fallback, because a fallback
// that always fires looks exactly like a value.
//
// These are constants, not settings, and they are written here as constants so
// that cannot happen again. If they ever do need to be editable, they get real
// columns and a form, not an optional read with a guess behind it.
//
// ── ONE DEFINITION ───────────────────────────────────────────────────────────
//
// Every document, email and PDF that names the business reads from here. The
// public website pages still have the phone number typed into their markup as
// tel: links; those are correct, but they are copies, and the next number
// change has to go through them too.

/** The mailbox a customer should reach us on. Monitored. */
export const SALES_EMAIL = "sales@perthcabinetdoors.com.au";

/** The number to print. NOT anybody's mobile. */
export const BUSINESS_PHONE = "0437 750 990";

/** The legal entity behind the trading name, for tax documents. */
export const BUSINESS_ABN = "27617956215";
export const TRADING_NAME = "Perth Cabinet Doors";
export const LEGAL_ENTITY = "AL & JP Pty Ltd";

/**
 * The "who we are" block on a tax invoice, in the order it prints.
 *
 * Returned as lines rather than a string because the PDF writer places each one
 * itself; an empty string is a deliberate blank line.
 */
export const INVOICE_BUSINESS_LINES = [
  `${TRADING_NAME} is a trading`,
  `entity under ${LEGAL_ENTITY}.`,
  "",
  "Email:",
  SALES_EMAIL,
  `ABN: ${BUSINESS_ABN}`,
  `Phone: ${BUSINESS_PHONE}`,
];

/** Who a customer with a billing question should ask for. */
export const ACCOUNTS_CONTACT = "Jason Phillips";
