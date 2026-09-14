"use client";

import styles from "../contact/contact.module.css";
import { ignoreWheel } from "./builder-utils";

// The range beside a size label. Quiet, because it is a note about the box
// rather than a warning about what is in it.
const sizeRangeStyle = {
  marginLeft: 8,
  fontSize: 11.5,
  fontWeight: 400,
  color: "#7a766c",
  letterSpacing: 0,
  textTransform: "none",
};

/**
 * HEIGHT AND WIDTH, height first, the same way round as every other screen and
 * every cut list we print.
 *
 * WHAT WE CAN MAKE, SAID BEFORE IT IS TYPED. The range sits beside the label so
 * somebody sees it on the way in, and the message under the box only appears
 * once a size is actually outside it. A board we have not set limits for shows
 * neither, rather than a made up range.
 *
 * `limit` is { minHeightMm, maxHeightMm, minWidthMm, maxWidthMm } or null,
 * `range` the words beside each label, `errors` the sentence under each box and
 * `invalid` which boxes a failed save marked.
 */
export default function SizeFields({ item, onChange, limit = null, range = null, errors = {}, invalid = {}, required = null }) {
  const box = (key) =>
    [invalid[key] || errors[key] ? styles.fieldInputError : ""].filter(Boolean).join(" ");
  return (
    <div className={styles.stepGrid}>
      <div className={styles.field}>
        <label>
          Height (mm)
          {required}
          {range?.height ? <span style={sizeRangeStyle}>{range.height}</span> : null}
        </label>
        <input
          className={box("height")}
          min={limit ? limit.minHeightMm : 1}
          max={limit ? limit.maxHeightMm : undefined}
          placeholder="700"
          type="number"
          inputMode="numeric"
          onWheel={ignoreWheel}
          value={item.height}
          onChange={(event) => onChange({ height: event.target.value })}
        />
        {errors.height ? <span className={styles.fieldError}>{errors.height}</span> : null}
      </div>
      <div className={styles.field}>
        <label>
          Width (mm)
          {required}
          {range?.width ? <span style={sizeRangeStyle}>{range.width}</span> : null}
        </label>
        <input
          className={box("width")}
          min={limit ? limit.minWidthMm : 1}
          max={limit ? limit.maxWidthMm : undefined}
          placeholder="400"
          type="number"
          inputMode="numeric"
          onWheel={ignoreWheel}
          value={item.width}
          onChange={(event) => onChange({ width: event.target.value })}
        />
        {errors.width ? <span className={styles.fieldError}>{errors.width}</span> : null}
      </div>
    </div>
  );
}
