"use client";

// The signature on replies sent from the customer desk.
//
// Kept as a setting rather than written into the email template, so a phone
// number can change without a code change and a deploy.
//
// THE PREVIEW IS THE POINT. Nobody could tell what a reply sent from the desk
// actually looked like when it arrived, which is a poor position to be in when
// the thing is going to customers. This shows the finished email, signature and
// all, before anything is sent.

import { useCallback, useEffect, useState } from "react";
import TermsEditor from "./TermsEditor";
import { toTermsHtml } from "../../../lib/pcd-terms-html";
import { deskReplyEmailHtml } from "../../../lib/pcd-desk-email";

export default function EmailSignatureCard() {
  const [signature, setSignature] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/business-defaults", { cache: "no-store" });
      const payload = await res.json();
      if (payload.ok) setSignature(payload.defaults?.email_signature_html || "");
      else setError(payload.error || "Could not load your signature.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your signature.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true);
    setStatus("");
    setError("");
    try {
      // Read the whole row back and send it whole. business-defaults saves every
      // field it is given, so posting the signature alone would blank the rest.
      const current = await (await fetch("/api/admin/business-defaults", { cache: "no-store" })).json();
      if (!current.ok) {
        setError("Could not read your settings, so nothing was saved.");
        return;
      }
      const res = await fetch("/api/admin/business-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: { ...current.defaults, email_signature_html: signature } }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setError(payload.error || "Could not save your signature.");
        return;
      }
      setStatus("Signature saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white">
      <div className="border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52]">Email signature</p>
      </div>

      <div className="p-4">
        <p className="mb-3 text-[11px] leading-snug text-[#8b8a81]">
          Signed onto every reply you send from a customer&apos;s page. It is stored on the message too, so what the
          desk shows is exactly what the customer received. Leave it blank and replies go out unsigned.
        </p>

        {error ? (
          <div className="mb-3 rounded-[6px] border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">
            {error}
          </div>
        ) : null}

        <TermsEditor
          value={signature}
          onChange={setSignature}
          placeholder="Jason Phillips, Perth Cabinet Doors, phone, website..."
          height={140}
          ariaLabel="Email signature"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="h-[32px] rounded-[6px] bg-[#1c2b1e] px-3 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save signature"}
          </button>
          <button
            type="button"
            onClick={() => setPreview((open) => !open)}
            className="h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4]"
          >
            {preview ? "Hide the preview" : "Preview the email"}
          </button>
          {status ? <span className="text-[12px] text-[#5a5a52]">{status}</span> : null}
        </div>

        {preview ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81]">
              What the customer receives
            </p>
            <p className="mb-3 text-[11px] leading-snug text-[#8b8a81]">
              This is the real template, not a mock-up of it. The reference block only appears when the customer has a
              quote or an order; the example below shows one.
            </p>
            {/* srcDoc rather than markup copied into this page: the iframe gets
                the email's own styles and cannot inherit the admin's, which is
                the only way a preview stays honest. sandbox with no allow-*
                means nothing in it can run or navigate. */}
            <iframe
              title="Preview of the email a customer receives"
              sandbox=""
              className="h-[560px] w-full rounded-[8px] border border-[#dbd8cc] bg-white"
              srcDoc={deskReplyEmailHtml({
                bodyHtml:
                  "<p>Hi Sarah,</p><p>Good to hear from you. The quote still stands at the same price, and I am happy to add the pantry doors to the same job.</p>",
                signatureHtml: toTermsHtml(signature),
                reference: {
                  kind: "Quote",
                  reference: "PCD-Q-2026-4A7C21",
                  dateLabel: "Sent",
                  date: "18 February 2026",
                  amount: "$4,182.00",
                },
              })}
            />
            {!toTermsHtml(signature).trim() ? (
              <p className="mt-2 text-[12px] italic text-[#8b8a81]">
                No signature yet, so the email goes straight from your message to the reference.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
