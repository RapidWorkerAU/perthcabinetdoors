// Reading the sales@ mailbox through Microsoft Graph.
//
// WHY NOT FORWARDING. Resend cannot receive email, it only sends. Forwarding
// into some other inbound service would mean an MX record, a forwarding rule,
// and forwarded mail meeting a DMARC policy of p=reject. Reading the mailbox
// directly changes nothing about how mail flows: it arrives in Outlook exactly
// as it does today and this just looks at it.
//
// It also picks up SENT items, which forwarding never could. A reply typed in
// Outlook on a phone still lands on the ticket, so the desk is not made wrong
// by somebody answering the quick way.
//
// THREADING COMES FREE. Graph gives every message a conversationId and keeps it
// consistent across replies, so a conversation maps to a ticket without parsing
// In-Reply-To headers by hand.
//
// Nothing here runs at import time. A missing or expired secret must never
// break a build or take down a page; it only means mail does not sync, and
// graphStatus() is what the desk uses to say so plainly.

import { plainTextToTermsHtml } from "./pcd-terms-html";

const GRAPH = "https://graph.microsoft.com/v1.0";
const FOLDERS = ["inbox", "sentitems"];

// The fields worth asking for. uniqueBody is the important one: it is the new
// part of the message with the quoted trail removed, which is what makes a
// ticket readable instead of the same conversation repeated eight times.
const SELECT = [
  "id",
  "internetMessageId",
  "conversationId",
  "subject",
  "from",
  "sender",
  "toRecipients",
  "receivedDateTime",
  "sentDateTime",
  "hasAttachments",
  "isDraft",
  // Both, deliberately. Graph returns neither unless asked, and uniqueBody is
  // empty on the first message of a conversation, so body is the fallback.
  "body",
  "uniqueBody",
].join(",");

export function graphConfig() {
  return {
    tenantId: process.env.MS_TENANT_ID || "",
    clientId: process.env.MS_CLIENT_ID || "",
    clientSecret: process.env.MS_CLIENT_SECRET || "",
    mailbox: process.env.MS_MAILBOX || "",
  };
}

export function isGraphConfigured() {
  const c = graphConfig();
  return Boolean(c.tenantId && c.clientId && c.clientSecret && c.mailbox);
}

// One token per process, reused until it is nearly out. Serverless gives each
// instance its own, which is fine: a token request is cheap and the alternative
// is storing one somewhere and having to invalidate it.
let cached = { token: "", expiresAt: 0 };

export async function getGraphToken({ force = false } = {}) {
  const { tenantId, clientId, clientSecret } = graphConfig();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft is not configured. MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET are needed.");
  }
  if (!force && cached.token && Date.now() < cached.expiresAt) return cached.token;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Microsoft's own wording is unreadable, and the three things that actually
    // go wrong are always the same three. Say which one it is.
    throw new Error(describeTokenError(json));
  }

  cached = { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in || 3600) - 120) * 1000 };
  return cached.token;
}

function describeTokenError(json) {
  const code = String(json?.error || "");
  const text = String(json?.error_description || "");
  if (/AADSTS7000222|AADSTS7000215/.test(text)) {
    return "Microsoft rejected the client secret. Check MS_CLIENT_SECRET is the secret's Value and not its Secret ID, and that it has not expired.";
  }
  if (/AADSTS700016|unauthorized_client/.test(text + code)) {
    return "Microsoft does not recognise that application. Check MS_CLIENT_ID is the Application (client) ID, not the Object ID.";
  }
  if (/AADSTS90002/.test(text)) {
    return "Microsoft does not recognise that directory. Check MS_TENANT_ID is the Directory (tenant) ID.";
  }
  return `Microsoft would not issue a token: ${text || code || "no reason given"}`;
}

async function graphGet(path, { token, prefer } = {}) {
  const accessToken = token || (await getGraphToken());
  const headers = { Authorization: `Bearer ${accessToken}` };
  // Ask for plain text bodies. Email HTML is a swamp of tables and inline
  // styles that would have to be sanitised down to almost nothing anyway, and
  // the text version is what a person actually wants to read.
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, { headers });
  if (res.status === 401) {
    // The cached token went stale mid-run. One retry with a fresh one.
    const fresh = await getGraphToken({ force: true });
    const retry = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
      headers: { ...headers, Authorization: `Bearer ${fresh}` },
    });
    if (!retry.ok) throw new Error(await describeGraphError(retry));
    return retry.json();
  }
  if (!res.ok) throw new Error(await describeGraphError(res));
  return res.json();
}

async function describeGraphError(res) {
  const json = await res.json().catch(() => ({}));
  const code = json?.error?.code || "";
  const message = json?.error?.message || res.statusText;

  if (res.status === 403 || /Access(Denied|IsDenied)|Authorization_RequestDenied/i.test(code)) {
    return (
      "Microsoft refused access to the mailbox. Two things do this: Mail.Read added under Delegated " +
      "instead of Application permissions, or admin consent not granted. Both are on the API permissions page."
    );
  }
  if (res.status === 404 || /ResourceNotFound|MailboxNotEnabled/i.test(code)) {
    return `Microsoft has no mailbox at ${graphConfig().mailbox}. Check MS_MAILBOX is the full address.`;
  }
  return `Microsoft Graph said: ${message}`;
}

/**
 * Is the mailbox reachable right now, and if not, what would fix it.
 *
 * The desk calls this so a page can say "the Microsoft secret expired" instead
 * of quietly showing no new mail, which is the failure that would go unnoticed
 * for weeks.
 */
export async function graphStatus() {
  if (!isGraphConfigured()) {
    return { configured: false, ok: false, error: "Microsoft is not connected yet. Four settings are needed in the environment." };
  }
  try {
    const mailbox = graphConfig().mailbox;
    await graphGet(`/users/${encodeURIComponent(mailbox)}/mailFolders/inbox?$select=id,totalItemCount`);
    return { configured: true, ok: true, error: "" };
  } catch (error) {
    return { configured: true, ok: false, error: error?.message || "Could not reach the mailbox." };
  }
}

function addressOf(recipient) {
  const address = recipient?.emailAddress || {};
  return { name: String(address.name || "").trim(), email: String(address.address || "").trim().toLowerCase() };
}

/**
 * One Graph message in the shape pcd_messages stores.
 *
 * direction is decided by who sent it rather than which folder it was in: a
 * message from our own mailbox is something we sent, wherever it is filed.
 */
export function normaliseGraphMessage(message, mailbox) {
  const from = addressOf(message.from || message.sender);
  const to = (message.toRecipients || []).map(addressOf);
  const ours = String(mailbox || "").toLowerCase();
  const outbound = from.email === ours;

  // uniqueBody is the new part only; body is everything including the quoted
  // trail. Falling back matters for the first message in a conversation, where
  // Graph sometimes leaves uniqueBody empty.
  const text = String(message.uniqueBody?.content || message.body?.content || "").trim();

  return {
    graph_id: message.id,
    provider_event_id: message.internetMessageId || message.id,
    provider_message_id: message.internetMessageId || null,
    conversation_id: message.conversationId || null,
    direction: outbound ? "outbound" : "inbound",
    from_name: from.name || null,
    from_email: from.email || null,
    to_email: to.map((r) => r.email).filter(Boolean).join(", ") || null,
    // A subject is not required by the email standard and plenty of real mail
    // arrives without one.
    subject: String(message.subject || "").trim() || "(no subject)",
    body_text: text,
    body_html: plainTextToTermsHtml(text),
    has_attachments: Boolean(message.hasAttachments),
    // Sent mail has no receivedDateTime, so fall back rather than storing null
    // and losing the ordering.
    occurred_at: message.receivedDateTime || message.sentDateTime || null,
    // The customer's own address, whichever side of the conversation they are.
    counterparty: outbound ? to.find((r) => r.email && r.email !== ours) || to[0] || null : from,
  };
}

/**
 * Messages from the inbox and sent items since a moment in time.
 *
 * `since` is applied with a deliberate overlap by the caller rather than being
 * exact, because clocks are not, and a message missed is worse than one seen
 * twice. Seeing it twice costs nothing: provider_event_id is unique, so the
 * second write is refused by the database.
 *
 * OLDEST FIRST, AND THIS IS THE WHOLE THING.
 *
 * It used to ask for newest first. Put that together with a cap per folder and
 * a cursor that resumes from the newest message already filed, and a run that
 * hits the cap loses everything between the old cursor and the newest page,
 * permanently: the next run starts AFTER the messages it skipped, so nothing
 * ever goes back for them. It reported success every time. 359 of the 677
 * messages in the mailbox over one sixty day stretch were never filed, among
 * them replies to customers the board was still saying we had not answered.
 *
 * Oldest first makes a capped run a PAUSE instead of a hole. It takes the
 * oldest unread messages, the cursor advances to exactly what it took, and the
 * next run carries on from there. The capped flag says a run stopped early so
 * the caller can come straight back rather than assume it is up to date.
 */
export async function fetchMailboxMessages({ since = null, limit = 500, pageSize = 50 } = {}) {
  const mailbox = graphConfig().mailbox;
  if (!mailbox) throw new Error("MS_MAILBOX is not set.");

  const token = await getGraphToken();
  const collected = [];
  let capped = false;

  for (const folder of FOLDERS) {
    const params = new URLSearchParams();
    params.set("$select", SELECT);
    params.set("$top", String(Math.min(pageSize, 50)));
    params.set("$orderby", "receivedDateTime asc");
    if (since) params.set("$filter", `receivedDateTime ge ${new Date(since).toISOString()}`);

    // Graph returns 50 at a time and hands back a link for the rest. Following
    // it matters on the FIRST run, where 90 days of mail is far more than one
    // page: without this the window silently becomes "the latest 50", which
    // looks like it worked and quietly leaves months unread.
    let next = `/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages?${params.toString()}`;
    let takenFromFolder = 0;

    while (next && takenFromFolder < limit) {
      const page = await graphGet(next, { token, prefer: 'outlook.body-content-type="text"' });

      for (const message of page.value || []) {
        if (message.isDraft) continue; // a draft is not a communication
        collected.push({ ...normaliseGraphMessage(message, mailbox), folder });
        takenFromFolder += 1;
      }

      // A ceiling as well as a link to follow. A mailbox with years in it must
      // not be able to turn one sync into an unbounded run. Because the oldest
      // come first, stopping here is safe: what is left is simply the next run's
      // work, and the caller is told there is more.
      const more = page["@odata.nextLink"] || null;
      if (takenFromFolder >= limit && more) capped = true;
      next = takenFromFolder < limit ? more : null;
    }
  }

  // Oldest first, so a conversation is written in the order it happened and a
  // ticket's first message is genuinely its first.
  collected.sort((a, b) => new Date(a.occurred_at || 0) - new Date(b.occurred_at || 0));
  collected.capped = capped;
  return collected;
}

/**
 * Everything to or from one address, however far back.
 *
 * Used when a sender is approved: their earlier mail is still sitting in the
 * mailbox, so saying "customer" reaches back and files what they sent before
 * anybody decided. Without this, approving somebody would only catch what they
 * send from that moment on, and the conversation you were trying to read is
 * exactly the one that already happened.
 */
export async function fetchMessagesFrom(address, { since = null, limit = 250 } = {}) {
  const mailbox = graphConfig().mailbox;
  if (!mailbox) throw new Error("MS_MAILBOX is not set.");
  const target = String(address || "").trim().toLowerCase();
  if (!target) return [];

  const token = await getGraphToken();
  const collected = [];
  const problems = [];

  for (const folder of FOLDERS) {
    // Inbox is filtered on who sent it; sent items on who it went to. The same
    // person is on the other side of both.
    const clause =
      folder === "inbox"
        ? `from/emailAddress/address eq '${target.replace(/'/g, "''")}'`
        : `toRecipients/any(r: r/emailAddress/address eq '${target.replace(/'/g, "''")}')`;

    const params = new URLSearchParams();
    params.set("$select", SELECT);
    params.set("$top", "50");
    params.set("$filter", since ? `${clause} and receivedDateTime ge ${new Date(since).toISOString()}` : clause);

    let next = `/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages?${params.toString()}`;
    let taken = 0;

    while (next && taken < limit) {
      let page;
      try {
        page = await graphGet(next, { token, prefer: 'outlook.body-content-type="text"' });
      } catch (error) {
        // Graph refuses some filters on some folders, and one folder failing
        // must not cost the other. But it was swallowed in silence, so a failing
        // sent items filter looked exactly like a customer we had never replied
        // to: their whole side of the conversation, quietly absent.
        problems.push(`${folder}: ${error?.message || "could not be read"}`);
        break;
      }
      for (const message of page.value || []) {
        if (message.isDraft) continue;
        collected.push({ ...normaliseGraphMessage(message, mailbox), folder });
        taken += 1;
      }
      next = taken < limit ? page["@odata.nextLink"] || null : null;
    }
  }

  collected.sort((a, b) => new Date(a.occurred_at || 0) - new Date(b.occurred_at || 0));
  collected.problems = problems;
  return collected;
}

/** One message's attachments, ready to put in the existing storage bucket. */
export async function fetchMessageAttachments(graphId) {
  const mailbox = graphConfig().mailbox;
  const page = await graphGet(
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(graphId)}/attachments`
  );

  return (page.value || [])
    // Only real files. An itemAttachment is a whole embedded email and a
    // referenceAttachment is a OneDrive link, neither of which is a file we can
    // put in a bucket.
    .filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && !a.isInline)
    .map((a) => ({
      file_name: a.name || "attachment",
      content_type: a.contentType || "application/octet-stream",
      size_bytes: Number(a.size) || 0,
      bytes: Buffer.from(String(a.contentBytes || ""), "base64"),
    }));
}
