"use client";

// "Show colours" paints panels from the tile image on each colour-library row.
// A row with no image cannot be painted, so those panels keep their flat
// cabinet colour and nothing anywhere says why.
//
// That silence is the whole bug this exists to kill. Draw a job in a colour
// that happens to have no tile and the toggle looks dead: press it and almost
// nothing moves, except the one cabinet in a colour that DOES have a tile,
// which then reads as the wrong colour next to everything left flat. Naming
// the colours turns "the site is broken" into "that colour needs a picture",
// which is an upload on the Board Library screen.
//
// One definition, used by both the desktop and the mobile shell.

import { useEffect, useState } from "react";
import Link from "next/link";
import { unresolvedColourSelections } from "../../../../lib/pcd-colour-images";
import styles from "../design.module.css";

export default function MissingTileNotice({ show, colourImages, items, roomId, inline = false }) {
  const [dismissed, setDismissed] = useState(false);
  // A different room is a fresh question, so a dismissal only silences the
  // list somebody actually read.
  useEffect(() => { setDismissed(false); }, [roomId]);

  if (!show || dismissed) return null;
  const missing = unresolvedColourSelections(colourImages, items);
  if (!missing.length) return null;

  const one = missing.length === 1;
  return (
    <div
      className={styles.missingTileBanner}
      style={inline ? { position: "static", transform: "none", maxWidth: "none", margin: "6px 8px" } : undefined}
    >
      <span>
        {one ? "This colour has" : "These colours have"} no tile image yet, so {one ? "it stays" : "they stay"} in the
        flat cabinet colour: {missing.map((c) => c.label).join(", ")}. Add a tile on{" "}
        <Link href="/admin/options" style={{ color: "inherit", fontWeight: 700 }}>Board Library</Link>.
      </span>
      <button type="button" onClick={() => setDismissed(true)}>Dismiss</button>
    </div>
  );
}
