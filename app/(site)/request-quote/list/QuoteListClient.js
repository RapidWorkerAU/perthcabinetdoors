"use client";

// MY LIST, WHICH IS NOT A CART.
//
// The one thing this page has to get across is that nothing on it has a price
// and nothing is charged. The site's shop pages carry a running total in green
// with a Checkout button; this carries a sentence in amber with a Review and
// send button, and says so in words at the top rather than relying on somebody
// noticing the colour.
//
// It can change a quantity and remove a line, and nothing else. Anything more
// than a number goes back to the builder, which is the only place that knows
// what a thermolaminate front may and may not be asked. A second editor here
// would be a second copy of every one of those rules.

import Link from "next/link";
import PublicCrossLink from "@/components/public/PublicCrossLink";
import { draftItemCount, removeLine, setLineQty, useQuoteDraft } from "@/lib/pcd-quote-draft";
import { lineDetailLines, lineTitle } from "@/lib/pcd-quote-line-text";
import styles from "../../contact/contact.module.css";
import CrossToCart from "../../cart/CrossToCart";

const NEXT_STEPS = [
  "You send us the list.",
  "We price it by hand, usually the same day.",
  "You get a quote by email, good for 30 days.",
  "Accept it and we start. Nothing before that.",
];

export default function QuoteListClient() {
  const draft = useQuoteDraft();

  // A server render has no localStorage, so the first paint is always empty
  // whatever the customer has. Telling somebody with nine doors on their list
  // that it is empty, even for the moment it takes to hydrate, is the one
  // sentence on this page they have to be able to believe. So nothing is
  // claimed until the store says it has actually looked.
  if (!draft.ready) return <div className={styles.listWaiting} aria-hidden="true" />;
  return <QuoteList lines={draft.lines} />;
}

export function QuoteList({ lines }) {
  const count = draftItemCount(lines);

  if (!lines.length) {
    return (
      <div className={styles.listEmpty}>
        <h2>Your list is empty</h2>
        <p>Add an item and we will price it. There is no charge and no obligation.</p>
        <Link className={styles.listEmptyBtn} href="/request-quote">
          Start a quote request
        </Link>
        {/* THE OTHER DOOR, AT THE MOMENT IT IS MOST LIKELY TO BE WANTED.
            An empty list means one of two things: they have not started, or
            they started and gave up because the form wanted sizes they do not
            have. The second one is the reason this is here. */}
        <div style={{ marginTop: 24, textAlign: "left" }}>
          <PublicCrossLink
            question="Do you need measurements to ask for a quote?"
            answer="No. If you do not have sizes and finishes in front of you, send a photo and a question through the enquiry form instead. It reaches the same team and we will work the details out with you."
            cta="Ask a question instead"
            href="/contact"
          />
        </div>
        <div style={{ marginTop: 12, textAlign: "left" }}>
          <CrossToCart />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.listPage}>
      <div className={styles.listNotice}>
        <strong>This is your quote list, not a cart.</strong>
        <p>
          Nothing here has a price yet and nothing is charged. We work these out by hand and email
          you a quote.
        </p>
      </div>

      <div className={styles.listGrid}>
        <div className={styles.listLines}>
          {lines.map((line) => (
            <article className={styles.listLine} key={line.id}>
              <div className={styles.listLineTop}>
                <div className={styles.listLineWhat}>
                  <div className={styles.listLineTitle}>
                    <strong>{lineTitle(line)}</strong>
                    <span className={styles.listPill}>To be priced</span>
                  </div>
                  {lineDetailLines(line).map((detail) => (
                    <p key={detail}>{detail}</p>
                  ))}
                  {line.note ? <p className={styles.listLineNote}>&ldquo;{line.note}&rdquo;</p> : null}
                </div>
                {line.colourSrc ? (
                  <img alt="" className={styles.listLineSwatch} src={line.colourSrc} />
                ) : null}
              </div>

              <div className={styles.listLineFoot}>
                <div className={styles.listQty}>
                  <button
                    type="button"
                    aria-label={`One fewer ${lineTitle(line)}`}
                    disabled={Math.max(1, Number(line.qty) || 1) <= 1}
                    onClick={() => setLineQty(line.id, (Number(line.qty) || 1) - 1)}
                  >
                    &minus;
                  </button>
                  <span>{Math.max(1, Number(line.qty) || 1)}</span>
                  <button
                    type="button"
                    aria-label={`One more ${lineTitle(line)}`}
                    onClick={() => setLineQty(line.id, (Number(line.qty) || 1) + 1)}
                  >
                    +
                  </button>
                </div>
                <div className={styles.listLineActions}>
                  {/* Editing is the builder's job, so this is a link back to it
                      rather than a form on this page. It names the line, or the
                      builder would open on a blank row and somebody would have
                      to find their door again. */}
                  <Link className={styles.listEditLink} href={`/request-quote?edit=${encodeURIComponent(line.id)}`}>
                    Edit
                  </Link>
                  <button className={styles.listRemoveBtn} type="button" onClick={() => removeLine(line.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          <Link className={styles.listAddMore} href="/request-quote">
            Add another item
          </Link>
          <CrossToCart />
        </div>

        <aside className={styles.listSide}>
          <div className={styles.listSideHead}>
            <span className={styles.sectionLabel}>What happens next</span>
          </div>
          <div className={styles.listSideBody}>
            <ol className={styles.listSteps}>
              {NEXT_STEPS.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>

            {/* WHERE THE TOTAL WOULD BE. The shop's cart puts a figure here. A
                blank space would read as a total that failed to load, so this
                says what the answer actually is. */}
            <div className={styles.listTotal}>
              <strong>
                {count} {count === 1 ? "item" : "items"}
              </strong>
              <span>No price yet</span>
            </div>

            <Link className={styles.listSendBtn} href="/request-quote/send">
              Review and send
            </Link>
            <p className={styles.listSideFoot}>Nothing is charged until you accept the quote</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
