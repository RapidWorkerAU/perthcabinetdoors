"use client";

// WHAT THE PUBLIC SITE MEASURE BOOKING PAGE OFFERS.
//
// ── EVERYTHING HERE IS READ BY THE WEBSITE ───────────────────────────────────
//
// The days, the windows, the cap, the fee and the two clocks. Nothing about the
// booking page is written in code, so changing a window here changes what a
// customer is offered on the next page load and nothing else has to be touched.
//
// ── THE ONE TO UNDERSTAND BEFORE CHANGING IT ─────────────────────────────────
//
// "We confirm the time by" does two jobs on purpose. It is when we tell the
// customer their exact hour, AND it is the cancellation cutoff: outside it the
// fee is refunded, inside it it becomes a credit. Making them one number gives
// the refund rule a reason a customer accepts without arguing, which is that
// once we have confirmed your time the day is committed. See
// lib/pcd-cancellation-policy.js.

import { useEffect, useState } from "react";
import { DAY_LABELS, WEEK_ORDER } from "../../../lib/pcd-booking-settings";

const tw = {
  card: "overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white",
  head: "border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] flex items-center justify-between gap-3",
  row: "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3",
  rowLabel: "block text-[13px] font-medium text-[#1a1a18]",
  rowHint: "mt-[2px] block text-[11px] leading-snug text-[#8b8a81]",
  num: "h-[36px] w-[96px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-right font-mono text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  time: "h-[36px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 font-mono text-[13px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  btn: "h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50",
  primary:
    "h-[36px] rounded-[6px] border border-[#1c2b1e] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50",
  note: "m-0 border-t border-[#edf4eb] bg-[#fffdf0] px-4 py-[11px] text-[12px] leading-[1.5] text-[#8a6d0b]",
  textarea:
    "w-full min-h-[64px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  pill: "inline-flex items-center gap-1 rounded-full border border-[#a8c5a0] bg-[#edf4eb] px-[9px] py-[2px] font-mono text-[11px] text-[#2d5e28]",
};

function hoursBetween(from, to) {
  const [fh, fm] = String(from || "").split(":").map(Number);
  const [th, tm] = String(to || "").split(":").map(Number);
  if (![fh, fm, th, tm].every(Number.isFinite)) return 0;
  return Math.round(((th * 60 + tm - fh * 60 - fm) / 60) * 10) / 10;
}

export default function BookingSettingsCard() {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [newClosedDate, setNewClosedDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/admin/booking-settings", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setLoadError(payload.error || "Could not load the booking settings.");
          return;
        }
        setSettings(payload.settings);
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || "Could not load the booking settings.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function update(patch) {
    setSettings((current) => ({ ...current, ...patch }));
    setMessage("");
  }

  function updateDay(key, patch) {
    setSettings((current) => ({
      ...current,
      days: { ...current.days, [key]: { ...current.days[key], ...patch } },
    }));
    setMessage("");
  }

  async function save() {
    if (!settings || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/booking-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save.");
      setSettings(payload.settings);
      setMessage("Saved. The website is reading these now.");
    } catch (error) {
      setMessage(error?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className={tw.card}>
        <div className={tw.head}>Site measure bookings</div>
        <p className="m-0 px-4 py-3 text-[13px] text-[#991b1b]">{loadError}</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={tw.card}>
        <div className={tw.head}>Site measure bookings</div>
        <p className="m-0 px-4 py-3 text-[13px] text-[#8b8a81]">Loading.</p>
      </div>
    );
  }

  const openDays = WEEK_ORDER.filter((key) => settings.days[key]?.open);
  const weekly = openDays.length * Number(settings.max_per_day || 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[8px] border border-[#dbd8cc] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1a1a18]">Site measures</h3>
            <p className="mt-[3px] max-w-[70ch] text-[12.5px] text-[#5a5a52]">
              What the booking page on the website offers, and what it charges. A customer picks a day, never a
              time: they are shown the block and we confirm the hour closer to it.
            </p>
          </div>

          {/* THE SWITCH THAT TAKES THE PAGE OFF THE WEBSITE, at the top where
              it governs everything under it. The page still exists when this is
              off and says it is not taking bookings, so a link somebody has
              already sent does not break. */}
          <label
            htmlFor="booking-live"
            className={`flex flex-none cursor-pointer items-center gap-2.5 rounded-[6px] border px-3 py-2 text-[12px] font-medium ${
              settings.is_live
                ? "border-[#a8c5a0] bg-[#edf4eb] text-[#2d5e28]"
                : "border-[#dbd8cc] bg-[#f5f8f4] text-[#5a5a52]"
            }`}
          >
            <input
              id="booking-live"
              type="checkbox"
              className="h-[15px] w-[15px] accent-[#2d5e28]"
              checked={Boolean(settings.is_live)}
              onChange={(event) => update({ is_live: event.target.checked })}
            />
            {settings.is_live ? "Open to the public" : "Closed to the public"}
          </label>
        </div>
      </div>

      <div className={tw.card}>
        <div className={tw.head}>
          <span>Days we take bookings</span>
        </div>

        {/* THE DAYS, AND EACH ONE'S OWN WINDOW.
            A window per day rather than one for the whole week, so mornings on
            a Thursday and afternoons on a Tuesday are possible. The customer is
            shown the block belonging to the day they pick and never sees a
            list of times. */}
        <div className="divide-y divide-[#edf4eb]">
          {WEEK_ORDER.map((key) => {
            const day = settings.days[key] || {};
            const hours = hoursBetween(day.from, day.to);
            const backwards = day.open && hours <= 0;
            return (
              <div key={key} className={`${tw.row} ${day.open ? "" : "opacity-60"}`}>
                <label className="flex min-w-0 flex-1 items-center gap-2.5">
                  <input
                    id={`booking-day-${key}`}
                    type="checkbox"
                    className="h-[15px] w-[15px] accent-[#2d5e28]"
                    checked={Boolean(day.open)}
                    onChange={(event) => updateDay(key, { open: event.target.checked })}
                  />
                  <span className="text-[13px] font-medium text-[#1a1a18]">{DAY_LABELS[key]}</span>
                </label>
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    className={tw.time}
                    type="time"
                    aria-label={`${DAY_LABELS[key]} opens`}
                    value={day.from || ""}
                    disabled={!day.open}
                    onChange={(event) => updateDay(key, { from: event.target.value })}
                  />
                  <span className="text-[12px] text-[#8b8a81]">to</span>
                  <input
                    className={tw.time}
                    type="time"
                    aria-label={`${DAY_LABELS[key]} closes`}
                    value={day.to || ""}
                    disabled={!day.open}
                    onChange={(event) => updateDay(key, { to: event.target.value })}
                  />
                  <span className={`${tw.pill} ${backwards ? "border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]" : ""}`}>
                    {!day.open ? "closed" : backwards ? "check the times" : `${hours} hour block`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <p className={tw.note}>
          {openDays.length
            ? `${openDays.length} open ${openDays.length === 1 ? "day" : "days"} a week at ${settings.max_per_day} per day is ${weekly} site ${weekly === 1 ? "measure" : "measures"} a week. The website can never offer more than that.`
            : "No days are open, so the booking page has nothing to offer."}
        </p>
      </div>

      <div className={tw.card}>
        <div className={tw.head}>Limits</div>
        <div className="divide-y divide-[#edf4eb]">
          <label className={tw.row} htmlFor="booking-per-day">
            <span className="min-w-0">
              <span className={tw.rowLabel}>Site measures per open day</span>
              <span className={tw.rowHint}>
                Once a day is full it stops being offered. Measures booked on the calendar here count towards it.
              </span>
            </span>
            <input
              id="booking-per-day" className={tw.num} type="number" min="1" max="20" step="1"
              value={settings.max_per_day}
              onChange={(event) => update({ max_per_day: Number(event.target.value) })}
            />
          </label>

          <label className={tw.row} htmlFor="booking-fee">
            <span className="min-w-0">
              <span className={tw.rowLabel}>Booking fee</span>
              <span className={tw.rowHint}>
                Taken at the time of booking. Nothing is held until it clears, and it comes off any order that follows.
              </span>
            </span>
            <span className="flex flex-none items-center gap-1">
              <span className="text-[12px] text-[#8b8a81]">$</span>
              <input
                id="booking-fee" className={tw.num} type="number" min="0" step="5"
                value={settings.fee_inc_gst}
                onChange={(event) => update({ fee_inc_gst: Number(event.target.value) })}
              />
              <span className="text-[12px] text-[#8b8a81]">inc GST</span>
            </span>
          </label>

          <label className={tw.row} htmlFor="booking-notice">
            <span className="min-w-0">
              <span className={tw.rowLabel}>Shortest notice</span>
              <span className={tw.rowHint}>
                How close to today somebody may book. Days sooner than this are not offered at all.
              </span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-1">
              <input
                id="booking-notice" className={tw.num} type="number" min="0" max="60" step="1"
                value={settings.notice_days}
                onChange={(event) => update({ notice_days: Number(event.target.value) })}
              />
              <span className="text-[12px] text-[#8b8a81]">days</span>
            </span>
          </label>

          <label className={tw.row} htmlFor="booking-horizon">
            <span className="min-w-0">
              <span className={tw.rowLabel}>How far ahead</span>
              <span className={tw.rowHint}>The last day the website will show, so nobody books next March.</span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-1">
              <input
                id="booking-horizon" className={tw.num} type="number" min="1" max="52" step="1"
                value={settings.horizon_weeks}
                onChange={(event) => update({ horizon_weeks: Number(event.target.value) })}
              />
              <span className="text-[12px] text-[#8b8a81]">weeks</span>
            </span>
          </label>

          <label className={tw.row} htmlFor="booking-confirm">
            <span className="min-w-0">
              <span className={tw.rowLabel}>We confirm the time by</span>
              <span className={tw.rowHint}>
                Two jobs, on purpose. It is when we tell them their hour, and it is the cancellation cutoff:
                outside it the fee is refunded, inside it it becomes a credit. Printed on the booking page, the
                cancellation policy and both emails.
              </span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-1">
              <input
                id="booking-confirm" className={tw.num} type="number" min="1" max="336" step="12"
                value={settings.confirm_hours}
                onChange={(event) => update({ confirm_hours: Number(event.target.value) })}
              />
              <span className="text-[12px] text-[#8b8a81]">hours before</span>
            </span>
          </label>
        </div>
      </div>

      <div className={tw.card}>
        <div className={tw.head}>Days we are closed</div>
        <div className="grid gap-2 px-4 py-[14px]">
          {settings.closed_dates.length ? (
            <div className="flex flex-wrap gap-1.5">
              {settings.closed_dates.map((date) => (
                <span key={date} className={tw.pill}>
                  {date}
                  <button
                    type="button"
                    className="text-[13px] leading-none text-[#2d5e28] hover:text-[#111b13]"
                    aria-label={`Open ${date} again`}
                    onClick={() => update({ closed_dates: settings.closed_dates.filter((d) => d !== date) })}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12px] text-[#8b8a81]">Nothing closed. Public holidays go here.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="booking-closed-date"
              className={`${tw.time} w-[170px] max-w-full`}
              type="date"
              aria-label="Add a closed day"
              value={newClosedDate}
              onChange={(event) => setNewClosedDate(event.target.value)}
            />
            <button
              type="button"
              className={tw.btn}
              disabled={!newClosedDate || settings.closed_dates.includes(newClosedDate)}
              onClick={() => {
                update({ closed_dates: [...settings.closed_dates, newClosedDate].sort() });
                setNewClosedDate("");
              }}
            >
              Add closed day
            </button>
          </div>
        </div>
        <p className={tw.note}>
          A closed day disappears from the website even when its weekday is open. Bookings already taken on it stay
          on the calendar and are not cancelled by this.
        </p>
      </div>

      <div className={tw.card}>
        <div className={tw.head}>Where we travel</div>
        <div className="px-4 py-[14px]">
          <label className="grid gap-1.5 text-[12px] font-semibold text-[#5a5a52]" htmlFor="booking-postcodes">
            Postcodes we measure in
            <textarea
              id="booking-postcodes"
              className={tw.textarea}
              value={settings.postcodes}
              placeholder="6000-6199, 6207, 6210"
              onChange={(event) => update({ postcodes: event.target.value })}
            />
          </label>
          <p className="mt-2 mb-0 text-[11px] leading-snug text-[#8b8a81]">
            Ranges and single values. A postcode outside this list is told we do not cover it before they reach the
            payment, rather than after. Leave it blank to accept anywhere.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className={tw.primary} onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save booking settings"}
        </button>
        {message ? <span className="text-[12px] text-[#5a5a52]">{message}</span> : null}
      </div>
    </div>
  );
}
