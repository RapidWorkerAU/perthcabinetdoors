"use client";

import { useState } from "react";
import styles from "./contact.module.css";

const TOPICS = [
  "I want to understand my options",
  "I'm upgrading IKEA cabinets",
  "I'm upgrading Kaboodle cabinets",
  "I'm interested in bespoke cabinetry",
  "I have a question about materials or finishes",
  "I have a question about delivery",
  "Something else",
];

function value(formData, key) {
  return String(formData.get(key) || "").trim();
}

export default function ContactFormClient() {
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  async function submitContact(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus(null);

    const formData = new FormData(form);
    const firstName = value(formData, "firstName");
    const lastName = value(formData, "lastName");
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const topic = value(formData, "topic");
    const postcode = value(formData, "postcode");
    const message = value(formData, "message");
    const email = value(formData, "email");

    const nextErrors = {};
    if (!firstName) nextErrors.firstName = "Please enter your first name.";
    if (!email) nextErrors.email = "Please enter your email address.";
    if (!topic) nextErrors.topic = "Please select a topic.";
    if (!message) nextErrors.message = "Please enter a message.";

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const payload = {
      customerName: name,
      customerEmail: email,
      customerPhone: value(formData, "phone"),
      postcode,
      topic,
      message,
    };

    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not send message.");
      form.reset();
      setStatus({ type: "success", message: "Thanks. Your message has been sent and we will come back to you within one business day." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Could not send message." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitContact}>
      <p className={styles.sectionLabel}>General Enquiry</p>
      <h2 className={styles.formHeading}>Ask Us Anything</h2>
      <p className={styles.formIntro}>
        Not sure what you need yet, or just want to pick our brains? Send us a message and we will point you in the right direction. No pressure, no obligation.
      </p>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" type="text" placeholder="e.g. Sarah" className={errors.firstName ? styles.fieldInputError : ""} />
          {errors.firstName ? <span className={styles.fieldError}>{errors.firstName}</span> : null}
        </div>
        <div className={styles.field}><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" type="text" placeholder="e.g. Jones" /></div>
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}><label htmlFor="phone">Phone number</label><input id="phone" name="phone" type="tel" placeholder="e.g. 0400 000 000" /></div>
        <div className={styles.field}>
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" placeholder="e.g. sarah@email.com" className={errors.email ? styles.fieldInputError : ""} />
          {errors.email ? <span className={styles.fieldError}>{errors.email}</span> : null}
        </div>
      </div>
      <div className={styles.fieldFull}>
        <div className={styles.field}>
          <label htmlFor="postcode">Postcode</label>
          <input id="postcode" name="postcode" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" type="text" placeholder="e.g. 6000" />
          <p className={styles.fieldNote}>This helps us understand where you are for installation or delivery enquiries.</p>
        </div>
      </div>

      <hr className={styles.formDivider} />

      <div className={styles.fieldFull}>
        <div className={styles.field}>
          <label htmlFor="topic">What is your enquiry about?</label>
          <select id="topic" name="topic" defaultValue="" className={errors.topic ? styles.fieldInputError : ""}>
            <option value="" disabled>Select a topic</option>
            {TOPICS.map((topic) => <option key={topic}>{topic}</option>)}
          </select>
          {errors.topic ? <span className={styles.fieldError}>{errors.topic}</span> : null}
        </div>
      </div>

      <div className={styles.fieldFull}>
        <div className={styles.field}>
          <label htmlFor="message">Your message</label>
          <textarea id="message" name="message" placeholder="Tell us what you are thinking. Even rough ideas are helpful." className={errors.message ? styles.fieldInputError : ""} />
          {errors.message ? <span className={styles.fieldError}>{errors.message}</span> : null}
        </div>
      </div>

      <button className={styles.submitBtn} type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send Message"}</button>
      <p className={styles.submitNote}>We will come back to you within one business day. For urgent enquiries, call <a href="tel:0408906784">0408 906 784</a>.</p>
      {status ? <p className={`${styles.formStatus} ${status.type === "error" ? styles.formStatusError : ""}`}>{status.message}</p> : null}
    </form>
  );
}
