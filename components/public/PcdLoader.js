"use client";

// The loading state for the public tools: a cabinet that assembles itself.
//
// It used to be a line of grey text in the middle of an empty page ("Starting
// your design…"), which on a slow connection reads as a broken page rather than
// a working one.
//
// ── WHY A CABINET, AND WHY IT DOES NOT FLICKER ───────────────────────────────
// The first attempt ran a bright gradient band through the letters "PCD" on a
// loop. Two things were wrong with it: the band had hard edges so it hit each
// letter as a pop rather than a glide, and the mark was redrawn on every tick
// of the percentage, which restarted the sweep eleven times a second.
//
// This has no loop at all. Each part of the cabinet is drawn once and fades in
// when the percentage passes its threshold, over 700ms. Nothing repeats,
// nothing reverses, and a tick only ever toggles one class. The only thing that
// changes on most ticks is the width of the progress bar.
//
// Parts are drawn in the same colours as the planner's own elevations (see
// CabinetElevation and the .pcdElev rules), so a loading screen and a cabinet
// drawing look like they came from the same place.
//
// ── ABOUT THE PERCENTAGE ─────────────────────────────────────────────────────
// Pass `progress` when there is something real to measure and it is used
// verbatim. Without one it eases toward 92 and stops: the number measures
// waiting, not work, so it never claims to be finished. The loader unmounts the
// moment the real thing is ready, and that is what done looks like.
//
// `steps` are tied to the number rather than rotated on a timer, so the words
// and the bar always agree.

import { useEffect, useRef, useState } from "react";

// The component carries its own styles, so it works anywhere it is imported.
// The admin does not load the site stylesheet, and a second copy of the rules
// would drift the first time either was touched.
import "./pcd-loader.css";

const DEFAULT_STEPS = ["Getting things ready", "Almost there"];

// Where the pseudo-progress settles. Short of 100 on purpose.
const CEILING = 92;

// When each part appears. Spread so the whole cabinet is built by the time the
// crawl flattens out, rather than leaving the doors permanently missing.
const PARTS = [
  { key: "carcass", at: 4 },
  { key: "shelf", at: 20 },
  { key: "kick", at: 34 },
  { key: "doorLeft", at: 50 },
  { key: "doorRight", at: 64 },
  { key: "swingLeft", at: 76 },
  { key: "swingRight", at: 84 },
];

export default function PcdLoader({
  steps = DEFAULT_STEPS,
  variant = "page",
  progress = null,
  label = "Loading",
  // "light" on the public site, "dark" in the admin design tool. Only the
  // colours change: the animation, the thresholds and the timing are shared, so
  // the two cannot fall out of step.
  theme = "light",
}) {
  const measured = typeof progress === "number";
  const [eased, setEased] = useState(measured ? progress : 0);
  const timer = useRef(null);

  useEffect(() => {
    if (measured) {
      setEased(Math.max(0, Math.min(100, progress)));
      return undefined;
    }

    // Someone who has asked for less motion gets the finished cabinet and a
    // filled bar straight away, with no crawl and no fades (that part is CSS).
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setEased(CEILING);
      return undefined;
    }

    // Decelerating: quick at first then creeping, which is what a real transfer
    // feels like and stops the bar from looking stuck at a constant rate.
    const tick = () => {
      setEased((current) => current + (CEILING - current) * 0.06);
      timer.current = window.setTimeout(tick, 110);
    };
    timer.current = window.setTimeout(tick, 110);
    return () => window.clearTimeout(timer.current);
  }, [measured, progress]);

  const pct = Math.round(eased);
  const list = steps.length ? steps : DEFAULT_STEPS;
  // Tie the words to the bar so they can never disagree.
  const index = Math.min(list.length - 1, Math.floor((pct / 100) * list.length));
  const shown = (key) => (pct >= PARTS.find((p) => p.key === key).at ? " is-on" : "");

  return (
    <div
      className={`pcdLoader pcdLoader-${variant}${theme === "dark" ? " pcdLoader--dark" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="pcdLoaderInner">
        {variant === "page" ? (
          <span className="pcdLoaderMark" aria-hidden="true">PCD</span>
        ) : null}

        <svg className="pcdLoaderBuild" viewBox="0 0 160 134" role="presentation" aria-hidden="true">
          <g className={`pcdBuildPart pcdBuildRise${shown("carcass")}`}>
            <rect className="pcdBuildCarcass" x="8" y="8" width="144" height="98" rx="2" />
          </g>
          <g className={`pcdBuildPart${shown("shelf")}`}>
            <line className="pcdBuildDetail" x1="14" y1="57" x2="146" y2="57" />
          </g>
          <g className={`pcdBuildPart pcdBuildRise${shown("kick")}`}>
            <rect className="pcdBuildKick" x="8" y="112" width="144" height="10" rx="1" />
          </g>
          <g className={`pcdBuildPart${shown("doorLeft")}`}>
            <rect className="pcdBuildFront" x="12" y="12" width="66" height="90" rx="1" />
          </g>
          <g className={`pcdBuildPart${shown("doorRight")}`}>
            <rect className="pcdBuildFront" x="82" y="12" width="66" height="90" rx="1" />
          </g>
          <g className={`pcdBuildPart${shown("swingLeft")}`}>
            <path className="pcdBuildSwing" d="M12,12 L78,57 M12,102 L78,57" />
          </g>
          <g className={`pcdBuildPart${shown("swingRight")}`}>
            <path className="pcdBuildSwing" d="M148,12 L82,57 M148,102 L82,57" />
          </g>
        </svg>

        <span className="pcdLoaderTrack" aria-hidden="true">
          <span className="pcdLoaderFill" style={{ width: `${pct}%` }} />
        </span>

        <span className="pcdLoaderFoot">
          <span className="pcdLoaderStep">{list[index]}</span>
          <span className="pcdLoaderPct">{pct}%</span>
        </span>
      </div>
    </div>
  );
}
