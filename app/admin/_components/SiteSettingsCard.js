"use client";

// SHOP AND SITE MESSAGES, in Settings.
//
// The three things about the website that used to need a deploy: whether the
// online shop is open, the lead time we quote for a shop order, and the banner
// and notices customers see. Saved as one row; the public site reads it on
// every page, so a save is live at the next page load. See
// lib/pcd-site-settings.js.

import { useEffect, useMemo, useState } from "react";
import AdminLoading from "@/components/admin/AdminLoading";
import {
  DEFAULT_SITE_SETTINGS,
  SITE_MESSAGE_MAX,
  SITE_MESSAGE_PLACEMENTS,
  leadTimeRangeWords,
  messageStatus,
  normalizeSiteSettings,
} from "../../../lib/pcd-site-settings";

const tw = {
  card: "overflow-hidden rounded-[8px] border border-[#dbd8cc] bg-white mb-4",
  head: "border-b border-[#edf4eb] bg-[#f5f8f4] px-4 py-[10px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5a5a52] flex items-center justify-between gap-3",
  body: "px-4 py-4",
  label: "block text-[13px] font-medium text-[#1a1a18]",
  hint: "mt-[2px] block text-[11px] leading-snug text-[#8b8a81]",
  num: "h-[32px] w-[88px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-right font-mono text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  date: "h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-2 text-[12px] text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  area: "min-h-[64px] w-full rounded-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#1a1a18] outline-none focus:border-[#6b9e61]",
  btn: "h-[32px] rounded-[6px] border border-[#dbd8cc] bg-white px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f5f8f4] disabled:opacity-50",
  primary: "h-[36px] rounded-[6px] border border-[#1c2b1e] bg-[#1c2b1e] px-4 text-[13px] font-medium text-white hover:bg-[#2d3f2f] disabled:opacity-50",
  note: "m-0 border-t border-[#edf4eb] bg-[#fffdf0] px-4 py-[11px] text-[12px] leading-[1.5] text-[#8a6d0b]",
  pillOn: "inline-flex items-center rounded-full border border-[#a8c5a0] bg-[#edf4eb] px-[9px] py-[2px] text-[11px] normal-case tracking-normal text-[#2d5e28]",
  pillWait: "inline-flex items-center rounded-full border border-[#e8d68f] bg-[#fffdf0] px-[9px] py-[2px] text-[11px] normal-case tracking-normal text-[#8a6d0b]",
  pillOff: "inline-flex items-center rounded-full border border-[#dbd8cc] bg-[#fbfbf8] px-[9px] py-[2px] text-[11px] normal-case tracking-normal text-[#8b8a81]",
  segOn: "h-[34px] px-4 text-[12px] font-semibold bg-[#1c2b1e] text-white",
  segOff: "h-[34px] px-4 text-[12px] font-medium bg-white text-[#5a5a52] hover:bg-[#f5f8f4]",
};

const STATUS = {
  showing: ["Showing now", tw.pillOn],
  scheduled: ["Scheduled", tw.pillWait],
  ended: ["Ended", tw.pillOff],
  off: ["Off", tw.pillOff],
};

const deepCopy = (value) => JSON.parse(JSON.stringify(value));

export default function SiteSettingsCard() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/site-settings", { cache: "no-store" });
        const payload = await res.json();
        if (cancelled) return;
        if (!payload.ok) throw new Error(payload.error || "Could not load the website settings.");
        setSettings(deepCopy(payload.settings));
        setSaved(deepCopy(payload.settings));
        setUpdatedAt(payload.updatedAt);
        setLoadError(payload.error || "");
      } catch (error) {
        if (cancelled) return;
        setLoadError(error?.message || "Could not load the website settings.");
        setSettings(normalizeSiteSettings(DEFAULT_SITE_SETTINGS));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changed = useMemo(
    () => Boolean(settings && saved && JSON.stringify(normalizeSiteSettings(settings)) !== JSON.stringify(saved)),
    [settings, saved]
  );

  function set(patch) {
    setSettings((current) => ({ ...current, ...patch }));
    setMessage("");
  }

  function setMessageField(key, field, value) {
    setSettings((current) => ({
      ...current,
      messages: { ...current.messages, [key]: { ...current.messages[key], [field]: value } },
    }));
    setMessage("");
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Could not save the website settings.");
      setSettings(deepCopy(payload.settings));
      setSaved(deepCopy(payload.settings));
      setUpdatedAt(payload.updatedAt);
      setLoadError("");
      setMessage(
        payload.settings.shop_open
          ? "Saved. The shop is open, and the website shows these settings from the next page load."
          : "Saved. The shop is closed to the public, and the website shows these settings from the next page load."
      );
    } catch (error) {
      setMessage(error?.message || "Could not save the website settings.");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <AdminLoading steps={["Reading the website settings", "Almost there"]} label="Loading the website settings" />;
  }

  const open = settings.shop_open === true;
  const days = settings.lead_time_days;
  const thermoDays = settings.thermo_lead_time_days;

  return (
    <div>
      {loadError ? (
        <div className={tw.card}>
          <p className="m-0 px-4 py-3 text-[13px] text-[#991b1b]">{loadError}</p>
        </div>
      ) : null}

      {/* THE SHOP SWITCH. */}
      <div className={tw.card}>
        <div className={tw.head}>
          <span>Online shop</span>
          <span className={saved?.shop_open ? tw.pillOn : tw.pillOff}>{saved?.shop_open ? "Open" : "Closed"}</span>
        </div>
        <div className={tw.body}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-[6px] border border-[#dbd8cc]" role="group" aria-label="Online shop">
              <button type="button" aria-pressed={open} className={open ? tw.segOn : tw.segOff} onClick={() => set({ shop_open: true })}>
                Open to the public
              </button>
              <button
                type="button"
                aria-pressed={!open}
                className={`${!open ? tw.segOn : tw.segOff} border-l border-[#dbd8cc]`}
                onClick={() => set({ shop_open: false })}
              >
                Closed
              </button>
            </div>
            <a className={tw.btn + " inline-flex items-center"} href="/products" target="_blank" rel="noreferrer">
              Preview the shop
            </a>
          </div>
          <p className={tw.hint + " mt-3 max-w-[640px]"}>
            {open
              ? "Anyone can see the shop, price a door and pay for it. The Shop link is in the website menu and the home page offers it."
              : "Customers see a page saying the shop is closed, with the way to a quote, and anything in their cart can be moved to a quote list. You still see the whole shop while you are signed in, so you can check it before opening it."}
          </p>
        </div>
        {open && !saved?.shop_open ? (
          <p className={tw.note}>Saving opens the shop to the public. Customers can pay for orders from the next page load.</p>
        ) : null}
      </div>

      {/* THE LEAD TIME. */}
      <div className={tw.card}>
        <div className={tw.head}>
          <span>Shop lead times</span>
        </div>
        <div className={tw.body}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-wrap items-center justify-between gap-3 max-w-[560px]">
              <span>
                <span className={tw.label}>Decorative board, working days</span>
                <span className={tw.hint}>Cut and edged by us. From payment to going out the door.</span>
              </span>
              <input
                className={tw.num}
                type="number"
                min="1"
                max="120"
                value={days}
                onChange={(event) => set({ lead_time_days: event.target.value })}
              />
            </label>
            <label className="flex flex-wrap items-center justify-between gap-3 max-w-[560px]">
              <span>
                <span className={tw.label}>Thermolaminate, working days</span>
                <span className={tw.hint}>Pressed to order by Polytec, so often longer.</span>
              </span>
              <input
                className={tw.num}
                type="number"
                min="1"
                max="120"
                value={thermoDays}
                onChange={(event) => set({ thermo_lead_time_days: event.target.value })}
              />
            </label>
          </div>
          <p className={tw.hint + " mt-3 max-w-[640px]"}>
            A product page says the lead time for the board chosen. The cart, the order confirmation and the order email say the
            longer of the two when the order has any thermolaminate in it. The home page and the shop page say &ldquo;
            {leadTimeRangeWords({ lead_time_days: days, thermo_lead_time_days: thermoDays })}&rdquo;. Delivery is two to three days
            on top.
          </p>
        </div>
      </div>

      {/* THE MESSAGES. */}
      <div className={tw.card}>
        <div className={tw.head}>
          <span>Site messages</span>
        </div>
        <p className="m-0 border-b border-[#f3f1ea] px-4 py-3 text-[12px] leading-[1.5] text-[#5a5a52]">
          Type a message to show it. Leave a message empty to hide it. Dates are optional and run in Perth time: a message
          shows from the start of its first day to the end of its last.
        </p>
        {SITE_MESSAGE_PLACEMENTS.map((placement) => {
          const entry = settings.messages?.[placement.key] || { text: "", starts_on: "", ends_on: "" };
          const [statusLabel, statusClass] = STATUS[messageStatus(normalizeSiteSettings({ messages: { [placement.key]: entry } }).messages[placement.key])];
          return (
            <div key={placement.key} className="border-b border-[#f3f1ea] px-4 py-4 last:border-b-0">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <span>
                  <span className={tw.label}>{placement.label}</span>
                  <span className={tw.hint}>{placement.where}</span>
                </span>
                <span className={statusClass}>{statusLabel}</span>
              </div>
              <textarea
                className={tw.area}
                maxLength={SITE_MESSAGE_MAX}
                value={entry.text}
                placeholder="Empty, so nothing shows."
                onChange={(event) => setMessageField(placement.key, "text", event.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[#5a5a52]">
                <label className="flex items-center gap-2">
                  From
                  <input
                    className={tw.date}
                    type="date"
                    value={entry.starts_on || ""}
                    onChange={(event) => setMessageField(placement.key, "starts_on", event.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2">
                  Until
                  <input
                    className={tw.date}
                    type="date"
                    value={entry.ends_on || ""}
                    onChange={(event) => setMessageField(placement.key, "ends_on", event.target.value)}
                  />
                </label>
                <span className="text-[11px] text-[#8b8a81]">
                  {String(entry.text || "").length}/{SITE_MESSAGE_MAX}
                </span>
                {entry.text || entry.starts_on || entry.ends_on ? (
                  <button
                    type="button"
                    className={tw.btn}
                    onClick={() => {
                      setMessageField(placement.key, "text", "");
                      setMessageField(placement.key, "starts_on", "");
                      setMessageField(placement.key, "ends_on", "");
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={tw.primary} disabled={busy || !changed} onClick={save}>
          {busy ? "Saving..." : "Save website settings"}
        </button>
        {message ? <span className="text-[13px] text-[#5a5a52]">{message}</span> : null}
        {!message && updatedAt ? (
          <span className="text-[12px] text-[#8b8a81]">Last saved {new Date(updatedAt).toLocaleString("en-AU")}</span>
        ) : null}
      </div>
    </div>
  );
}
