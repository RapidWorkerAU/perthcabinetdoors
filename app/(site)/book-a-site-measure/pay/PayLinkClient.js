"use client";

// PAYING FOR A SITE MEASURE BOOKED ON THE PHONE.
//
// The calendar sent a link. If we asked for their details, this page asks for
// them first, laid out the way the booking page lays them out, then opens the
// payment. If we did not, it shows the booking and a Pay button.
//
// Nothing here decides whether the link is still open. The server says, and
// says again when Pay is pressed, because a check in the browser is a
// suggestion. See lib/pcd-site-measure-payment-link.js.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../book-site-measure.module.css";
import { CANCELLATION_POLICY_PATH } from "../../../../lib/pcd-cancellation-policy";
import { BUSINESS_PHONE, SALES_EMAIL } from "../../../../lib/pcd-business-identity";
import {
  JOB_TYPES,
  MAX_PER_ROOM,
  isJobType,
  jobTypeLabel,
  normalizeMeasureRooms,
  roomCountWords,
  roomsWords,
} from "../../../../lib/pcd-site-measure-scope";

function money(amount) {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

async function readJson(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    return { ok: false, error: "We could not read the server response. Please refresh and try again." };
  }
}

export default function PayLinkClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";

  const [booking, setBooking] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", street: "", suburb: "", postcode: "", rooms: {}, jobType: "", notes: "",
  });
  const [touched, setTouched] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      if (!code) {
        setLoadError("This link is missing its code. Please use the link in your email.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/public/site-measure/link?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        const payload = await readJson(response);
        if (!live) return;
        if (!response.ok || !payload.ok) {
          setLoadError(payload.error || "We could not load this booking.");
          return;
        }
        const view = payload.booking;
        setBooking(view);
        setForm({
          name: view.details.name,
          email: view.details.email,
          phone: view.details.phone,
          street: view.details.street,
          suburb: view.details.suburb,
          postcode: view.details.postcode,
          rooms: Object.fromEntries((view.details.rooms || []).map((entry) => [entry.room, entry.count])),
          jobType: view.details.jobType,
          notes: view.details.notes,
        });
      } catch (error) {
        if (live) setLoadError(error?.message || "We could not load this booking.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [code]);

  const roomOptions = useMemo(() => booking?.rooms || [], [booking]);
  const pickedRooms = useMemo(
    () => normalizeMeasureRooms(Object.entries(form.rooms).map(([room, count]) => ({ room, count })), roomOptions),
    [form.rooms, roomOptions]
  );

  const errors = useMemo(() => {
    if (!booking?.needDetails) return {};
    const out = {};
    if (!form.name.trim()) out.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) out.email = true;
    if (!form.phone.trim()) out.phone = true;
    if (!form.street.trim()) out.street = true;
    if (!form.suburb.trim()) out.suburb = true;
    if (!/^\d{4}$/.test(form.postcode.trim())) out.postcode = true;
    if (!pickedRooms.length) out.rooms = true;
    if (!isJobType(form.jobType)) out.jobType = true;
    return out;
  }, [booking, form, pickedRooms]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setRoomCount = (room, count) =>
    setForm((current) => {
      const rooms = { ...current.rooms };
      if (count < 1) delete rooms[room];
      else rooms[room] = Math.min(MAX_PER_ROOM, count);
      return { ...current, rooms };
    });

  async function pay() {
    setTouched(true);
    setMessage("");
    if (Object.keys(errors).length) {
      setMessage("We still need a few details. They are marked above.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/public/site-measure/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...form, rooms: pickedRooms }),
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.ok || !payload.checkoutUrl) {
        setMessage(payload.error || "We could not open the payment page. Nothing has been charged.");
        setBusy(false);
        return;
      }
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setMessage(error?.message || "We could not open the payment page. Nothing has been charged.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>Loading your booking</div>
        <p className={styles.empty}>One moment.</p>
      </div>
    );
  }

  if (loadError || !booking) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>We could not find that booking</div>
        <div className={styles.cardBody}>
          <p style={{ margin: 0 }}>{loadError || "We could not find that booking."}</p>
          <p className={styles.hint}>
            Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> or call {BUSINESS_PHONE} and we will sort it out.
          </p>
        </div>
      </div>
    );
  }

  const summary = (
    <div className={styles.summary}>
      <div className={styles.summaryRow}><span>Site measure</span><b>{booking.dayWords}</b></div>
      <div className={styles.summaryRow}><span>Time</span><b>{booking.timeWords}</b></div>
      {!booking.needDetails && booking.details.address ? (
        <div className={styles.summaryRow}><span>Address</span><b>{booking.details.address}</b></div>
      ) : null}
      <div className={styles.summaryRow}><span>Status</span><b>{booking.state === "paid" ? "Paid and confirmed" : "Held, not confirmed until paid"}</b></div>
    </div>
  );

  if (booking.state !== "open") {
    const words = {
      paid: ["This site measure is paid for", "Thank you. Your booking is confirmed and we have emailed you the details."],
      cancelled: ["This booking has been cancelled", "There is nothing to pay. If you would still like a site measure, get in touch."],
      closed: [
        "This link has closed",
        `This booking was not paid in time, so it can no longer be confirmed online${
          booking.closesWords ? ` (the link closed ${booking.closesWords})` : ""
        }. Please call us on ${BUSINESS_PHONE} and we will sort it out.`,
      ],
      missing: ["We could not find that booking", "Please call us and we will sort it out."],
    }[booking.state] || ["This link is not available", "Please call us and we will sort it out."];
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>{words[0]}</div>
        <div className={styles.cardBody}>
          {summary}
          <p className={styles.hint}>{words[1]}</p>
        </div>
      </div>
    );
  }

  const bad = (key) => (touched && errors[key] ? styles.fieldBad : "");

  return (
    <>
      {booking.needDetails ? (
        <>
          <section className={styles.card}>
            <div className={styles.cardHead}>What would you like measured</div>
            <div className={styles.cardBody}>
              <fieldset className={`${styles.scopeGroup} ${touched && errors.rooms ? styles.scopeBad : ""}`}>
                <legend>Which rooms, and how many of each</legend>
                <div className={styles.rooms}>
                  {roomOptions.map((room) => {
                    const count = Number(form.rooms[room]) || 0;
                    if (!count) {
                      return (
                        <button type="button" key={room} className={styles.room} onClick={() => setRoomCount(room, 1)}>
                          <span>{room}</span>
                          <span className={styles.roomAdd} aria-hidden="true">+</span>
                        </button>
                      );
                    }
                    return (
                      <div key={room} className={`${styles.room} ${styles.roomOn}`}>
                        <span>{room}</span>
                        <span className={styles.stepper}>
                          <button type="button" aria-label={`One fewer ${room}`} onClick={() => setRoomCount(room, count - 1)}>
                            &minus;
                          </button>
                          <b aria-live="polite">{count}</b>
                          <button
                            type="button" aria-label={`One more ${room}`} disabled={count >= MAX_PER_ROOM}
                            onClick={() => setRoomCount(room, count + 1)}
                          >
                            +
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className={styles.tiny}>
                  {pickedRooms.length
                    ? `${roomCountWords(pickedRooms)}: ${roomsWords(pickedRooms)}`
                    : "Tap each room we are measuring. Two bathrooms? Tap Bathroom, then +."}
                </p>
              </fieldset>

              <fieldset className={`${styles.scopeGroup} ${touched && errors.jobType ? styles.scopeBad : ""}`}>
                <legend>What kind of job is it</legend>
                <div className={styles.jobTypes}>
                  {JOB_TYPES.map((type) => (
                    <label key={type.key} className={`${styles.jobType} ${form.jobType === type.key ? styles.jobTypeOn : ""}`}>
                      <input
                        type="radio" name="pl-job-type" value={type.key}
                        checked={form.jobType === type.key}
                        onChange={() => setField("jobType", type.key)}
                      />
                      <span>{type.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className={styles.field}>
                <span>Anything else we should know</span>
                <textarea
                  placeholder="What you are planning, which parts of each room, and anything about getting in: parking, access, a dog."
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>Where are we coming, and who do we ask for</div>
            <div className={styles.cardBody}>
              <div className={`${styles.fields} ${styles.two}`}>
                <label className={`${styles.field} ${bad("name")}`}>
                  <span>Your name</span>
                  <input type="text" autoComplete="name" value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </label>
                <label className={`${styles.field} ${bad("phone")}`}>
                  <span>Phone</span>
                  <input type="tel" autoComplete="tel" placeholder="0400 000 000" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                </label>
              </div>
              <label className={`${styles.field} ${bad("email")}`}>
                <span>Email</span>
                <input type="email" autoComplete="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
              </label>
              <div className={`${styles.fields} ${styles.two}`}>
                <label className={`${styles.field} ${bad("street")}`}>
                  <span>Street address</span>
                  <input type="text" autoComplete="address-line1" value={form.street} onChange={(e) => setField("street", e.target.value)} />
                </label>
                <label className={`${styles.field} ${bad("suburb")}`}>
                  <span>Suburb</span>
                  <input type="text" autoComplete="address-level2" value={form.suburb} onChange={(e) => setField("suburb", e.target.value)} />
                </label>
              </div>
              <label className={`${styles.field} ${styles.narrow} ${bad("postcode")}`}>
                <span>Postcode</span>
                <input
                  type="text" inputMode="numeric" autoComplete="postal-code" maxLength={4}
                  value={form.postcode}
                  onChange={(e) => setField("postcode", e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </label>
            </div>
          </section>
        </>
      ) : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>Confirm and pay</div>
        <div className={styles.cardBody}>
          {summary}

          <div className={styles.feeNote}>
            <b>The {money(booking.fee)} comes off your order.</b>
            <span>
              The fee covers our time and travel for the site measure. If you order from the quote we send you
              afterwards, the full {money(booking.fee)} comes off that order.
            </span>
          </div>

          <div className={styles.cancelNote}>
            <b>Not confirmed until paid</b>
            <span>
              This link works until {booking.closesWords}. If it has not been paid by then, the time is not confirmed
              and we will not come out.
            </span>
          </div>

          <div className={styles.cancelNote}>
            <b>If you need to cancel</b>
            <span>
              {booking.cancellation}{" "}
              <Link href={CANCELLATION_POLICY_PATH} target="_blank">Read the cancellation policy</Link>
            </span>
          </div>

          {booking.needDetails && pickedRooms.length ? (
            <div className={styles.summary}>
              <div className={styles.summaryRow}><span>Measuring</span><b>{roomsWords(pickedRooms)} ({roomCountWords(pickedRooms)})</b></div>
              {isJobType(form.jobType) ? (
                <div className={styles.summaryRow}><span>Job</span><b>{jobTypeLabel(form.jobType)}</b></div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.total}><span>Site measure fee, inc GST</span><b>{money(booking.fee)}</b></div>

          <label className={styles.ack}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>
              I have read the <strong>cancellation policy</strong> and I understand the{" "}
              <strong>{money(booking.fee)} fee</strong> covers the site measure and comes off any order that follows.
            </span>
          </label>

          <div className={styles.stripeStrip}>
            <b>Card payment</b> handled by Stripe. We never see your card number.
          </div>

          {message ? <p className={styles.error}>{message}</p> : null}

          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={busy || !acknowledged} onClick={pay}>
              {busy ? "Opening payment..." : `Pay ${money(booking.fee)} and confirm`}
            </button>
          </div>
          <p className={styles.tiny}>
            Need a different time? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> or call {BUSINESS_PHONE}.
          </p>
        </div>
      </section>
    </>
  );
}
