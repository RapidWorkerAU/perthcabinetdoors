import Link from "next/link";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import styles from "./public-cross-link.module.css";

// "YOU MIGHT BE ON THE WRONG PAGE", SAID WHERE THEY ALREADY ARE.
//
// Somebody who guesses wrong about which of the three paths they want should
// find the way across on the page they are standing on, not by pressing back
// and starting again. That is what this strip is: one question, the answer, and
// the door.
//
// WRITTEN AS A QUESTION AND AN ANSWER on purpose, and not only for the reader.
// /request-quote has no readable content on it at all, because everything below
// the header is a form, so there is nothing on it for a search engine or an
// assistant to understand. Two true question and answer pairs give it some.
//
// THE SHOP ONE HIDES ITSELF while SHOP_ENABLED is false, because /products is a
// 404 until the shop opens. Pass shop to get that behaviour; everything else
// always renders.

// `bare` drops the strip's own border and ground, for when it is grouped inside
// a container that already draws those. See .stripBare.
//
// `onDark` repaints the type and the buttons for the site's dark green band.
// Every colour it uses is measured against that ground rather than chosen by
// eye; the ratios are written out beside the rules. See .stripDark.
export default function PublicCrossLink({
  question,
  answer,
  cta,
  href,
  shop = false,
  bare = false,
  onDark = false,
  className = "",
}) {
  if (shop && !SHOP_ENABLED) return null;

  const classes = [
    styles.strip,
    shop && styles.stripShop,
    bare && styles.stripBare,
    onDark && styles.stripDark,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className={styles.body}>
        <strong>{question}</strong>
        <p>{answer}</p>
      </div>
      <Link className={styles.button} href={href}>
        {cta}
      </Link>
    </div>
  );
}
