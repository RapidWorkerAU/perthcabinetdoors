"use client";

import { BANDED_EDGES } from "@/lib/pcd-line-details";
import styles from "../contact/contact.module.css";

/**
 * WHICH EDGES GET TAPE, one button an edge, because "three edges" does not tell
 * a bench which three.
 *
 * All four is our standard, so a line starts there and somebody only touches it
 * to leave an edge raw. Null until they do, because "not asked" and "none of the
 * four" are different and only one is an instruction.
 *
 * Only ever offered on decorative board: thermolaminate is wrapped and compact
 * laminate is solid through, so neither has an edge to tape.
 */
export default function BandedEdgesField({ value, onChange, hint = null }) {
  const chosen = Array.isArray(value) ? value : BANDED_EDGES;
  return (
    <div className={styles.field}>
      <div className={styles.edgeToggles}>
        {BANDED_EDGES.map((edge) => {
          const on = chosen.includes(edge);
          return (
            <button
              key={edge}
              type="button"
              aria-pressed={on}
              className={on ? `${styles.edgeToggle} ${styles.edgeToggleOn}` : styles.edgeToggle}
              onClick={() => {
                const next = on ? chosen.filter((e) => e !== edge) : [...chosen, edge];
                onChange(BANDED_EDGES.filter((e) => next.includes(e)));
              }}
            >
              {edge}
            </button>
          );
        })}
      </div>
      <p className={styles.fieldHint}>
        {hint ||
          "All four unless you say otherwise. Turn one off and we leave that edge raw, and the drawing beside this shows it."}
      </p>
    </div>
  );
}
