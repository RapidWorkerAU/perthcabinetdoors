"use client";

import styles from "../contact/contact.module.css";
import Tabs from "./Tabs";

/**
 * FINISH FIRST, THEN COLOUR, AS TILES. The colour picker chosen for the shop on
 * 8 September 2026, and the quote builder's too, because the two are one
 * configurator and a colour chosen one way on one page and another way on the
 * next reads as two different websites.
 *
 * Presentational. The caller decides which colours are on offer:
 *
 *   groups    [{ label, colours: [{ key, name, src, badge? }] }], one per finish
 *   finish    the finish showing
 *   colourKey the chosen colour's key within it
 *
 * A badge sits over a tile that can be chosen but not bought, which on the shop
 * is a colour we have no live price on.
 */
export default function ColourTiles({ groups = [], finish = "", colourKey = "", onFinish, onColour, invalid = false }) {
  const group = groups.find((entry) => entry.label === finish) || null;
  const chosen = group?.colours.find((colour) => colour.key === colourKey) || null;

  return (
    <div className={styles.stepStack}>
      <div>
        <span className={styles.fieldLabel}>Finish</span>
        <Tabs
          options={groups.map((entry) => ({ value: entry.label, label: entry.label }))}
          value={finish}
          cols={Math.min(4, Math.max(1, groups.length))}
          invalid={invalid && !finish}
          onChoose={onFinish}
        />
      </div>
      {group ? (
        <div>
          <span className={styles.fieldLabel}>{group.label} colours</span>
          <div className={styles.colourTiles} role="group" aria-label={`${group.label} colours`}>
            {group.colours.map((colour) => {
              const on = colour.key === colourKey;
              return (
                <button
                  key={colour.key}
                  type="button"
                  title={colour.name}
                  aria-pressed={on}
                  className={on ? `${styles.colourTile} ${styles.colourTileOn}` : styles.colourTile}
                  onClick={() => onColour(colour, group)}
                >
                  <span className={styles.colourTileSwatch}>
                    {colour.src ? <img alt="" src={colour.src} loading="lazy" /> : null}
                    {colour.badge ? <span className={styles.colourTileBadge}>{colour.badge}</span> : null}
                  </span>
                  <span className={styles.colourTileName}>{colour.name}</span>
                </button>
              );
            })}
          </div>
          {chosen ? (
            <p className={styles.colourTileChosen}>
              <strong>{chosen.name}</strong> <span>{group.label}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className={styles.fieldHint}>Pick a finish to see its colours.</p>
      )}
    </div>
  );
}
