"use client";

// THE DOOR SOMEBODY IS DESCRIBING, DRAWN AS THEY DESCRIBE IT.
//
// The drawing is built in lib/pcd-door-drawing.js, which is pure and returns
// markup. This is the wrapper that puts it on a screen and gives it the one
// control it needs: which face you are looking at.
//
// ── WHY THERE IS A TOGGLE AT ALL ─────────────────────────────────────────────
//
// The routed profile is on the FRONT and the hinge cups are bored into the
// BACK. A single picture showing both is a door that does not exist, and
// somebody literal reads a drawing as a promise. The side flips too: a door
// hinged on the left as you stand at the cupboard has its cups down the RIGHT
// once it is turned over on the bench.
//
// The note under it says which way round you are looking, in words, because
// working that out from a picture is exactly the thing people get wrong.

import { useState } from "react";
import { cupList, doorSvgMarkup, faceNote } from "@/lib/pcd-door-drawing";

const FACES = [
  ["front", "Front"],
  ["back", "Back"],
];

export default function DoorDrawing({
  heightMm,
  widthMm,
  material = "",
  colourTile = "",
  colourName = "",
  profile = "",
  bandedEdges = null,
  hingeHoles = false,
  hingeCount = 0,
  cupsMm = [],
  hingeSide = "",
  holeType = "",
  // The photograph of the routed face, shown beside the drawing rather than
  // instead of it. The drawing has this door's size, colour, banding and cups;
  // the photograph has the finish and the depth of the routing, and it is right
  // for all ninety seven including the thirty six cathedral doors the drawing
  // holds back. See the top of lib/pcd-door-drawing.js.
  profileImage = "",
  box = 380,
  styles = {},
  id = "door",
}) {
  const [face, setFace] = useState("front");

  // Only a drilled door has two faces worth looking at. On everything else the
  // back is the same board with nothing on it, so offering the toggle would be
  // offering a second view of the same picture.
  const drilled = Boolean(hingeHoles) && cupList({ cupsMm, hingeCount, heightMm }).length >= 2;
  const shown = drilled ? face : "front";

  const markup = doorSvgMarkup({
    heightMm,
    widthMm,
    face: shown,
    material,
    colourTile,
    colourName,
    profile,
    bandedEdges,
    hingeHoles,
    hingeCount,
    cupsMm,
    hingeSide,
    holeType,
    box,
    id,
  });

  return (
    <figure className={styles.doorDrawing}>
      {drilled ? (
        <div className={styles.doorFaces} role="group" aria-label="Which face of the door">
          {FACES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={shown === key}
              className={shown === key ? `${styles.doorFace} ${styles.doorFaceOn}` : styles.doorFace}
              onClick={() => setFace(key)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* The markup is built by our own function from our own numbers. There is
          no user text in it that is not escaped on the way in. */}
      <div className={styles.doorCanvas} dangerouslySetInnerHTML={{ __html: markup }} />

      {profile && shown === "front" ? (
        <div className={styles.doorProfile}>
          {profileImage ? (
            <img alt={`${profile} profile`} className={styles.doorProfileShot} src={profileImage} />
          ) : null}
          <div>
            <strong>{profile}</strong>
            <span>The routed face, photographed on a sample door. The drawing above is yours: your size, your colour.</span>
          </div>
        </div>
      ) : null}

      <figcaption className={styles.doorNote}>
        {faceNote({ face: shown, hingeSide, drilled, material, profile })}
      </figcaption>
    </figure>
  );
}
