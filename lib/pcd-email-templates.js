// Re-exported rather than declared, so the address on an email and the address
// on a tax invoice cannot drift apart. See lib/pcd-business-identity.js for why
// that file exists at all.
export { SALES_EMAIL, BUSINESS_PHONE } from "./pcd-business-identity";
import { SALES_EMAIL } from "./pcd-business-identity";

export function uniqueRecipients(...emails) {
  return Array.from(
    new Set(
      emails
        .flat()
        .filter(Boolean)
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// THE LABEL IS BOLD AND THE VALUE IS NOT.
//
// It used to be the other way round here, while the quote email the customer
// actually opens had bold labels. Two patterns, and whichever an email happened
// to use depended on which file it was written in. This is the one definition
// every email in this file reads, so changing it here moves all of them
// together rather than letting them drift further apart.
function rows(items) {
  return items
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;line-height:18px;width:150px;font-weight:700;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;line-height:20px;">${escapeHtml(value || "-")}</td>
        </tr>`
    )
    .join("");
}

export function sourceLabel(source) {
  const labels = {
    request_quote: "Website Quote Form",
    product_detail: "Product Page Enquiry",
    design_tool: "Website Design Tool",
  };
  return labels[source] || source || "-";
}

function cleanLineColour(line = {}) {
  const colour = String(line.colour || "").trim();
  const finish = String(line.finish || "").trim();
  if (finish && colour.toLowerCase().startsWith(`${finish.toLowerCase()} - `)) {
    return colour.slice(finish.length + 3).trim();
  }
  return colour;
}

// HEIGHT FIRST, and the column heading above says so. They disagreed once:
// the values were flipped to height-first to match the rest of the site and
// the heading stayed at "W x H", so "700 x 400" meant a 700 wide door to
// anyone reading the heading and a 700 tall door to anyone reading the site.
// If you change the order here, change the heading in quoteLineRows with it.
function lineDimensions(line = {}) {
  const width = line.width || line.width_mm;
  const height = line.height || line.height_mm;
  if (!width && !height) return "-";
  return `${height || "-"} x ${width || "-"} mm`;
}

function lineMaterial(line = {}) {
  // A hardware line has no board and its name is its whole spec, so that is
  // what belongs here. The same rule the form's Material column follows: this
  // is "what is the line for", which for a door is the board and for a handle
  // is the handle. It read "-" before, so the customer's confirmation of what
  // they had asked for did not say what they had asked for.
  const board = [line.material, line.thickness].filter(Boolean).join(" / ");
  if (board) return board;
  const named = line.productName || line.product_name || "";
  const type = line.productType || line.product_type || "";
  // Only when it says something the Type column does not. A line whose name
  // is just "Hardware" repeats the column beside it and is better left blank.
  return named && named !== type ? named : "-";
}

function lineType(line = {}) {
  return line.productType || line.product_type || line.productName || line.product_name || "Line item";
}

function quoteLineRows(lines = []) {
  if (!lines.length) {
    return `
      <div style="margin-top:16px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:13px;line-height:20px;">
        No line item details were supplied.
      </div>`;
  }

  return `
    <div style="margin-top:18px;">
      <div style="margin:0 0 8px;color:#1d3a24;font-size:12px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;">Requested items</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f5f3ee;">
            <th align="left" style="padding:9px 8px;color:#64748b;font-size:11px;line-height:15px;text-transform:uppercase;letter-spacing:.6px;">Type</th>
            <th align="left" style="padding:9px 8px;color:#64748b;font-size:11px;line-height:15px;text-transform:uppercase;letter-spacing:.6px;">Material</th>
            <th align="left" style="padding:9px 8px;color:#64748b;font-size:11px;line-height:15px;text-transform:uppercase;letter-spacing:.6px;">H x W</th>
            <th align="left" style="padding:9px 8px;color:#64748b;font-size:11px;line-height:15px;text-transform:uppercase;letter-spacing:.6px;">Finish</th>
            <th align="left" style="padding:9px 8px;color:#64748b;font-size:11px;line-height:15px;text-transform:uppercase;letter-spacing:.6px;">Colour</th>
            <th align="left" style="padding:9px 8px;color:#64748b;font-size:11px;line-height:15px;text-transform:uppercase;letter-spacing:.6px;">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${lines
            .map(
              (line) => `
                <tr>
                  <td style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:18px;">${escapeHtml(lineType(line))}</td>
                  <td style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:18px;">${escapeHtml(lineMaterial(line))}</td>
                  <td style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:18px;">${escapeHtml(lineDimensions(line))}</td>
                  <td style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:18px;">${escapeHtml(line.finish || "-")}</td>
                  <td style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:18px;">${escapeHtml(cleanLineColour(line) || "-")}</td>
                  <td style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:18px;">${escapeHtml(line.qty || 1)}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

export function quoteLineItemsText(lines = []) {
  if (!lines.length) return ["Line items: none supplied"];

  return [
    "Line items:",
    ...lines.map((line, index) => {
      const parts = [
        `${index + 1}. ${lineType(line)}`,
        lineMaterial(line),
        lineDimensions(line),
        `Finish: ${line.finish || "-"}`,
        `Colour: ${cleanLineColour(line) || "-"}`,
        `Qty: ${line.qty || 1}`,
      ];
      return parts.join(" | ");
    }),
  ];
}

/**
 * The frame every email we send sits in.
 *
 * Tables and inline styles, deliberately: Outlook renders with Word, which
 * ignores most of a stylesheet and has no useful support for modern layout.
 * It looks dated because email clients are.
 *
 * `intro` is optional. Most templates open with a sentence explaining
 * themselves; a reply typed by a person does not, because the message is the
 * opening and anything above it is us talking over them.
 */
export function emailShell({ title, intro = "", children }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4efe7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4efe7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px;background:#0d3550;color:#ffffff;">
                <div style="font-size:12px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:30px;font-weight:700;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${intro ? `<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:23px;">${escapeHtml(intro)}</p>` : ""}
                ${children}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:18px;">
                Perth Cabinet Doors<br />
                <a href="mailto:${SALES_EMAIL}" style="color:#0d3550;text-decoration:none;">${SALES_EMAIL}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ─── THE QUOTE EMAIL'S OWN LOOK ──────────────────────────────────────────────
//
// Cream and green rather than the navy shell above, because that is what "Your
// quote is ready" has always looked like and it is the only email most
// customers ever see from us. Anything chasing that quote has to look like it
// came from the same place, or it reads as a different company asking for money.
//
// It lived inline in the quote send route until the deposit reminders needed it
// too. Copying it would have given us two versions of the one email identity,
// which is how the navy shell and this one came to disagree in the first place.

/** A row in the cream facts panel. Label bold and uppercase, value bold right. */
export function quoteFacts(items, { emphasiseLast = false } = {}) {
  const cells = items
    .filter(Boolean)
    .map(([label, value], index, all) => {
      const last = emphasiseLast && index === all.length - 1;
      const divider = index === 0 ? "" : "border-top:1px solid #e3d7c6;";
      return `
        <tr>
          <td style="padding:14px 16px;${divider}color:#7c725f;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${escapeHtml(label)}</td>
          <td style="padding:14px 16px;${divider}color:#001f36;font-size:${last ? "16px" : "14px"};font-weight:${last ? "800" : "700"};text-align:right;">${escapeHtml(value)}</td>
        </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;background:#f7f2ea;border:1px solid #e3d7c6;">${cells}</table>`;
}

/**
 * A typed message turned into paragraphs.
 *
 * Four different emails had their own copy of this loop, and they had already
 * drifted on margins. Blank lines are kept, because somebody who put a gap in
 * their message meant it to be there.
 */
export function quoteParagraphs(text) {
  return String(text || "")
    .split("\n")
    .map((line) =>
      line.trim() === ""
        ? `<p style="margin:0 0 6px;">&nbsp;</p>`
        : `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`
    )
    .join("");
}

/** A heading inside the body, for an email long enough to need a section. */
export function quoteHeading(text) {
  return `<h2 style="margin:22px 0 8px;color:#001f36;font-family:Arial,sans-serif;font-size:18px;font-weight:700;">${escapeHtml(text)}</h2>`;
}

/** The dark green button. The only call to action style this family has. */
export function quoteButton(href, label) {
  return `<p style="margin:0 0 18px;">
                  <a href="${escapeHtml(href)}" style="display:inline-block;background:#17321f;color:#ffffff;text-decoration:none;padding:14px 20px;font-size:14px;font-weight:700;">${escapeHtml(label)}</a>
                </p>`;
}

/**
 * The cream and green wrapper the customer already knows.
 *
 * `footerNote` says why they are receiving it, which for a chase email matters
 * more than for the original: it is unexpected, and it should be obvious at a
 * glance that it belongs to a quote they asked for.
 */
export function quoteShell({ title, children, footerNote = "" }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f0e8;padding:28px 14px;font-family:Arial,sans-serif;color:#18221b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;background:#fffaf3;border:1px solid #d8cbb8;">
            <tr>
              <td style="background:#eef7ed;border-bottom:1px solid #d5e4d1;padding:28px 30px;">
                <div style="color:#2f6b3b;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;">Perth Cabinet Doors</div>
                <h1 style="margin:8px 0 0;color:#001f36;font-family:Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:400;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 12px;">
                ${children}
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e3d7c6;padding:18px 30px;color:#7c725f;font-size:12px;line-height:1.5;">
                Perth Cabinet Doors<br>
                ${escapeHtml(footerNote)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function quoteParagraph(text, { bold = false } = {}) {
  return `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">${
    bold ? `<b>${escapeHtml(text)}</b>` : escapeHtml(text)
  }</p>`;
}

function fallbackLink(url) {
  return `<p style="margin:0 0 6px;color:#7c725f;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 18px;color:#001f36;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(url)}</p>`;
}

// THE SENTENCE THAT DOES THE WORK, in both reminders.
//
// Friendly, but it has to leave no room to believe the job is quietly under
// way. Somebody who clicked Approve reasonably thinks they have accepted; this
// is the only thing telling them that half a transaction is not a transaction.
const NOT_APPROVED_YET =
  "Your quote is not formally approved yet, and no order has been created. Both the approval and the " +
  "deposit have to be in place before a job is confirmed, so until the deposit reaches us nothing is " +
  "booked in, no materials are ordered and no production date is held.";

const STILL_NOT_APPROVED =
  "Your quote remains unapproved and there is no order for your job. Nothing has been booked in, no " +
  "materials have been ordered and no production date is being held. That stays the case until the " +
  "deposit is paid.";

/** First reminder, an hour after they reached the payment page and stopped. */
export function customerDepositReminderHtml({
  customerName,
  quoteNumber,
  totalIncGst,
  depositAmount,
  depositPercent,
  viewUrl,
}) {
  return quoteShell({
    title: "Your deposit has not come through",
    footerNote: `This email was sent because you approved a quote prepared for ${customerName || "you"}.`,
    children: `
                ${quoteParagraph(`Hi ${customerName || "there"},`)}
                ${quoteParagraph(
                  `Thanks for approving quote ${quoteNumber}. We have saved your delivery details and we are holding your quote.`
                )}
                ${quoteParagraph(NOT_APPROVED_YET, { bold: true })}
                ${quoteFacts(
                  [
                    ["Quote number", quoteNumber],
                    ["Quote total inc GST", totalIncGst],
                    [`Deposit to pay (${depositPercent})`, depositAmount],
                  ],
                  { emphasiseLast: true }
                )}
                ${quoteButton(viewUrl, "Pay the deposit and confirm your order")}
                ${fallbackLink(viewUrl)}
                ${quoteParagraph(
                  "That link stays open, so if now is not a good time you can come back to it whenever suits. Your pricing is held for the validity period shown on your quote."
                )}
                ${quoteParagraph(
                  "If you have changed your mind, or something is not right, just reply to this email and we will sort it out."
                )}`,
  });
}

/** Final reminder, a day later. The last automated word. */
export function customerDepositFinalHtml({
  customerName,
  quoteNumber,
  totalIncGst,
  depositAmount,
  depositPercent,
  viewUrl,
}) {
  return quoteShell({
    title: "Final reminder about your deposit",
    footerNote: `This email was sent because you approved a quote prepared for ${customerName || "you"}.`,
    children: `
                ${quoteParagraph(`Hi ${customerName || "there"},`)}
                ${quoteParagraph(
                  `We are still holding quote ${quoteNumber} for you, but the deposit has not reached us.`
                )}
                ${quoteParagraph(STILL_NOT_APPROVED, { bold: true })}
                ${quoteFacts(
                  [
                    ["Quote number", quoteNumber],
                    ["Quote total inc GST", totalIncGst],
                    [`Deposit outstanding (${depositPercent})`, depositAmount],
                  ],
                  { emphasiseLast: true }
                )}
                ${quoteButton(viewUrl, "Pay the deposit and confirm your order")}
                ${fallbackLink(viewUrl)}
                ${quoteParagraph(
                  "This is the last reminder we will send automatically. Your link stays open and your pricing is held for the validity period shown on your quote. After that we would need to requote, and prices may have moved."
                )}
                ${quoteParagraph(
                  "If you would rather talk it through, pay another way, or you no longer want to go ahead, reply to this email or give us a call and we will take it from there."
                )}`,
  });
}

/**
 * The one thing that tells us any of this happened.
 *
 * On the navy shell rather than the cream one, because it lands in sales@
 * alongside every other internal notification and should not be mistakable for
 * something a customer sent.
 */
export function salesDepositUnpaidHtml({
  quoteNumber,
  customerName,
  customerEmail,
  customerPhone,
  totalIncGst,
  depositAmount,
  approvedAt,
  attempts,
  adminUrl,
}) {
  return emailShell({
    title: "Approved, deposit not paid",
    intro:
      "This customer approved their quote and reached the payment page, but the deposit has not arrived. " +
      "They have now had both reminders, so this one is down to a phone call.",
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows([
          ["Quote", quoteNumber],
          ["Customer", customerName],
          ["Phone", customerPhone],
          ["Email", customerEmail],
          ["Quote total", totalIncGst],
          ["Deposit owing", depositAmount],
          ["Approved", approvedAt],
          ["Payment attempts", attempts],
        ])}
      </table>
      <p style="margin:18px 0;">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#0d3550;color:#ffffff;text-decoration:none;padding:13px 22px;font-size:14px;font-weight:700;border-radius:4px;">Open the quote</a>
      </p>
      <p style="margin:0;color:#334155;font-size:15px;line-height:23px;">
        No order has been created and nothing is committed. If they pay from their link at any point it all
        goes through on its own, so there is nothing you need to do unless you want to chase it.
      </p>`,
  });
}

// ─── THE QUOTE THAT IS ABOUT TO RUN OUT ──────────────────────────────────────
//
// Sent once, seven days before a quote passes the validity its own terms give
// it. See lib/pcd-quote-expiry.js for the clock.
//
// ── THE TONE, AND WHY IT IS NOT A CHASE ──────────────────────────────────────
//
// Most people who have not answered in three weeks have not forgotten, they
// have decided, or they are waiting on something that is nothing to do with us.
// So this states a fact and a date rather than asking for a decision, and it
// says outright that doing nothing is a complete answer. That last paragraph is
// what keeps it from reading as pressure, and it is the one not to cut.
//
// It is still firm about the consequence, once and without repeating itself: on
// that date the quote is archived, the link stops working, and a reissued quote
// may come back at a different price or with different lead times. The reason is
// given alongside the rule, so it reads as how a business works rather than as a
// deadline invented to hurry them.
//
// EVERY DATE IS THEIRS. Nothing here is rounded or assumed: the days remaining
// are counted from that quote's own sent date, so an email that goes out late
// says six days rather than confidently saying seven and being wrong.

export function customerQuoteExpiryHtml({
  customerName,
  quoteNumber,
  sentAtLabel,
  expiresAtLabel,
  daysLeft,
  validDays,
  totalIncGst,
  viewUrl,
}) {
  const dayWord = daysLeft === 1 ? "day" : "days";

  return quoteShell({
    title: `Your quote expires in ${daysLeft} ${dayWord}`,
    // SAYS IT IS AUTOMATIC, AND IN THE SAME BREATH THAT A REPLY IS READ.
    //
    // "Automatically generated" on its own is read as "do not reply", and this
    // is the one email in the set that asks them to reply: a quote sitting
    // unanswered for three weeks is very often a quote with something slightly
    // wrong in it. Telling them it came from a system without telling them a
    // person is on the other end would close the only door it opens.
    footerNote:
      `This is an automatic reminder from our order management system, sent because a quote was prepared ` +
      `for ${customerName || "you"} on ${sentAtLabel}. Replies come straight through to our team and are ` +
      `read by a person.`,
    children: [
      quoteParagraphs(
        [
          `Hi ${customerName || "there"},`,
          `This is a quick note about the quote we prepared for you on ${sentAtLabel}. Our quotes are valid ` +
            `for ${validDays} days from the date they are issued, so this one expires on ${expiresAtLabel}, ` +
            `which is ${daysLeft} ${dayWord} from today.`,
        ].join(NEWLINE)
      ),
      // Only when the quote email they were originally sent showed the price.
      // A quote deliberately sent without pricing must not have its total
      // arrive later in a reminder nobody chose to put it in.
      quoteFacts(
        [
          ["Quote number", quoteNumber],
          ["Date sent", sentAtLabel],
          totalIncGst ? ["Total inc GST", totalIncGst] : null,
          ["Expires", expiresAtLabel],
        ],
        { emphasiseLast: true }
      ),
      quoteParagraphs(
        `If you would like to go ahead, you can approve your quote online at any time before ${expiresAtLabel}.`
      ),
      quoteButton(viewUrl, "View and approve your quote"),
      fallbackLink(viewUrl),
      quoteParagraphs(
        [
          `After ${expiresAtLabel} the quote will be archived and the link above will stop working. If you are ` +
            `still interested in having the work completed at that point, please get in touch and we will ` +
            `prepare a fresh quote for you. Materials, board pricing and our production schedule all move over ` +
            `time, so a reissued quote may come back at a different price or with different lead times to the ` +
            `one you are holding now.`,
          `If you have decided not to go ahead, there is nothing you need to do. You can disregard this email ` +
            `and your quote will close on its own on ${expiresAtLabel}.`,
          `If anything in the quote is not quite right, or you would like something changed, just reply to this ` +
            `email or give us a call and we will sort it out.`,
        ].join(NEWLINE)
      ),
    ].join(""),
  });
}

/**
 * The weekly digest: what closed, and what is about to.
 *
 * On the navy shell rather than the cream one, because it lands in sales@
 * alongside every other internal notification and must not be mistakable for
 * something a customer sent.
 *
 * FIGURES, NOT VERDICTS. It lists what happened and what is coming, and stops
 * there. Whether a quiet week is a problem depends on a dozen things this
 * mailbox knows nothing about.
 */
export function salesQuoteExpiryDigestHtml({ archived = [], expiringSoon = [], warned = [], adminUrl, since }) {
  const table = (heading, items, columns) => {
    if (!items.length) {
      return `
      <div style="margin-top:22px;">
        <div style="margin:0 0 8px;color:#1d3a24;font-size:12px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;">${escapeHtml(heading)}</div>
        <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:13px;line-height:20px;">None.</div>
      </div>`;
    }

    return `
      <div style="margin-top:22px;">
        <div style="margin:0 0 8px;color:#1d3a24;font-size:12px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;">${escapeHtml(heading)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f5f3ee;">
              ${columns
                .map(
                  (column) =>
                    `<th align="${column.align || "left"}" style="padding:9px 8px;color:#64748b;font-size:11px;line-height:15px;text-transform:uppercase;letter-spacing:.6px;">${escapeHtml(column.label)}</th>`
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
                <tr>
                  ${columns
                    .map(
                      (column) =>
                        `<td align="${column.align || "left"}" style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:18px;">${escapeHtml(column.value(item))}</td>`
                    )
                    .join("")}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  };

  return emailShell({
    title: "Quotes that closed, and quotes about to",
    intro:
      `The week since ${since}. Quotes that ran past their validity with no answer have been archived, and the ` +
      `ones below them are still live but inside their last seven days.`,
    children: `
      ${table("Archived, no answer", archived, [
        { label: "Quote", value: (row) => row.quoteNumber },
        { label: "Customer", value: (row) => row.customerName || "-" },
        { label: "Sent", value: (row) => row.sentAtLabel },
        { label: "Warned", value: (row) => (row.warned ? "Yes" : "No") },
        { label: "Value", value: (row) => row.totalIncGst, align: "right" },
      ])}
      ${table("Expiring within 7 days", expiringSoon, [
        { label: "Quote", value: (row) => row.quoteNumber },
        { label: "Customer", value: (row) => row.customerName || "-" },
        { label: "Expires", value: (row) => row.expiresAtLabel },
        { label: "Days left", value: (row) => String(row.daysLeft), align: "right" },
        { label: "Value", value: (row) => row.totalIncGst, align: "right" },
      ])}
      ${table("Reminded this week", warned, [
        { label: "Quote", value: (row) => row.quoteNumber },
        { label: "Customer", value: (row) => row.customerName || "-" },
        { label: "Expires", value: (row) => row.expiresAtLabel },
        { label: "Value", value: (row) => row.totalIncGst, align: "right" },
      ])}
      <p style="margin:22px 0 0;">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#0d3550;color:#ffffff;text-decoration:none;padding:13px 22px;font-size:14px;font-weight:700;border-radius:4px;">Open lead conversion</a>
      </p>
      <p style="margin:16px 0 0;color:#334155;font-size:15px;line-height:23px;">
        Nothing is deleted. An archived quote can be restored from the quote itself and comes back exactly as it
        was, including its link.
      </p>`,
  });
}

/**
 * A weekly progress update on somebody's order.
 *
 * On the quote family rather than the navy shell, because this follows a quote
 * they approved and should look like it came from the same place.
 *
 * THE BODY ARRIVES AS PLAIN TEXT and is rendered rather than authored here.
 * It was built by lib/pcd-update-wording.js, then read and possibly edited by a
 * person before sending, so what they approved is what goes out. Indented lines
 * are the dated updates under an order heading; a line with no indent and no
 * date is that heading.
 */
export function customerUpdateHtml({ customerName, body }) {
  const blocks = String(body || "")
    .split(/\n/)
    .map((line) => {
      const indented = /^\s{2,}/.test(line);
      const text = line.trim();
      if (!text) return "";
      if (indented) {
        return `<div style="margin:0 0 5px;padding-left:14px;color:#263226;font-size:14px;line-height:1.55;border-left:2px solid #d5e4d1;">${escapeHtml(text.replace(/^-\s*/, ""))}</div>`;
      }
      // An order heading: a reference, then a name. Set apart so a customer
      // with three jobs can see at a glance which one each line belongs to.
      if (/^PCD-O-/.test(text)) {
        return `<div style="margin:18px 0 8px;color:#001f36;font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">${escapeHtml(text)}</div>`;
      }
      return `<p style="margin:0 0 14px;color:#263226;font-size:15px;line-height:1.6;">${escapeHtml(text)}</p>`;
    })
    .join("");

  return quoteShell({
    title: "An update on your order",
    footerNote: `This email was sent because you have work with us${customerName ? `, ${customerName}` : ""}.`,
    children: `\n                ${blocks}`,
  });
}

export function businessEnquiryHtml(payload) {
  return emailShell({
    title: "New website enquiry",
    intro: "A new enquiry has been submitted through the Perth Cabinet Doors website.",
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows([
          ["Name", payload.customerName],
          ["Email", payload.customerEmail],
          ["Phone", payload.customerPhone],
          ["Postcode", payload.postcode],
          ["Topic", payload.topic],
        ])}
      </table>
      <div style="margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font-size:14px;line-height:22px;white-space:pre-wrap;">${escapeHtml(payload.message)}</div>
    `,
  });
}

export function customerEnquiryHtml(payload) {
  return quoteShell({
    title: "We received your enquiry",
    footerNote: `This email was sent because an enquiry was submitted for ${payload.customerName || "you"}.`,
    children: quoteParagraphs(
      [
        `Hi ${payload.customerName || "there"},`,
        "Thanks for contacting Perth Cabinet Doors. We have received your enquiry and you should expect a response within 1-3 business days.",
        "If you need to add anything in the meantime, reply to this email and it will come through to our team.",
      ].join(NEWLINE)
    ),
  });
}

export function businessQuoteRequestHtml(payload) {
  return emailShell({
    title: "New quote request",
    intro: "A new quote request has been submitted through the Perth Cabinet Doors website.",
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows([
          ["Source", sourceLabel(payload.source)],
          ["Product", payload.productName],
          ["Name", payload.customerName],
          ["Email", payload.customerEmail],
          ["Phone", payload.customerPhone],
          ["Suburb", payload.deliverySuburb],
          ["Cabinet brand", payload.cabinetBrand],
          ["Line items", payload.lines?.length || 0],
        ])}
      </table>
      ${quoteLineRows(payload.lines || [])}
      <div style="margin-top:16px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font-size:14px;line-height:22px;white-space:pre-wrap;">${escapeHtml(payload.notes || "No extra notes supplied.")}</div>
    `,
  });
}

// ── CONFIRMATIONS ────────────────────────────────────────────────────────────
//
// Short on purpose. A customer who has just paid, or just approved, wants to
// know it landed and to have the number to quote back at us. They do not want a
// statement, and we do not want to put a balance in an email that the next
// variation makes wrong.
//
// Same shell as every other email we send, so they read as coming from the same
// company as the quote did. See lib/pcd-customer-confirmations.js for when each
// one fires.

// The closing line the confirmations share, so a change of tone happens once.
// Plain text now rather than markup, because these render through
// quoteParagraphs like every other customer facing email.
const CONFIRMATION_SIGN_OFF_TEXT =
  "We will be in touch as your job moves along. If you have any questions, just reply to this email.";

// Paragraphs are separated by a newline before quoteParagraphs renders them.
const NEWLINE = "\n";

export function customerPaymentReceivedHtml({ customerName, money, orderNumber }) {
  return quoteShell({
    title: "Payment received",
    footerNote: `This email was sent about work with us${orderNumber ? `, order ${orderNumber}` : ""}.`,
    children: [
      quoteParagraphs(
        [
          `Hi ${customerName || "there"},`,
          `Thanks, we have received your payment of ${money}${orderNumber ? ` for order ${orderNumber}` : ""}.`,
          CONFIRMATION_SIGN_OFF_TEXT,
        ].join(NEWLINE)
      ),
    ].join(""),
  });
}

export function customerQuoteApprovedHtml({ customerName, quoteNumber, orderNumber }) {
  return quoteShell({
    title: "Thanks for approving your quote",
    footerNote: `This email was sent because a quote was approved for ${customerName || "you"}.`,
    children: quoteParagraphs(
      [
        `Hi ${customerName || "there"},`,
        `Thanks for approving ${quoteNumber ? `quote ${quoteNumber}` : "your quote"}.${orderNumber ? ` Your order number is ${orderNumber}.` : ""}`,
        CONFIRMATION_SIGN_OFF_TEXT,
      ].join(NEWLINE)
    ),
  });
}

export function customerVariationApprovedHtml({ customerName, variationNumber, orderNumber }) {
  return quoteShell({
    title: "Thanks for approving the change",
    footerNote: `This email was sent because a variation was approved for ${customerName || "you"}.`,
    children: quoteParagraphs(
      [
        `Hi ${customerName || "there"},`,
        `Thanks for approving ${variationNumber ? `variation ${variationNumber}` : "the change"}.${orderNumber ? ` It is now part of order ${orderNumber}.` : ""}`,
        CONFIRMATION_SIGN_OFF_TEXT,
      ].join(NEWLINE)
    ),
  });
}

export function customerQuoteRequestHtml(payload) {
  return quoteShell({
    title: "We received your quote request",
    footerNote: `This email was sent because a quote request was submitted for ${payload.customerName || "you"}.`,
    children: [
      quoteParagraphs(
        [
          `Hi ${payload.customerName || "there"},`,
          "Thanks for sending your quote request to Perth Cabinet Doors. We have received it and you should expect a response within 1-3 business days.",
        ].join(NEWLINE)
      ),
      quoteFacts([
        ["Product", payload.productName || "-"],
        ["Line items", String(payload.lines?.length || 0)],
      ]),
      quoteLineRows(payload.lines || []),
    ].join(""),
  });
}
