"use client";

import styles from "../contact/contact.module.css";
import { ignoreWheel } from "./builder-utils";

/**
 * HOW MANY. A stepper, because the answer is almost always one or two and
 * typing a number for that is more work than pressing a button. The two buttons
 * sit either side of the number on one row, full width like every other answer.
 */
export default function QtyStepper({ value, onChange, hint = "All the same size, colour and drilling. Add a different one as a second item." }) {
  const qty = Math.max(1, Math.round(Number(value) || 1));
  return (
    <>
      <div className={`${styles.field} ${styles.qtyRow}`}>
        <button
          type="button"
          aria-label="One fewer"
          className={styles.qtyStep}
          disabled={qty <= 1}
          onClick={() => onChange(qty - 1)}
        >
          &minus;
        </button>
        <input
          min="1"
          type="number"
          onWheel={ignoreWheel}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" aria-label="One more" className={styles.qtyStep} onClick={() => onChange(qty + 1)}>
          +
        </button>
      </div>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </>
  );
}
