"use client";

import { HOLE_TYPES } from "@/lib/pcd-line-details";
import { HINGE_SIDES, evenMiddles, hingeCount } from "@/lib/pcd-hinges";
import styles from "../contact/contact.module.css";
import Tabs from "./Tabs";
import { ignoreWheel } from "./builder-utils";

// Up to five, because the tallest door we can cut from a board hangs on five.
const HINGE_QTY_OPTIONS = ["2 hinges", "3 hinges", "4 hinges", "5 hinges"];
const ORDINALS = ["2nd", "3rd", "4th"];

/**
 * THE HINGE HOLES, asked the same way on the quote builder and the shop.
 *
 * Whether to bore them, which boring, how many, which side, and where. The
 * bottom hinge is measured up from the bottom edge and the top hinge down from
 * the top edge, because that is how somebody with a tape measures a door, and
 * every screen that reads a position back reads it back the same way. Blank
 * means our standard positions, which is what almost every door wants.
 *
 * `countHint` is a sentence under How many, for a page that knows the height.
 */
export default function HingeFields({ item, onChange, countHint = "" }) {
  const count = hingeCount(item.hingeQty);
  // The cups between the two ends. Shown only once there are two ends to space
  // between, so a door with three hinges and no measurements does not sprout a
  // row of empty boxes nobody has to fill in.
  const middleCupsReady =
    Number(item.height) > 0 && Number(item.hingeFromBottomMm) > 0 && Number(item.hingeFromTopMm) > 0;
  const evenly = evenMiddles({
    height: item.height,
    count,
    fromBottom: item.hingeFromBottomMm,
    fromTop: item.hingeFromTopMm,
  });
  const middleCount = Math.max(0, count - 2);
  const middleCups = Array.from({ length: middleCount }, (unused, index) =>
    item.hingeMiddlesTouched ? item.hingeMiddlesMm?.[index] ?? "" : evenly[index] ?? ""
  );

  return (
    <>
      <label className={item.preDrill ? `${styles.checkCard} ${styles.checkCardOn}` : styles.checkCard}>
        <input
          checked={Boolean(item.preDrill)}
          type="checkbox"
          onChange={(event) =>
            onChange({
              preDrill: event.target.checked,
              hingeQty: event.target.checked ? item.hingeQty : "",
            })
          }
        />
        <span>
          <strong>Bore the hinge holes</strong>
          <span>Leave it off and the door arrives with none.</span>
        </span>
      </label>
      {item.preDrill ? (
        <div className={styles.stepGrid}>
          {/* WHICH BORING. A bare 35mm cup and a Blum Inserta are two machine
              setups: the Inserta adds two 8mm dowels on 45mm centres beside
              the cup. A door bored for one will not take a hinge made for the
              other. */}
          <div className={styles.stepWide}>
            <span className={styles.fieldLabel}>What kind of hole</span>
            <Tabs
              options={HOLE_TYPES}
              value={item.holeType}
              cols={HOLE_TYPES.length}
              onChoose={(value) => onChange({ holeType: value })}
            />
            <p className={styles.fieldHint}>
              Inserta clips in with no screws. A 35mm cup on its own suits most other hinges.
            </p>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>How many</span>
            <Tabs
              options={HINGE_QTY_OPTIONS.map((label) => ({ value: label, label: label.split(" ")[0] }))}
              value={item.hingeQty}
              cols={HINGE_QTY_OPTIONS.length}
              onChoose={(value) =>
                onChange({
                  hingeQty: value,
                  hingeQtyTouched: true,
                  // A different number of cups means the ones in between move.
                  // Anything typed for the old count is not an answer for the
                  // new one.
                  hingeMiddlesMm: [],
                  hingeMiddlesTouched: false,
                })
              }
            />
            {countHint ? <p className={styles.fieldHint}>{countHint}</p> : null}
          </div>

          {/* HANDING. Left or right, and nothing else: a pair is two doors
              drilled as mirror images, so it is two lines. */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Hinge side</span>
            <Tabs
              options={HINGE_SIDES}
              value={item.hingeSide}
              cols={HINGE_SIDES.length}
              onChoose={(value) => onChange({ hingeSide: value })}
            />
            <p className={styles.fieldHint}>Ordering a matched pair? Add it as two lines, one hinged left and one right.</p>
          </div>

          {/* THE POSITIONS. Both blank is the normal answer and means we set
              them, so neither is required and the placeholder says so. */}
          <div className={styles.field}>
            <label>Bottom hinge (mm from bottom)</label>
            <input
              type="number"
              onWheel={ignoreWheel}
              min="1"
              placeholder="Leave blank for our standard"
              value={item.hingeFromBottomMm}
              onChange={(event) => onChange({ hingeFromBottomMm: event.target.value, hingeMiddlesTouched: false })}
            />
          </div>
          <div className={styles.field}>
            <label>Top hinge (mm from top)</label>
            <input
              type="number"
              onWheel={ignoreWheel}
              min="1"
              placeholder="Leave blank for our standard"
              value={item.hingeFromTopMm}
              onChange={(event) => onChange({ hingeFromTopMm: event.target.value, hingeMiddlesTouched: false })}
            />
          </div>

          {middleCups.map((mm, index) => (
            <div className={styles.field} key={"middle-" + index}>
              <label>{ORDINALS[index] || `${index + 2}th`} hinge (mm from bottom)</label>
              <input
                type="number"
                onWheel={ignoreWheel}
                min="1"
                value={mm}
                disabled={!middleCupsReady}
                placeholder={middleCupsReady ? "" : "Fill in the two above first"}
                onChange={(event) => {
                  const next = middleCups.slice();
                  next[index] = event.target.value;
                  onChange({ hingeMiddlesMm: next, hingeMiddlesTouched: true });
                }}
              />
            </div>
          ))}

          {middleCups.length ? (
            <p className={styles.stepWide} style={{ margin: 0, fontSize: 12, color: "#7a766c" }}>
              {!middleCupsReady
                ? "Give us the bottom and the top and we will space the rest evenly."
                : item.hingeMiddlesTouched
                  ? "Set by hand, so these will not move when the others do."
                  : "Spaced evenly between the bottom and the top. Type over one to set it yourself."}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
