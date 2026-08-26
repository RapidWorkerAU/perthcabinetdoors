// "Email me my design link" from the public planner.
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

export async function sendDesignLinkEmail({ name, email, shareUrl }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false;

  const link = safeShareUrl(shareUrl);
  if (!link || !email) return false;

  const firstName = String(name || "").trim().split(/\s+/)[0] || "there";
  const resend = new Resend(process.env.RESEND_API_KEY);

  // ON THE SHARED QUOTE SHELL. This used to be a bare unbranded div with a
  // dark green button, the only email in the system that looked like that. It
  // is the first thing many customers ever receive from us, so it should look
  // like the quote that follows it rather than like a different company.
  const html = quoteShell({
    title: "Your design is saved",
    footerNote: `This email was sent because a design was saved on our website for ${firstName}.`,
    children: [
      quoteParagraphs(
        [
          `Hi ${firstName},`,
          "Here is the link to the design you started with us. It is private to you, and it opens on any device, so you can pick up where you left off.",
        ].join("\n")
      ),
      quoteButton(link, "Open my design"),
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
    "Here is the link to the design you started with us. It is private to you, and it opens on any device.",
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
