import Link from "next/link";
import { SHOP_ENABLED } from "@/lib/pcd-site-flags";
import styles from "./public-paths.module.css";

// THE THREE WAYS TO BUY FROM US, WRITTEN ONCE.
//
// ── WHY THIS IS A COMPONENT ──────────────────────────────────────────────────
//
// Every service page closes by asking the reader to do one of three things: buy
// a flat front outright, put anything at all on a quote list, or just ask us a
// question. Those three are a fact about the business, not about the page, so
// they are described here and nowhere else. Three pages carrying three hand
// written versions of the same three choices is how they drift apart, and a
// visitor who reads two of them ends up with two different accounts of how to
// buy from us.
//
// ── WHAT A PAGE MAY CHANGE, AND WHAT IT MAY NOT ──────────────────────────────
//
// A page chooses WHICH paths it offers and in WHAT ORDER, and writes the
// heading, the lead and the note around the block. It does not get to reword a
// card. Anything page-specific, like the 3D planner on /bespoke or the $100
// measure, belongs in the lead or the note where it can be said properly, not
// squeezed into a card that also has to make sense on four other pages.
//
// ── THE SHOP CAN BE SWITCHED OFF ─────────────────────────────────────────────
//
// SHOP_ENABLED is false on the live site, and while it is, /products is a 404.
// So the shop card is dropped rather than rendered as a link to a page that is
// not there, and the grid narrows to the paths that are actually offered. A
// page asking for the shop path while the shop is closed gets two cards, not a
// gap and not a dead link.

const PATHS = {
  shop: {
    kicker: "Buy it now",
    kickerClass: styles.kickerShop,
    buttonClass: styles.buttonShop,
    title: "Plain flat fronts",
    body:
      "Flat doors, drawer fronts and panels in Polytec decorative board are priced online as you enter the " +
      "size. Pay by card and they are made in Perth and delivered at a flat metro rate.",
    cta: "Go to the shop",
    href: "/products",
  },
  quote: {
    kicker: "Get it priced",
    kickerClass: styles.kickerQuote,
    buttonClass: styles.buttonQuote,
    title: "Everything else",
    body:
      "Profiled and thermolaminated fronts, benchtops, new cabinets and installation are priced by hand. " +
      "Build a list and we come back to you within 1 to 3 business days.",
    cta: "Request a quote",
    href: "/request-quote",
  },
  ask: {
    kicker: "Not sure yet",
    kickerClass: styles.kickerAsk,
    buttonClass: styles.buttonAsk,
    title: "Ask us first",
    body:
      "Send a photo and a question. We will tell you what is worth keeping, what it would take, and roughly " +
      "what it costs, before anything is measured.",
    cta: "Ask a question",
    href: "/contact",
  },
};

/**
 * @param {object} props
 * @param {string} props.heading      the question this block answers
 * @param {string} [props.lead]       one sentence under the heading
 * @param {string[]} [props.paths]    which paths, in the order they should read
 * @param {React.ReactNode} [props.note]  the small print under the cards
 * @param {boolean} [props.onDark]    sitting on the dark green band
 * @param {string} [props.className]
 */
export default function PublicPaths({
  heading,
  lead = "",
  paths = ["shop", "quote", "ask"],
  note = null,
  onDark = false,
  className = "",
}) {
  const shown = paths
    .map((key) => ({ key, path: PATHS[key] }))
    // A path that does not exist is a typo, and drawing nothing for it is
    // better than drawing a blank card.
    .filter((entry) => Boolean(entry.path))
    .filter((entry) => entry.key !== "shop" || SHOP_ENABLED);

  if (!shown.length) return null;

  const gridClass =
    shown.length === 1 ? styles.cardsOne : shown.length === 2 ? styles.cardsTwo : "";

  return (
    <div className={`${styles.block}${onDark ? ` ${styles.onDark}` : ""}${className ? ` ${className}` : ""}`}>
      {heading ? <h2 className={styles.heading}>{heading}</h2> : null}
      {lead ? <p className={styles.lead}>{lead}</p> : null}

      <div className={`${styles.cards} ${gridClass}`}>
        {shown.map(({ key, path }) => (
          <Link className={styles.card} href={path.href} key={key}>
            <span className={`${styles.kicker} ${path.kickerClass}`}>{path.kicker}</span>
            <strong>{path.title}</strong>
            <p>{path.body}</p>
            <span className={`${styles.button} ${path.buttonClass}`}>{path.cta}</span>
          </Link>
        ))}
      </div>

      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}
