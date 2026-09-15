// THE EMAIL WITH A DESIGN LINK IN IT, IN BOTH DIRECTIONS.
//
// Two things send it and they are not the same event:
//
//   THEY DREW IT. Somebody on the public planner asks us to email them their
//   own link so they can come back to it. That is the original, and every
//   word of it is written from their side: "the design you started with us",
//   "Open my design", "a design was saved on our website for you".
//
//   WE DREW IT. Somebody here shares a design they drafted for a customer.
//   The customer has not started anything and has never seen it.
//
// The second one sent the first one's words, unchanged, and told a customer
// they had made a design they had never opened. Same link, same shell, and a
// paragraph that was untrue in every line of it.
//
// So `drawnByUs` picks the wording. It is not a flag on a template for the
// sake of it: which of the two happened changes what the email can honestly
// say, and a customer who is told they did something they did not do stops
// believing the rest of it.
//
// Kept apart from pcd-quote-request.js because this is not a quote request. It
// is one short email with a link in it, sent to the customer only. Nothing goes
// to sales: a saved design is not a lead worth interrupting anyone for, and the
// customer record it creates is already in the admin list.
//
// Returns true only if an email was actually sent, so the caller can tell the
// customer the truth rather than claiming a send that never happened.

import { Resend } from "resend";
import { SALES_EMAIL } from "./pcd-email-templates";
import { quoteButton, quoteParagraphs, quoteShell } from "./pcd-email-templates";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only our own planner links. Without this, a hand-rolled POST could have us
// send a branded email pointing anywhere.
function safeShareUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (!url.pathname.startsWith("/design")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export async function sendDesignLinkEmail({ name, email, shareUrl, drawnByUs = false, canEdit = false }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false;

  const link = safeShareUrl(shareUrl);
  if (!link || !email) return false;

  const firstName = String(name || "").trim().split(/\s+/)[0] || "there";
  const resend = new Resend(process.env.RESEND_API_KEY);

  // ON THE SHARED QUOTE SHELL. This used to be a bare unbranded div with a
  // dark green button, the only email in the system that looked like that. It
  // is the first thing many customers ever receive from us, so it should look
  // like the quote that follows it rather than like a different company.
  // WHAT CAN HONESTLY BE SAID, depending on who drew it. Whether they can
  // change it is worth saying too: a design shared read-only opens without the
  // tools, and somebody told to "pick up where you left off" on one would be
  // hunting for controls that are deliberately not there.
  const words = drawnByUs
    ? {
        title: "The design we have drawn for you",
        subject: "Your design from Perth Cabinet Doors",
        footer: `This email was sent because we shared a design with ${firstName}.`,
        opening: canEdit
          ? "We have put a design together for you. The link below opens it in our planner, where you can look through it in plan and in 3D and change anything you want to."
          : "We have put a design together for you. The link below opens it in our planner, where you can look through it in plan and in 3D.",
        button: "Open the design",
      }
    : {
        title: "Your design is saved",
        subject: words.subject,
        footer: `This email was sent because a design was saved on our website for ${firstName}.`,
        opening: "Here is the link to the design you started with us. It is private to you, and it opens on any device, so you can pick up where you left off.",
        button: "Open my design",
      };

  const html = quoteShell({
    title: words.title,
    footerNote: words.footer,
    children: [
      quoteParagraphs([`Hi ${firstName},`, words.opening].join("\n")),
      quoteButton(link, words.button),
      `<p style="margin:0 0 18px;color:#001f36;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(link)}</p>`,
      quoteParagraphs(
        [
          "When you are ready for a price, open it and hit Send to PCD. There is no obligation, and we will confirm every dimension with you before anything is made.",
          `Any questions, just reply to this email or contact us at ${SALES_EMAIL}.`,
        ].join("\n")
      ),
    ].join(""),
  });

  const text = [
    `Hi ${firstName},`,
    "",
    words.opening,
    "",
    link,
    "",
    "When you are ready for a price, open it and hit Send to PCD. There is no obligation, and we will confirm every dimension with you before anything is made.",
    "",
    `Any questions, just reply to this email or contact us at ${SALES_EMAIL}.`,
  ].join("\n");

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: [email],
    replyTo: SALES_EMAIL,
    subject: "Your design at Perth Cabinet Doors",
    html,
    text,
  });

  return true;
}
