"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PcdLoader from "@/components/public/PcdLoader";
import { ADDRESS_FIELDS } from "../../../lib/pcd-contact-details";
import styles from "../quotes/quote-public.module.css";

// THE PAGE A CUSTOMER LANDS ON THE DAY BEFORE A VISIT.
//
// ── IT ONLY ASKS FOR WHAT IS ACTUALLY MISSING ────────────────────────────────
//
// needMobile and needAddress come from the server, not from reading the
// booking here, so the browser cannot decide it holds something it does not.
// A customer who gave us a number last month is never told we have none.
//
// ── DECLINING ASKS FOR NOTHING ───────────────────────────────────────────────
//
// Somebody telling us not to come does not owe us their address first. Only the
// confirm path is gated, and the same gate is applied again in the action route,
// because a check in the browser is a suggestion.
//
// ── THE ADDRESS BOXES ARE THE SHARED ONES ────────────────────────────────────
//
// ADDRESS_FIELDS from lib/pcd-contact-details.js, the same three used when a
// quote is accepted, so an address captured here comes out the same shape as one
// captured there. That was the whole point of that file existing.

const MOBILE_PATTERN = /^(\+?61|0)[2-478]\d{8}$/;

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "We could not read the server response. Please refresh and try again." };
  }
}

export default function BookingConfirmClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [choice, setChoice] = useState("");
  const [answeredBy, setAnsweredBy] = useState("");
  const [contactName, setContactName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState({ street: "", suburb: "", postcode: "" });
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    async function load() {
      if (!code) {
        setLoadError("This link is missing its code. Please use the link in your email.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/booking-confirmation/get?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const payload = await readJson(response);
        if (!response.ok || !payload.ok) {
          setLoadError(payload.error || "We could not load this appointment.");
          return;
        }
        setBooking(payload.booking);
        setAnsweredBy(payload.booking.customerName || "");
        setContactName(payload.booking.contactName || "");
        setMobile(payload.booking.contactMobile || "");
        // Already answered. They can still change it, so this is a starting
        // position rather than a lock.
        if (payload.booking.answer) setChoice(payload.booking.answer === "confirmed" ? "confirm" : "decline");
      } catch (thrown) {
        setLoadError(thrown?.message || "We could not load this appointment.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [code]);

  function validate() {
    const found = {};
    if (choice !== "confirm") return found;
    if (!answeredBy.trim()) found.answeredBy = "Please tell us who you are.";
    if (booking?.needMobile) {
      if (!mobile.trim()) found.mobile = "We need a number to call on the day.";
      else if (!MOBILE_PATTERN.test(mobile.replace(/[\s()-]/g, ""))) {
        found.mobile = "Enter an Australian mobile or landline.";
      }
    }
    if (booking?.needAddress) {
      if (!address.street.trim()) found.street = "We need somewhere to drive to.";
      if (!address.suburb.trim()) found.suburb = "Required.";
      if (!address.postcode.trim()) found.postcode = "Required.";
    }
    return found;
  }

  async function submit() {
    setMessage("");
    if (!choice) {
      setMessage("Please tell us whether the time suits before you send.");
      return;
    }

    const found = choice === "confirm" ? validate() : {};
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage("We need a few more details before we can confirm. They are marked below.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/booking-confirmation/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          answer: choice === "confirm" ? "confirmed" : "declined",
          answeredBy: answeredBy.trim(),
          contactName: contactName.trim(),
          mobile: mobile.trim(),
          street: address.street.trim(),
          suburb: address.suburb.trim(),
          postcode: address.postcode.trim(),
          notes: notes.trim(),
        }),
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "We could not record your answer.");
        return;
      }
      setDone(payload.answer);
    } catch (thrown) {
      setMessage(thrown?.message || "We could not record your answer.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Your Appointment</div>
        <div className={styles.panelBody}>
          <PcdLoader
            variant="panel"
            label="Loading your appointment"
            steps={["Finding your booking", "Loading the details", "Almost there"]}
          />
        </div>
      </section>
    );
  }

  if (loadError || !booking) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>Your Appointment</div>
        <div className={styles.panelBody}>
          <p className={styles.message}>{loadError || "We could not find that appointment."}</p>
          <p className={styles.noteText}>
            If you were expecting to see a booking here, reply to the email we sent you or give us a call and we
            will sort it out.
          </p>
        </div>
      </section>
    );
  }

  if (done) return <Answered booking={booking} answer={done} notes={notes} />;

  // Been and gone, or taken off the calendar. Details, and no buttons.
  if (booking.closed) {
    return (
      <div className={styles.quoteViewCard}>
        <Details booking={booking} mobile={mobile} contactName={contactName} address={address} />
        <section className={styles.panel}>
          <div className={styles.panelHeader}>{booking.closed === "cancelled" ? "Cancelled" : "This has passed"}</div>
          <div className={styles.panelBody}>
            <p className={styles.message}>
              {booking.closed === "cancelled"
                ? "This appointment has been cancelled, so there is nothing to answer."
                : "This appointment has already started, so it can no longer be answered here."}
            </p>
            <p className={styles.noteText}>If you need anything, reply to your email or give us a call.</p>
          </div>
        </section>
      </div>
    );
  }

  const wantMobile = booking.needMobile;
  const wantAddress = booking.needAddress;
  const optional = !booking.linked;
  const missingWords = [wantMobile ? "a mobile number" : "", wantAddress ? "an address" : ""].filter(Boolean);

  return (
    <div className={styles.quoteViewCard}>
      <Details booking={booking} mobile={mobile} contactName={contactName} address={address} />

      {wantMobile || wantAddress || optional ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>{optional ? "Customer Details" : "Details We Still Need"}</div>
          <div className={styles.panelBody}>
            {optional ? (
              <p className={styles.variationScopeNotice}>
                <strong>Anything you can tell us helps</strong>
                None of these are required. Fill in whatever you know and it is saved against the booking.
              </p>
            ) : (
              <p className={styles.variationScopeNotice}>
                <strong>
                  {missingWords.length > 1
                    ? "Two things we need before you can confirm"
                    : "One thing we need before you can confirm"}
                </strong>
                We do not have {missingWords.join(" or ")} for this {booking.kindLabel.toLowerCase()}.{" "}
                {wantMobile && wantAddress
                  ? "We need a number to call on the day and somewhere to drive to."
                  : wantMobile
                    ? "We need a number to call on the day."
                    : "We need somewhere to drive to."}{" "}
                It is saved against your job.
              </p>
            )}

            <div className={styles.formStack}>
              <Field
                label="Best contact name"
                value={contactName}
                onChange={setContactName}
                error={errors.contactName}
                placeholder="Who should we ask for on the day"
              />
              {wantMobile || optional ? (
                <Field
                  label="Best contact number"
                  value={mobile}
                  onChange={setMobile}
                  error={errors.mobile}
                  type="tel"
                  placeholder="0412 345 678"
                  autoComplete="tel"
                />
              ) : null}
              {wantAddress || optional
                ? ADDRESS_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      value={address[field.key]}
                      onChange={(value) => setAddress((current) => ({ ...current, [field.key]: value }))}
                      error={errors[field.key]}
                      placeholder={field.placeholder}
                      autoComplete={field.autoComplete}
                      inputMode={field.inputMode}
                    />
                  ))
                : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>Your Answer</div>
        <div className={styles.panelBody}>
          <div className={styles.formStack}>
            <label className={styles.publicPaymentAck}>
              <input
                type="radio"
                name="booking-answer"
                checked={choice === "confirm"}
                onChange={() => {
                  setChoice("confirm");
                  setMessage("");
                }}
              />
              <span>
                <strong>Yes, that suits.</strong> We will see you {booking.dayShort}
                {booking.startTime ? ` at ${booking.startTime}` : ""}.
              </span>
            </label>
            <label className={styles.publicPaymentAck}>
              <input
                type="radio"
                name="booking-answer"
                checked={choice === "decline"}
                onChange={() => {
                  setChoice("decline");
                  setErrors({});
                  setMessage("");
                }}
              />
              <span>
                <strong>No, that does not suit.</strong> Tell us below if you would like another time.
              </span>
            </label>

            <label className={styles.label}>
              Your name
              <input
                className={styles.input}
                value={answeredBy}
                onChange={(event) => setAnsweredBy(event.target.value)}
              />
              {errors.answeredBy ? <span className={styles.variationScopeFootnote}>{errors.answeredBy}</span> : null}
            </label>

            <label className={styles.label}>
              Anything we should know
              <textarea
                className={styles.textarea}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Gate code, parking, a better time of day, anything at all."
              />
            </label>

            {message ? <p className={styles.message}>{message}</p> : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={choice === "decline" ? styles.buttonDanger : styles.button}
                onClick={submit}
                disabled={saving}
              >
                {choice === "decline" ? "Send my answer" : "Confirm appointment"}
              </button>
            </div>

            <p className={styles.variationScopeFootnote}>
              You can come back to this link and change your answer any time before the appointment starts.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Details({ booking, mobile, contactName, address }) {
  const line = [address?.street, [address?.suburb, address?.postcode].filter(Boolean).join(" ")]
    .filter((part) => String(part || "").trim())
    .join(", ");
  const where = booking.siteAddress || line;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>Your Appointment</div>
      <div className={styles.panelBody}>
        <div className={styles.quoteViewSummaryGrid}>
          <Item label="What" value={booking.kindLabel} />
          <Item label="When" value={booking.dayLong} />
          <Item label="Time" value={booking.timeRange} />
          <Item
            label="Where"
            value={where || (booking.needAddress ? "We need this from you below" : "Not recorded")}
          />
          <Item label="Best contact" value={contactName || booking.customerName || "Not recorded"} />
          <Item
            label="Best number"
            value={mobile || (booking.needMobile ? "We need this from you below" : "Not recorded")}
          />
        </div>
      </div>
    </section>
  );
}

function Answered({ booking, answer, notes }) {
  const confirmed = answer === "confirmed";
  return (
    <div className={styles.quoteViewCard}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>{confirmed ? "Confirmed" : "Cancelled"}</div>
        <div className={styles.panelBody}>
          <p className={styles.message}>
            {confirmed
              ? `Your ${booking.kindLabel.toLowerCase()} on ${booking.dayLong}${
                  booking.startTime ? ` at ${booking.startTime}` : ""
                } is confirmed.`
              : `Your ${booking.kindLabel.toLowerCase()} on ${booking.dayLong}${
                  booking.startTime ? ` at ${booking.startTime}` : ""
                } is cancelled.`}
          </p>
          <p className={styles.noteText}>
            {confirmed
              ? "Our team has been told. If something changes before then, use this link again or give us a call."
              : "Thanks for letting us know. There is nothing else you need to do. If you would like another time, or there is anything else we can help with, just get in touch."}
          </p>
          {notes ? (
            <p className={styles.noteText}>
              <strong>What you told us:</strong> {notes}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div className={styles.summaryItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, value, onChange, error, type = "text", placeholder, autoComplete, inputMode }) {
  return (
    <label className={styles.label}>
      {label}
      <input
        className={styles.input}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
      />
      {error ? <span className={styles.variationScopeFootnote}>{error}</span> : null}
    </label>
  );
}
