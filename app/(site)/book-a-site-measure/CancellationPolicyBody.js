"use client";

// THE CANCELLATION POLICY, RENDERED ONCE.
//
// The modal on the booking form and the page at /cancellation-policy both draw
// this. A policy that exists twice is a policy that disagrees with itself the
// first time somebody edits one of them, and this one decides whether a
// customer gets their money back.
//
// The words come from lib/pcd-cancellation-policy.js. Nothing here writes a
// sentence of its own; it only decides what a heading looks like.

import styles from "./book-site-measure.module.css";
import { cancellationPolicySections, MODAL_SECTION_KEYS } from "../../../lib/pcd-cancellation-policy";

export function CancellationRules({ rules = [] }) {
  return (
    <div className={styles.rules}>
      {rules.map((rule) => (
        <div
          key={rule.key}
          className={`${styles.rule} ${rule.key === "credit" ? styles.ruleKeep : ""}`}
        >
          <span className={styles.ruleWhen}>{rule.when}</span>
          <span className={styles.ruleHead}>{rule.head}</span>
          <p>{rule.body}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * @param compact  true inside the modal. It drops the sections somebody halfway
 *                 through a payment does not need, and drops the headings on
 *                 the ones it keeps, because a modal with six headings reads as
 *                 a document rather than as an answer to the question they just
 *                 asked.
 */
export default function CancellationPolicyBody({ fee, confirmHours, salesEmail, compact = false, headingTag = "h2" }) {
  const all = cancellationPolicySections({ fee, confirmHours, salesEmail });
  const sections = compact ? all.filter((s) => MODAL_SECTION_KEYS.includes(s.key)) : all;
  const Heading = headingTag;

  return (
    <>
      {sections.map((section) => (
        <section key={section.key}>
          {compact ? null : (
            <Heading
              style={{
                margin: "22px 0 8px",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#1a1a18",
              }}
            >
              {section.heading}
            </Heading>
          )}

          {(section.paragraphs || []).map((text) => (
            <p key={text} style={{ margin: compact ? 0 : "0 0 12px", fontSize: compact ? 14 : 15, lineHeight: 1.6, color: "#3a3a34" }}>
              {text}
            </p>
          ))}

          {section.rules ? <CancellationRules rules={section.rules} /> : null}

          {section.bullets ? (
            <ul style={{ margin: "0 0 12px", paddingLeft: 19, fontSize: 15, lineHeight: 1.6, color: "#3a3a34" }}>
              {section.bullets.map((line) => (
                <li key={line} style={{ marginBottom: 6 }}>{line}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </>
  );
}
