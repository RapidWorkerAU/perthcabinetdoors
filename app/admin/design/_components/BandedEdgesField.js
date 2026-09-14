"use client";

// WHICH EDGES OF A DECORATIVE BOARD PIECE GET TAPE.
//
// One control, used for a cabinet's fronts, for each finishing panel and for a
// standalone panel or scribe, so the question looks and behaves the same
// wherever it is asked. Nothing chosen yet shows all four, our standard, and
// what is shown is what is saved: the first click stores a real answer.
//
// Only offered on decorative board. Thermolaminate is wrapped and compact
// laminate is solid through, so neither has edges to tape; the caller decides
// whether to show this at all from the board the piece is cut from.

import { BANDED_EDGES, bandedEdgeList, bandedEdgesText } from "../../../../lib/pcd-line-details";
import styles from "../design.module.css";

export default function BandedEdgesField({ label = "Banded edges", value, onChange, disabled = false }) {
  const current = Array.isArray(value) ? bandedEdgeList(value) : [...BANDED_EDGES];
  const toggle = (edge) => {
    const on = current.includes(edge);
    onChange(BANDED_EDGES.filter((e) => (e === edge ? !on : current.includes(e))));
  };
  return (
    <div className={styles.fieldLabel}>
      <span>{label}</span>
      <div className={styles.edgeToggles} role="group" aria-label={label}>
        {BANDED_EDGES.map((edge) => {
          const on = current.includes(edge);
          return (
            <button
              key={edge}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              className={on ? `${styles.edgeToggle} ${styles.edgeToggleOn}` : styles.edgeToggle}
              onClick={() => toggle(edge)}
            >
              {edge}
            </button>
          );
        })}
      </div>
      <span className={styles.edgeTogglesNote}>{bandedEdgesText(current)}</span>
    </div>
  );
}
