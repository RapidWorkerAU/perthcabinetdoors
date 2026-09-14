"use client";

import styles from "../contact/contact.module.css";

/**
 * A row of segmented buttons, which is what this site uses wherever the answers
 * fit on the screen at once.
 *
 * A dropdown hides four options behind a click and gives no clue how many are
 * behind it. Three squares are the whole question, answered in one press. The
 * dropdowns that remain are the ones with a genuinely long list behind them: a
 * hardware catalogue, forty cabinet brands.
 *
 * Shared by the quote builder and the shop's product pages, because the two are
 * one configurator: the same question asked the same way on both.
 */
export default function Tabs({ options, value, cols, onChoose, invalid = false }) {
  const list = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  return (
    <div
      className={invalid ? `${styles.tabs} ${styles.tabsInvalid}` : styles.tabs}
      style={{ "--tabCols": cols || Math.min(3, list.length) }}
      role="group"
    >
      {list.map((option) => {
        const on = String(value) === String(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={option.disabled || false}
            className={on ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            onClick={() => onChoose(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
