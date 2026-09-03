// THE EMAIL THAT SENDS SOMEBODY THE ORDER FORM.
//
// WHY THE WORDS MATTER MORE THAN USUAL. This email goes to the customers who
// were not going to fill anything in: the ones who send a list in an email
// because that is easier than learning a form. Attaching a spreadsheet and
// saying "fill this in" gets it ignored. Saying what it is FOR, and that it is
// the same questions we would have had to ask them on the phone anyway, is what
// gets it back.
//
// The body is plain text and editable before it goes, because the person
// sending it knows the customer and we do not. The branded HTML is built from
// whatever they end up with, so an edit reaches the customer looking like
// everything else we send rather than like a different, plainer email.

import { emailShell, SALES_EMAIL } from "./pcd-email-templates";

export const ORDER_FORM_SUBJECT = "Our order form, so we get your job exactly right";

/**
 * The default message. Bullets are lines beginning "- ", which is what the
 * plain text reads as and what the HTML turns into a real list.
 *
 * @param {object} [input]
 * @param {string} [input.name]      who it is going to, blank if unknown
 * @param {string} [input.fromName]  who is sending it
 */
export function defaultOrderFormMessage({ name = "", fromName = "" } = {}) {
  const greeting = String(name || "").trim() ? `Hi ${String(name).trim().split(/\s+/)[0]},` : "Hi,";
  return [
    greeting,
    "",
    "I have attached our order form. It is an Excel file, and filling it in is the quickest way for us to price your job accurately.",
    "",
    "A few things worth knowing:",
    "",
    "- It asks the same questions as our online order form, so nothing extra is being asked of you. It is just easier to work through in one sitting.",
    "- Start on the first tab, then fill in only the tabs your job has. Kit fronts is for IKEA and Kaboodle, Fronts and panels is for anything made to a size you have measured, Carcasses is for the boxes and Hardware is for hinges and handles.",
    "- Set the colour on the first tab and every row on every other tab starts filled in with it. Change a row that is different and the row wins.",
    "- The dropdowns only offer what we actually stock. Pick a material and a thickness and the colour list narrows to the ones we can get in it, so you cannot accidentally order something we do not make.",
    "- Please fill in every field that applies to your job. The last column on each row tells you what is still missing and says Ready when there is enough there for us to quote it.",
    "- Sizes are height first, then width, in millimetres.",
    "- If you want us to drill for hinges, say so on the row and tell us which side they go. A door drilled the wrong way round is a door we have to make twice.",
    "- If you need something that is not on a dropdown, put it in the Notes column on that line and we will price it.",
    "",
    "Send it back to me when you are done and I will come back with a written quote. Nothing gets made or ordered until you have approved that.",
    "",
    "Any questions, just reply to this email.",
    "",
    String(fromName || "").trim() ? `Thanks,\n${String(fromName).trim()}` : "Thanks,",
  ].join("\n");
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The edited plain text as the body of a branded email.
 *
 * Paragraphs and bullets, and nothing else. Whoever is sending this is writing
 * an email, not authoring HTML, so a run of "- " lines becomes a list and
 * everything else becomes a paragraph. Anything cleverer would be a way for a
 * stray character to reach a customer as markup.
 */
export function orderFormEmailHtml({ message = "", fileName = "" } = {}) {
  const blocks = [];
  let bullets = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      `<ul style="margin:0 0 18px;padding-left:20px;color:#334155;font-size:15px;line-height:23px;">` +
        bullets.map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item)}</li>`).join("") +
        `</ul>`
    );
    bullets = [];
  };

  String(message)
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        bullets.push(trimmed.replace(/^[-*]\s+/, ""));
        return;
      }
      flushBullets();
      if (!trimmed) return;
      blocks.push(
        `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:23px;">${escapeHtml(trimmed)}</p>`
      );
    });
  flushBullets();

  if (fileName) {
    blocks.push(
      `<p style="margin:22px 0 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;` +
        `color:#475569;font-size:13px;line-height:20px;">` +
        `Attached: <strong style="color:#0f172a;">${escapeHtml(fileName)}</strong><br />` +
        `Open it in Excel and click Enable Editing at the top, or the dropdowns will not work.` +
        `</p>`
    );
  }

  return emailShell({
    title: "Our order form",
    children: blocks.join("\n"),
  });
}

/** The same thing as plain text, for the mail clients that will not show HTML. */
export function orderFormEmailText({ message = "", fileName = "" } = {}) {
  const tail = fileName
    ? `\n\nAttached: ${fileName}\nOpen it in Excel and click Enable Editing at the top, or the dropdowns will not work.`
    : "";
  return `${String(message).trim()}${tail}\n\nPerth Cabinet Doors\n${SALES_EMAIL}`;
}
