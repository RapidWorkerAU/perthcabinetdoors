"use client";

// REVIEW AND SEND, WHICH IS NOT A CHECKOUT.
//
// The shop's checkout takes an address and a card. This takes a name and an
// email and nothing else, because there is no price yet and nothing to charge.
// It says so where the total would be, rather than leaving a gap somebody has
// to interpret.
//
// It sends what the builder built. What goes to the endpoint is
// lib/pcd-quote-request-payload.js, the same module the builder used when it
// was also the thing that sent, so moving the send here did not fork the answer
// to "what do we actually send".

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CABINET_BRANDS } from "@/lib/quote-form-data";
import { clearQuoteDraft, draftItemCount, useQuoteDraft, writeQuoteDetails } from "@/lib/pcd-quote-draft";
import { lineOneLiner } from "@/lib/pcd-quote-line-text";
import { detailProblems, quoteRequestPayload } from "@/lib/pcd-quote-request-payload";
import { describeGaps, lineGaps } from "@/lib/pcd-quote-ready";
import { sizeProblems } from "@/lib/pcd-size-limits";
import styles from "../../contact/contact.module.css";

export default function QuoteSendClient() {
  const draft = useQuoteDraft();

  // Nothing is claimed until the store has actually looked. A server render has
  // no localStorage, so an unguarded page tells somebody with a full list that
  // there is nothing to send, and does it in the moment before they hydrate.
  //
  // The form is a separate component so that it MOUNTS after that: its first
  // render is the one that sees the details they typed last time, which is what
  // makes a failed send recoverable rather than something to type again.
  if (!draft.ready) return <div className={styles.listWaiting} aria-hidden="true" />;
  return <SendForm draft={draft} />;
}

export function SendForm({ draft }) {
  const router = useRouter();
  const lines = draft.lines;

  const [details, setDetails] = useState(() => ({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    suburb: "",
    cabinetBrand: "",
    notes: "",
    ...draft.details,
  }));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  const count = draftItemCount(lines);

  // WHAT WE CANNOT PRICE, FOUND BEFORE THE BUTTON IS PRESSED.
  //
  // Lines that came across from the configurator arrived already saved, so they
  // never passed through the builder's check. Finding out here is better than
  // finding out from the endpoint, and far better than us finding out later and
  // having to email and ask.
  const unready = useMemo(
    () =>
      lines
        .map((line) => ({ line, gaps: lineGaps(line), problems: sizeProblems(line) }))
        .filter((entry) => entry.gaps.length || entry.problems.length),
    [lines]
  );

  function set(field, value) {
    setDetails((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function send(event) {
    event.preventDefault();
    setStatus(null);

    const problems = detailProblems(details);
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    if (unready.length) {
      setStatus({
        type: "error",
        message:
          unready.length === 1
            ? unready[0].problems[0] ||
              `One line is missing ${describeGaps(unready[0].gaps)}. Open it on the builder and finish it.`
            : `${unready.length} lines are missing details we need to price them. Open each one on the builder and finish it.`,
      });
      return;
    }

    setErrors({});
    setSending(true);
    // Kept before the request goes out, so a failed send does not cost them
    // everything they typed.
    writeQuoteDetails(details);

    try {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteRequestPayload({ items: lines, details })),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not send quote request.");

      // Sent, so it is not a draft any more. Cleared before the redirect, or
      // pressing back would show them a list they have already sent and invite
      // them to send it twice.
      clearQuoteDraft();
      // The endpoint answers with an id and, where some part of the request
      // could not be read cleanly, a notice saying so. The notice is carried
      // across because it is the one thing on the confirmation that is about
      // THEIR request rather than about every request.
      const query = new URLSearchParams();
      if (result.notice) query.set("notice", result.notice);
      const search = query.toString();
      router.push(`/request-quote/sent${search ? `?${search}` : ""}`);
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Could not send quote request." });
      setSending(false);
    }
  }

  if (!lines.length) {
    return (
      <div className={styles.listEmpty}>
        <h2>There is nothing to send yet</h2>
        <p>Add an item and we will price it. There is no charge and no obligation.</p>
        <Link className={styles.listEmptyBtn} href="/request-quote">
          Start a quote request
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.listPage} onSubmit={send}>
      <div className={styles.listGrid}>
        <div className={styles.sendMain}>
          <div className={styles.sendCard}>
            <span className={styles.sectionLabel}>Who we are quoting</span>
            <div className={styles.quoteFieldGrid}>
              <div className={styles.field}>
                <label htmlFor="firstName">First name</label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Sarah"
                  value={details.firstName}
                  className={errors.firstName ? styles.fieldInputError : ""}
                  onChange={(event) => set("firstName", event.target.value)}
                />
                {errors.firstName ? <span className={styles.fieldError}>{errors.firstName}</span> : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Jones"
                  value={details.lastName}
                  onChange={(event) => set("lastName", event.target.value)}
                />
              </div>
            </div>

            <div className={styles.quoteFieldGrid}>
              <div className={styles.field}>
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="0400 000 000"
                  value={details.phone}
                  className={errors.phone ? styles.fieldInputError : ""}
                  onChange={(event) => set("phone", event.target.value)}
                />
                {errors.phone ? <span className={styles.fieldError}>{errors.phone}</span> : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="sarah@email.com"
                  value={details.email}
                  className={errors.email ? styles.fieldInputError : ""}
                  onChange={(event) => set("email", event.target.value)}
                />
                {errors.email ? <span className={styles.fieldError}>{errors.email}</span> : null}
              </div>
            </div>

            <div className={styles.quoteFieldGrid}>
              <div className={styles.field}>
                <label htmlFor="suburb">Delivery suburb</label>
                <input
                  id="suburb"
                  type="text"
                  placeholder="e.g. Subiaco"
                  value={details.suburb}
                  onChange={(event) => set("suburb", event.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="cabinetBrand">Cabinet brand</label>
                <select
                  className="pcdSelect"
                  id="cabinetBrand"
                  value={details.cabinetBrand}
                  onChange={(event) => set("cabinetBrand", event.target.value)}
                >
                  <option value="">Select if relevant</option>
                  {CABINET_BRANDS.map((brand) => (
                    <option key={brand}>{brand}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* An address is not asked for here. We only need one once they
                accept the quote, and asking for it now is asking somebody to
                hand over their address to find out a price. */}
            <p className={styles.sendNote}>
              We only need a delivery address once you accept the quote.
            </p>
          </div>

          <div className={styles.sendCard}>
            <span className={styles.sectionLabel}>Anything else we should know</span>
            <div className={styles.field}>
              <label htmlFor="notes">About the job as a whole</label>
              <textarea
                id="notes"
                placeholder="e.g. timing, access, or anything else that helps us quote accurately"
                value={details.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </div>
            <p className={styles.sendNote}>
              Something about one particular item goes on that item, on the builder, so it stays
              attached to the door it is about.
            </p>
          </div>

          <div className={styles.sendCard}>
            <span className={styles.sectionLabel}>On this request</span>
            {lines.map((line) => (
              <div className={styles.sendLine} key={line.id}>
                <span>{lineOneLiner(line)}</span>
                <strong>x {Math.max(1, Number(line.qty) || 1)}</strong>
              </div>
            ))}
            <Link className={styles.sendBackLink} href="/request-quote/list">
              Change my list
            </Link>
          </div>
        </div>

        <aside className={styles.listSide}>
          <div className={styles.listSideHead}>
            <span className={styles.sectionLabel}>Sending, not buying</span>
          </div>
          <div className={styles.listSideBody}>
            <p className={styles.sendSideNote}>
              There is no total on this page because there is no price yet. Nothing is charged, and
              nothing is made until you accept the quote.
            </p>

            <div className={styles.listTotal}>
              <strong>
                {count} {count === 1 ? "item" : "items"}
              </strong>
              <span>No price yet</span>
            </div>

            {unready.length ? (
              <p className={styles.fieldError}>
                {unready.length === 1 ? "One line still needs" : `${unready.length} lines still need`} details
                before we can price {unready.length === 1 ? "it" : "them"}.{" "}
                <Link href="/request-quote">Finish on the builder</Link>
              </p>
            ) : null}

            <button className={styles.listSendBtnAction} disabled={sending} type="submit">
              {sending ? "Sending..." : "Send my quote request"}
            </button>
            <p className={styles.listSideFoot}>
              We come back within 1-3 business days. For anything urgent call{" "}
              <a href="tel:0437750990">0437 750 990</a>.
            </p>
            {status ? (
              <p className={`${styles.formStatus} ${status.type === "error" ? styles.formStatusError : ""}`}>
                {status.message}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </form>
  );
}
