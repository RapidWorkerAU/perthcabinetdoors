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

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a18;line-height:1.6;max-width:520px">
      <p style="margin:0 0 16px">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px">
        Here is the link to the design you started with us. It is private to you, and it opens on any
        device, so you can pick up where you left off.
      </p>
      <p style="margin:0 0 22px">
        <a href="${escapeHtml(link)}"
           style="background:#1c2b1e;color:#f0ede4;padding:12px 22px;border-radius:2px;text-decoration:none;font-weight:700;display:inline-block">
          Open my design
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#5a5a52">
        Or paste this into your browser:<br>
        <span style="word-break:break-all">${escapeHtml(link)}</span>
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#5a5a52">
        When you are ready for a price, open it and hit Send to PCD. There is no obligation, and we will
        confirm every dimension with you before anything is made.
      </p>
      <p style="margin:0;font-size:13px;color:#5a5a52">
        Any questions, just reply to this email or contact us at
        <a href="mailto:${SALES_EMAIL}" style="color:#1c2b1e">${SALES_EMAIL}</a>.
      </p>
    </div>
  `;

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
