"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CabinetElevation from "./CabinetElevation";
import { removeEntry, setEntryQty, useQuoteList } from "@/lib/pcd-quote-list";
import styles from "./quote-list-drawer.module.css";

// localStorage covers closing the tab. It does not cover measuring the kitchen
// on a phone and finishing on a laptop, which is what this is for: the list is
// stored against a short code and the link brings it back anywhere.
function SaveLink({ entries }) {
  const [state, setState] = useState({ status: "idle", url: "", error: "" });
  const [copied, setCopied] = useState(false);

  async function save() {
    setState({ status: "saving", url: "", error: "" });
    try {
      const response = await fetch("/api/quote-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save your list.");
      const url = `${window.location.origin}/request-quote?list=${payload.code}`;
      setState({ status: "saved", url, error: "" });
    } catch (error) {
      setState({ status: "idle", url: "", error: error.message || "Could not save your list." });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked, the input below is selectable, so there is still a
      // way to get the link.
    }
  }

  if (state.status === "saved") {
    return (
      <div className={styles.saveBox}>
        <b>Your list is saved</b>
        <p>Open this link on any device to pick up where you left off.</p>
        <div className={styles.saveRow}>
          <input readOnly value={state.url} onFocus={(event) => event.target.select()} aria-label="Link to your saved list" />
          <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" className={styles.saveButton} onClick={save} disabled={state.status === "saving"}>
        {state.status === "saving" ? "Saving…" : "Save my list & get a link"}
      </button>
      {state.error ? <p className={styles.saveError}>{state.error}</p> : null}
    </>
  );
}

// The list, reviewable without leaving the page you are on. Opening it from the
// configurator must not cost you your place in it - that was the whole point of
// choosing a drawer over a separate page.
export default function QuoteListDrawer({ open, onClose }) {
  const entries = useQuoteList();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement;
    panelRef.current?.querySelector("button, a, input, select, textarea")?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalPieces = entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.qty) || 1), 0);


  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Your quote list" ref={panelRef}>
        <div className={styles.head}>
          <div>
            <h2>Your list</h2>
            <span>
              {entries.length ? `${totalPieces} item${totalPieces === 1 ? "" : "s"}` : "Nothing added yet"}
            </span>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close your list">
            &times;
          </button>
        </div>

        <div className={styles.items}>
          {entries.length === 0 ? (
            <p className={styles.empty}>
              Build a door, drawer front or panel in the IKEA &amp; Kaboodle tool and it will appear here.
              Anything that tool does not cover, add on the quote request page.
            </p>
          ) : (
            entries.map((entry) => (
              <div className={styles.item} key={entry.id}>
                <span className={styles.itemFigure}>
                  {entry.kind === "custom" ? (
                    <span className={styles.customMark} aria-hidden="true">
                      +
                    </span>
                  ) : (
                    <CabinetElevation
                      cabinet={entry.cabinet}
                      pieces={entry.pieces}
                      arrangement={entry.arrangement}
                      className={styles.itemSvg}
                    />
                  )}
                </span>
                <span className={styles.itemBody}>
                  <strong>{entry.title}</strong>
                  <em>{entry.detail}</em>
                  {entry.kind === "custom" ? <span className={styles.quoteFlag}>Quote required</span> : null}
                </span>
                <span className={styles.itemSide}>
                  <span className={styles.qty}>
                    <button
                      type="button"
                      onClick={() => setEntryQty(entry.id, (Number(entry.qty) || 1) - 1)}
                      aria-label={`Fewer ${entry.title}`}
                    >
                      &minus;
                    </button>
                    <b>{entry.qty}</b>
                    <button
                      type="button"
                      onClick={() => setEntryQty(entry.id, (Number(entry.qty) || 1) + 1)}
                      aria-label={`More ${entry.title}`}
                    >
                      +
                    </button>
                  </span>
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => removeEntry(entry.id)}
                    aria-label={`Remove ${entry.title}`}
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        <div className={styles.foot}>
          {/* No custom-item form here either: custom cabinets and non-standard
              panels are added on the quote request page, which already has a
              full line-item builder. One place to manage them, not three. */}
          <Link
            className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonFull}`}
            href="/request-quote"
            onClick={onClose}
          >
            Review &amp; Submit Quote Request
          </Link>

          {entries.length ? <SaveLink entries={entries} /> : null}

        </div>
      </aside>
    </>
  );
}
