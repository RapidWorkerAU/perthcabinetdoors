"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { defaultTaxInvoiceMessage } from "@/lib/pcd-tax-invoice-email";

// SENDING THE TAX INVOICE.
//
// The same shape as every other email we send from an order: see who it is
// going to, read what it says, change it, send. The invoice itself is built on
// the server and attached, so what is previewed here is what arrives.

const btnPlain =
  "h-[36px] px-4 bg-white border border-[#dbd8cc] text-[13px] font-medium rounded-[6px] text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50 transition-colors";
const btnDark =
  "h-[36px] px-4 bg-[#1c2b1e] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#2d3f2f] disabled:opacity-50 transition-colors";
const field =
  "w-full px-3 py-2 border border-[#dbd8cc] rounded-[6px] bg-white text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]";

function money(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(
    Number(value) || 0
  );
}

export default function TaxInvoiceModal({ orderId, order, onClose, onSent }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [to, setTo] = useState(order?.customer_email || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/orders/${orderId}/tax-invoice/send`)
      .then((response) => response.json())
      .then((body) => {
        if (!live) return;
        if (!body?.ok) {
          setError(body?.error || "The tax invoice could not be prepared.");
          return;
        }
        setInvoice(body.invoice);
        setSubject(body.subject);
        setMessage(defaultTaxInvoiceMessage({ invoice: body.invoice }));
      })
      .catch(() => live && setError("The tax invoice could not be prepared."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [orderId]);

  // Opens a URL the browser renders itself rather than fetching a blob and
  // opening that: a window.open after an await is the thing popup blockers
  // stop, and a blocked preview looks like a broken button.
  function preview() {
    window.open(`/api/admin/orders/${orderId}/tax-invoice?inline=1`, "_blank", "noopener");
  }

  async function download() {
    const response = await fetch(`/api/admin/orders/${orderId}/tax-invoice`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast({ title: body?.error || "The tax invoice could not be made.", variant: "error" });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Tax-Invoice-${order?.order_number || "order"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function send() {
    setSending(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/tax-invoice/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, message }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "The tax invoice could not be sent.");
      toast({
        title: body.warning || `Tax invoice sent to ${body.sentTo}.`,
        variant: body.warning ? "warning" : "success",
      });
      onSent?.();
      onClose();
    } catch (sendError) {
      toast({ title: sendError.message, variant: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Send tax invoice"
      subtitle={
        order?.invoice_issued_at
          ? "Already issued, so this sends the same invoice again"
          : "The job is paid in full, so this is a record rather than a request"
      }
      size="lg"
      footer={
        <>
          {/* Just the decision. Checking it happens up beside the invoice. */}
          <button type="button" className={btnPlain} onClick={onClose} disabled={sending}>Cancel</button>
          <button
            type="button"
            className={btnDark}
            onClick={send}
            disabled={!invoice || sending || !to.trim() || !message.trim()}
          >
            {sending ? "Sending..." : "Send invoice"}
          </button>
        </>
      }
    >
      {loading ? (
        <p className="text-[13px] text-[#5a5a52] m-0">Preparing the invoice...</p>
      ) : error ? (
        <div className="rounded-[6px] border border-[#f0d060] bg-[#fffbe8] px-4 py-3">
          <p className="m-0 text-[13px] text-[#8a6d0b]">{error}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* What is about to go out, before the email that carries it. */}
          <div className="rounded-[6px] border border-[#a8c5a0] bg-[#f5f8f4] px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-[#1a1a18]">
                Tax invoice {invoice.number}
              </span>
              <span className="font-mono text-[13px] text-[#1a1a18]">
                {money(invoice.total, invoice.currency)} inc GST
              </span>
            </div>
            <p className="m-0 mt-[3px] text-[12px] text-[#2d5e28]">
              Paid in full &middot; amount due {money(invoice.due, invoice.currency)} &middot;{" "}
              {invoice.lines.length} {invoice.lines.length === 1 ? "line" : "lines"}
            </p>
            {/* THE CHECK BEFORE IT GOES, next to the thing being checked
                rather than down in the footer beside Cancel. It was there, and
                it read as "send it some other way" instead of "read it first". */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={preview}
                className="h-[30px] px-3 bg-white border border-[#a8c5a0] rounded-[6px] text-[12px] font-semibold text-[#2d5e28] hover:bg-[#edf4eb] transition-colors"
              >
                Open the PDF to check it
              </button>
              <button
                type="button"
                onClick={download}
                className="h-[30px] px-3 bg-white border border-[#dbd8cc] rounded-[6px] text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] transition-colors"
              >
                Download a copy
              </button>
            </div>
            {order?.invoice_issued_at ? (
              <p className="m-0 mt-[6px] text-[12px] text-[#5a5a52]">
                First issued{" "}
                {new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(
                  new Date(order.invoice_issued_at)
                )}
                . Sending again keeps that date, so the customer&apos;s copies match.
              </p>
            ) : null}
          </div>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-1">To</span>
            <input className={field} value={to} onChange={(event) => setTo(event.target.value)} />
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-1">Subject</span>
            <input className={field} value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8b8a81] mb-1">Message</span>
            <textarea
              className={`${field} leading-[1.6] resize-y`}
              rows={12}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <span className="mt-1 block text-[12px] text-[#5a5a52]">
              Goes out in our usual email styling with the invoice attached as a PDF.
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
