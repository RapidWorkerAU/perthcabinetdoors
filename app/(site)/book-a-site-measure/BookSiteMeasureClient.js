"use client";

// BOOKING A SITE MEASURE, FROM THE CUSTOMER'S SIDE.
//
// ── THREE STEPS, AND DAYS WITHOUT TIMES ──────────────────────────────────────
//
// They pick a day, they tell us where and who, they pay. They never pick a
// time: the block is shown and the hour is confirmed later, because a run is
// planned as a run and not as seven independent appointments.
//
// ── THE AVAILABILITY IS THE SERVER'S ANSWER, NOT THIS PAGE'S ─────────────────
//
// Nothing here works out whether a day is bookable. It draws what
// /api/public/site-measure/availability says, and the same rules decide again
// when the booking is posted. See lib/pcd-booking-settings.js for why that has
// to be one definition: a page that offers a day the route refuses sends
// somebody to a payment page for a day that is full.
//
// ── NOTHING IS HELD UNTIL THEY PRESS PAY ─────────────────────────────────────
//
// Picking a day here takes nothing off the website. The day is claimed by the
// POST, a moment before Stripe opens, and it gives itself back if they walk
// away. So two people can have the same day selected on their screens and only
// one of them will get it, which is the honest way round: the alternative holds
// days for people who are browsing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./book-site-measure.module.css";
import CancellationPolicyBody from "./CancellationPolicyBody";
import { CANCELLATION_POLICY_PATH } from "../../../lib/pcd-cancellation-policy";
import { SALES_EMAIL } from "../../../lib/pcd-business-identity";
import { DEFAULT_BOOKING_SETTINGS } from "../../../lib/pcd-booking-settings";
import {
  JOB_TYPES,
  MAX_PER_ROOM,
  isJobType,
  jobTypeLabel,
  normalizeMeasureRooms,
  roomCountWords,
  roomsWords,
} from "../../../lib/pcd-site-measure-scope";
import { ROOM_AREAS } from "../../../lib/pcd-line-details";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function money(amount) {
  return Number(amount || 0).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortDay(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
    timeZone: "UTC", day: "numeric", month: "short",
  });
}

/** Monday of the week a plain day falls in. Weeks read Monday first. */
function mondayOf(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

function addDays(day, count) {
  const [y, m, d] = String(day).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

const emptyForm = {
  name: "", email: "", phone: "", street: "", suburb: "", postcode: "", notes: "",
  rooms: {}, jobType: "",
};

const EMAIL_RE = /([^\s@]+@[^\s@]+\.[a-z]{2,})/gi;

// The closed wording typed in Settings. One paragraph per line, and any email
// address in it becomes a link, so nobody has to write HTML to get one.
function ClosedMessage({ text }) {
  const paragraphs = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return paragraphs.map((line, index) => (
    <p key={index} style={{ margin: 0 }}>
      {line.split(EMAIL_RE).map((part, i) =>
        i % 2 === 1 ? <a key={i} href={`mailto:${part}`}>{part}</a> : part
      )}
    </p>
  ));
}

export default function BookSiteMeasureClient() {
  const [state, setState] = useState({ loading: true, live: false, error: "" });
  const [availability, setAvailability] = useState(null);
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState({});
  const [scopeTouched, setScopeTouched] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const policyCloseRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/public/site-measure/availability", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setState({ loading: false, live: false, error: payload.error || "We could not load our diary." });
          return;
        }
        setAvailability(payload.live ? payload : null);
        setState({
          loading: false,
          live: Boolean(payload.live),
          error: "",
          closedHeading: payload.closedHeading,
          closedMessage: payload.closedMessage,
        });
      } catch (error) {
        if (!cancelled) setState({ loading: false, live: false, error: error?.message || "We could not load our diary." });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Focus moves into the modal when it opens, because a dialog nobody can reach
  // with a keyboard is a dialog that is not there for some people.
  useEffect(() => {
    if (policyOpen) policyCloseRef.current?.focus();
  }, [policyOpen]);

  useEffect(() => {
    if (!policyOpen) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setPolicyOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [policyOpen]);

  const byDay = useMemo(() => {
    const map = new Map();
    (availability?.days || []).forEach((row) => map.set(row.day, row));
    return map;
  }, [availability]);

  /**
   * The strip, as whole weeks.
   *
   * Built from the first bookable day to the last, padded out to Monday and
   * Sunday so every row is seven cells. A week with nothing free is dropped
   * entirely: a customer scrolling past four rows of grey is being shown our
   * diary rather than their options.
   */
  const weeks = useMemo(() => {
    const days = availability?.days || [];
    if (!days.length) return [];
    let cursor = mondayOf(days[0].day);
    const last = days[days.length - 1].day;
    const out = [];
    let guard = 0;

    while (cursor <= last && guard < 60) {
      guard += 1;
      const row = [];
      for (let i = 0; i < 7; i += 1) {
        const day = addDays(cursor, i);
        row.push(byDay.get(day) || { day, state: "closed", left: 0, windowWords: "", label: "" });
      }
      if (row.some((cell) => cell.state === "free" || cell.state === "full")) {
        out.push({ weekOf: cursor, days: row });
      }
      cursor = addDays(cursor, 7);
    }
    return out;
  }, [availability, byDay]);

  const chosen = selected ? byDay.get(selected) : null;
  // Said in words above the strip, so a diary that is shut until January does
  // not look like a diary with nothing in it.
  const nextFree = availability?.firstFree ? byDay.get(availability.firstFree) : null;
  const fee = availability?.fee || 0;
  const confirmHours = availability?.confirmHours || 48;

  const setField = useCallback((key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const detailErrors = useMemo(() => {
    const out = {};
    if (!form.name.trim()) out.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) out.email = true;
    if (!form.phone.trim()) out.phone = true;
    if (!form.street.trim()) out.street = true;
    if (!form.suburb.trim()) out.suburb = true;
    if (!/^\d{4}$/.test(form.postcode.trim())) out.postcode = true;
    return out;
  }, [form]);

  const detailsComplete = Object.keys(detailErrors).length === 0;

  // WHAT WE ARE MEASURING. Rooms are { "Bathroom": 2 } while they pick, and
  // become the [{ room, count }] list the route and the emails read. Ordered
  // as Settings > Lists has them, not in the order they were tapped.
  const roomOptions = availability?.rooms?.length ? availability.rooms : ROOM_AREAS;
  const pickedRooms = useMemo(
    () => normalizeMeasureRooms(
      Object.entries(form.rooms).map(([room, count]) => ({ room, count })),
      roomOptions
    ),
    [form.rooms, roomOptions]
  );
  const scopeComplete = pickedRooms.length > 0 && isJobType(form.jobType);

  function setRoomCount(room, count) {
    setForm((current) => {
      const rooms = { ...current.rooms };
      if (count < 1) delete rooms[room];
      else rooms[room] = Math.min(MAX_PER_ROOM, count);
      return { ...current, rooms };
    });
  }

  function goToScope() {
    if (!selected) return;
    setMessage("");
    setStep(2);
  }

  function goToDetails() {
    setScopeTouched(true);
    if (!scopeComplete) {
      setMessage(
        !pickedRooms.length
          ? "Pick at least one room, so we know how long to allow."
          : "Tell us what kind of job it is."
      );
      return;
    }
    setMessage("");
    setStep(3);
  }

  function goToPayment() {
    setTouched({ name: true, email: true, phone: true, street: true, suburb: true, postcode: true });
    if (!detailsComplete) {
      setMessage("Please fill in the boxes marked in red.");
      return;
    }
    setMessage("");
    setStep(4);
  }

  async function pay() {
    if (busy || !selected || !acknowledged) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/public/site-measure/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: selected, ...form, rooms: pickedRooms }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "We could not start this booking. Nothing has been charged.");
        // A day that filled up while they were typing sends them back to the
        // strip with a fresh diary, rather than leaving them looking at a
        // payment button for a day they cannot have.
        if (payload.field === "day") {
          setSelected(null);
          setStep(1);
          const refreshed = await fetch("/api/public/site-measure/availability", { cache: "no-store" });
          const next = await refreshed.json();
          if (next?.ok && next.live) setAvailability(next);
        }
        if (payload.field === "postcode") setStep(3);
        setBusy(false);
        return;
      }
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setMessage(error?.message || "We could not start this booking. Nothing has been charged.");
      setBusy(false);
    }
  }

  // ── what is on screen ─────────────────────────────────────────────────────

  if (state.loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>Loading our diary</div>
        <p className={styles.empty}>One moment.</p>
      </div>
    );
  }

  if (!state.live) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>{state.closedHeading || DEFAULT_BOOKING_SETTINGS.closed_heading}</div>
        <div className={styles.cardBody}>
          <ClosedMessage text={state.closedMessage || DEFAULT_BOOKING_SETTINGS.closed_message} />
          {state.error ? <p className={styles.error}>{state.error}</p> : null}
        </div>
      </div>
    );
  }

  const stepNames = ["Pick a day", "What we are measuring", "Your details", "Pay and confirm"];

  return (
    <>
      <nav className={styles.steps} aria-label="Booking steps">
        {stepNames.map((name, index) => {
          const number = index + 1;
          const done = number < step;
          const canGo =
            done ||
            (number === 2 && selected) ||
            (number === 3 && selected && scopeComplete) ||
            (number === 4 && selected && scopeComplete && detailsComplete);
          return (
            <button
              key={name}
              type="button"
              className={[
                styles.step,
                number === step ? styles.stepOn : "",
                done ? styles.stepDone : "",
                canGo && number !== step ? styles.stepClickable : "",
              ].filter(Boolean).join(" ")}
              aria-current={number === step ? "step" : undefined}
              disabled={!canGo || number === step}
              onClick={() => canGo && setStep(number)}
            >
              <span className={styles.stepMark} aria-hidden="true">{done ? "✓" : number}</span>
              <span className={styles.stepLabel}>{name}</span>
            </button>
          );
        })}
      </nav>

      {step === 1 ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>Pick a day</div>
          <div className={styles.cardBody}>
            {weeks.length ? (
              <>
                {nextFree ? (
                  <div className={styles.nextFree}>
                    <span>Next available day: <b>{nextFree.label}</b></span>
                    {selected !== nextFree.day ? (
                      <button
                        type="button"
                        className={`${styles.button} ${styles.ghost}`}
                        onClick={() => {
                          setSelected(nextFree.day);
                          document
                            .querySelector(`[data-day="${nextFree.day}"]`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        Select this day
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className={styles.strip}>
                  {weeks.map((week) => (
                    <div className={styles.week} key={week.weekOf}>
                      <span className={styles.weekOf}>{shortDay(week.weekOf)}</span>
                      <div className={styles.weekDays}>
                        {week.days.map((cell, index) => {
                          const free = cell.state === "free";
                          const isSelected = selected === cell.day;
                          const className = [
                            styles.day,
                            free ? styles.dayFree : cell.state === "full" ? styles.dayFull : styles.dayClosed,
                            isSelected ? styles.daySel : "",
                          ].filter(Boolean).join(" ");

                          const body = (
                            <>
                              <span className={styles.dayName}>{WEEKDAYS[index]}</span>
                              <span className={styles.dayNum}>{Number(String(cell.day).slice(8, 10))}</span>
                              <span className={styles.dayLeft}>
                                {free ? `${cell.left} left` : cell.state === "full" ? "full" : " "}
                              </span>
                            </>
                          );

                          if (!free) return <span className={className} key={cell.day}>{body}</span>;
                          return (
                            <button
                              type="button"
                              key={cell.day}
                              data-day={cell.day}
                              className={className}
                              aria-pressed={isSelected}
                              aria-label={`${cell.label}, ${cell.left} place${cell.left === 1 ? "" : "s"} left`}
                              onClick={() => setSelected(cell.day)}
                            >
                              {body}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.legend}>
                  <span><i style={{ background: "#f4f9f2", borderColor: "#a8c5a0" }} />Available</span>
                  <span><i style={{ background: "#f6f5f0", borderColor: "#eceadf" }} />Fully booked</span>
                  <span><i style={{ background: "transparent", borderColor: "transparent" }} />We are not out that day</span>
                </div>

                {chosen ? (
                  <div className={styles.window}>
                    <b>{chosen.label}, between {chosen.windowWords}</b>
                    <span>
                      A {chosen.hours} hour block. We confirm the exact time with you in the {confirmHours} hours
                      before.
                    </span>
                  </div>
                ) : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.button} disabled={!selected} onClick={goToScope}>
                    Continue
                  </button>
                  {!selected ? <span className={styles.tiny}>Pick a day to continue.</span> : null}
                </div>
              </>
            ) : (
              <p className={styles.empty}>
                We have nothing free at the moment. Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> and we
                will find you a day.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>What would you like measured</div>
          <div className={styles.cardBody}>
            <fieldset className={`${styles.scopeGroup} ${scopeTouched && !pickedRooms.length ? styles.scopeBad : ""}`}>
              <legend>Which rooms, and how many of each</legend>
              <div className={styles.rooms}>
                {roomOptions.map((room) => {
                  const count = Number(form.rooms[room]) || 0;
                  if (!count) {
                    return (
                      <button
                        type="button" key={room} className={styles.room}
                        onClick={() => setRoomCount(room, 1)}
                      >
                        <span>{room}</span>
                        <span className={styles.roomAdd} aria-hidden="true">+</span>
                      </button>
                    );
                  }
                  return (
                    <div key={room} className={`${styles.room} ${styles.roomOn}`}>
                      <span>{room}</span>
                      <span className={styles.stepper}>
                        <button
                          type="button" aria-label={`One fewer ${room}`}
                          onClick={() => setRoomCount(room, count - 1)}
                        >
                          &minus;
                        </button>
                        <b aria-live="polite">{count}</b>
                        <button
                          type="button" aria-label={`One more ${room}`}
                          disabled={count >= MAX_PER_ROOM}
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

            <fieldset className={`${styles.scopeGroup} ${scopeTouched && !isJobType(form.jobType) ? styles.scopeBad : ""}`}>
              <legend>What kind of job is it</legend>
              <div className={styles.jobTypes}>
                {JOB_TYPES.map((type) => (
                  <label
                    key={type.key}
                    className={`${styles.jobType} ${form.jobType === type.key ? styles.jobTypeOn : ""}`}
                  >
                    <input
                      type="radio" name="sm-job-type" value={type.key}
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
                id="sm-notes"
                placeholder="What you are planning, which parts of each room, and anything about getting in: parking, access, a dog."
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
              />
            </label>

            {message ? <p className={styles.error}>{message}</p> : null}

            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={goToDetails}>Continue</button>
              <button type="button" className={`${styles.button} ${styles.ghost}`} onClick={() => setStep(1)}>Back</button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>Where are we coming, and who do we ask for</div>
          <div className={styles.cardBody}>
            <div className={`${styles.fields} ${styles.two}`}>
              <label className={`${styles.field} ${touched.name && detailErrors.name ? styles.fieldBad : ""}`}>
                <span>Your name</span>
                <input
                  id="sm-name" type="text" autoComplete="name" placeholder="First and last name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                />
              </label>
              <label className={`${styles.field} ${touched.phone && detailErrors.phone ? styles.fieldBad : ""}`}>
                <span>Phone</span>
                <input
                  id="sm-phone" type="tel" autoComplete="tel" placeholder="0400 000 000"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                />
              </label>
            </div>

            <label className={`${styles.field} ${touched.email && detailErrors.email ? styles.fieldBad : ""}`}>
              <span>Email</span>
              <input
                id="sm-email" type="email" autoComplete="email" placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              />
            </label>

            <div className={`${styles.fields} ${styles.two}`}>
              <label className={`${styles.field} ${touched.street && detailErrors.street ? styles.fieldBad : ""}`}>
                <span>Street address</span>
                <input
                  id="sm-street" type="text" autoComplete="address-line1" placeholder="12 Example Street"
                  value={form.street}
                  onChange={(e) => setField("street", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, street: true }))}
                />
              </label>
              <label className={`${styles.field} ${touched.suburb && detailErrors.suburb ? styles.fieldBad : ""}`}>
                <span>Suburb</span>
                <input
                  id="sm-suburb" type="text" autoComplete="address-level2" placeholder="Bayswater"
                  value={form.suburb}
                  onChange={(e) => setField("suburb", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, suburb: true }))}
                />
              </label>
            </div>

            <label className={`${styles.field} ${styles.narrow} ${touched.postcode && detailErrors.postcode ? styles.fieldBad : ""}`}>
              <span>Postcode</span>
              <input
                id="sm-postcode" type="text" inputMode="numeric" autoComplete="postal-code" placeholder="6053"
                maxLength={4}
                value={form.postcode}
                onChange={(e) => setField("postcode", e.target.value.replace(/\D/g, "").slice(0, 4))}
                onBlur={() => setTouched((t) => ({ ...t, postcode: true }))}
              />
            </label>

            <p className={styles.hint}>
              This is the address we measure at. We check it is in the area we cover before you pay.
            </p>

            {message ? <p className={styles.error}>{message}</p> : null}

            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={goToPayment}>Continue to payment</button>
              <button type="button" className={`${styles.button} ${styles.ghost}`} onClick={() => setStep(2)}>Back</button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>Confirm and pay</div>
          <div className={styles.cardBody}>
            <div className={styles.feeNote}>
              <b>The {money(fee)} comes off your order.</b>
              <span>
                The fee covers our time and travel for the site measure. If you order from the quote we send you
                afterwards, the full {money(fee)} comes off that order.
              </span>
            </div>

            <div className={styles.cancelNote}>
              <b>If you need to cancel</b>
              <span>
                {availability?.cancellation?.summary}{" "}
                <button type="button" className={styles.policyLink} onClick={() => setPolicyOpen(true)}>
                  Read the cancellation policy
                </button>
              </span>
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}><span>Site measure</span><b>{chosen?.label || ""}</b></div>
              <div className={styles.summaryRow}><span>Arriving between</span><b>{chosen?.windowWords || ""}</b></div>
              <div className={styles.summaryRow}><span>Exact time confirmed</span><b>{confirmHours} hours before</b></div>
              <div className={styles.summaryRow}>
                <span>Measuring</span>
                <b>{roomsWords(pickedRooms)} ({roomCountWords(pickedRooms)})</b>
              </div>
              <div className={styles.summaryRow}><span>Job</span><b>{jobTypeLabel(form.jobType)}</b></div>
              <div className={styles.summaryRow}>
                <span>Address</span>
                <b>{[form.street, form.suburb, form.postcode].filter(Boolean).join(", ")}</b>
              </div>
            </div>

            <div className={styles.total}><span>Booking fee, inc GST</span><b>{money(fee)}</b></div>

            <label className={styles.ack}>
              <input
                id="sm-ack" type="checkbox" checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I have read the <strong>cancellation policy</strong> and I understand the{" "}
                <strong>{money(fee)} fee</strong> covers the site measure and comes off any order that follows.
              </span>
            </label>

            <div className={styles.stripeStrip}>
              <b>Card payment</b> handled by Stripe. We never see your card number.
            </div>

            {message ? <p className={styles.error}>{message}</p> : null}

            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={busy || !acknowledged} onClick={pay}>
                {busy ? "Opening payment..." : `Pay ${money(fee)} and book this day`}
              </button>
              <button type="button" className={`${styles.button} ${styles.ghost}`} disabled={busy} onClick={() => setStep(3)}>
                Back
              </button>
            </div>
            <p className={styles.tiny}>
              Need a different day? Email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
            </p>
          </div>
        </section>
      ) : null}

      {policyOpen ? (
        <div
          className={styles.scrim}
          role="dialog"
          aria-modal="true"
          aria-label="Cancellation policy"
          onClick={(event) => { if (event.target === event.currentTarget) setPolicyOpen(false); }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <b>Cancellation policy</b>
              <button
                type="button" className={styles.modalClose} ref={policyCloseRef}
                aria-label="Close" onClick={() => setPolicyOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              <CancellationPolicyBody fee={fee} confirmHours={confirmHours} salesEmail={SALES_EMAIL} compact />
            </div>
            <div className={styles.modalFoot}>
              <span className={styles.tiny}>
                <Link href={CANCELLATION_POLICY_PATH} target="_blank">Full policy</Link>
              </span>
              <button type="button" className={styles.button} onClick={() => setPolicyOpen(false)}>Got it</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
