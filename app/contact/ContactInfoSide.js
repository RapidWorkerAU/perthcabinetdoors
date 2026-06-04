import styles from "./contact.module.css";

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 10.8 19.79 19.79 0 0 1 0 2.12 2 2 0 0 1 2 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14.92v2z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default function ContactInfoSide({ compact = false }) {
  return (
    <aside className={compact ? styles.sidebar : styles.infoSide}>
      <div className={styles.contactCard}>
        <div className={styles.contactCardLabel}>Contact details</div>
        <div className={styles.contactRow}>
          <div className={styles.contactIcon}><PhoneIcon /></div>
          <div>
            <div className={styles.contactInfoLabel}>Phone</div>
            <div className={styles.contactInfoValue}><a href="tel:0408906784">0408 906 784</a></div>
            <div className={styles.contactInfoSub}>Best for urgent enquiries</div>
          </div>
        </div>
        <div className={styles.contactRow}>
          <div className={styles.contactIcon}><MailIcon /></div>
          <div>
            <div className={styles.contactInfoLabel}>Email</div>
            <div className={styles.contactInfoValue}><a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a></div>
            <div className={styles.contactInfoSub}>Quotes and general enquiries</div>
          </div>
        </div>
        {!compact ? (
          <div className={styles.contactRow}>
            <div className={styles.contactIcon}><LocationIcon /></div>
            <div>
              <div className={styles.contactInfoLabel}>Location</div>
              <div className={styles.contactInfoValue}>Perth, Western Australia</div>
              <div className={styles.contactInfoSub}>Serving all Perth metro</div>
            </div>
          </div>
        ) : null}
      </div>

      {!compact ? (
        <div className={styles.contactCard}>
          <div className={styles.contactCardLabel}>Business hours</div>
          {[
            ["Monday", "8:00am - 5:00pm"],
            ["Tuesday", "8:00am - 5:00pm"],
            ["Wednesday", "8:00am - 5:00pm"],
            ["Thursday", "8:00am - 5:00pm"],
            ["Friday", "8:00am - 4:00pm"],
            ["Saturday", "Closed"],
            ["Sunday", "Closed"],
          ].map(([day, time]) => (
            <div className={styles.hoursRow} key={day}>
              <span className={styles.hoursDay}>{day}</span>
              <span className={time === "Closed" ? styles.hoursClosed : styles.hoursTime}>{time}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.tipCard}>
          <div className={styles.tipCardLabel}>Measuring tips</div>
          <p>Measure the width then height of each opening in millimetres. If you are replacing existing doors, measure the door itself rather than the opening.</p>
          <p>Not sure about overlay or gap sizes? Give us the opening dimensions and we will advise on the right sizing for your cabinet type.</p>
          <p>For drawer fronts, measure the existing front or the opening width and the height of each drawer.</p>
        </div>
      )}

      <div className={styles.promiseCard}>
        <div className={styles.contactCardLabel}>What to expect</div>
        <div className={styles.promiseItems}>
          <div className={styles.promiseItem}><span className={styles.promiseDot} /><span>We will come back to you within one business day.</span></div>
          <div className={styles.promiseItem}><span className={styles.promiseDot} /><span>We will confirm dimensions, finish and hinge specs before anything is made.</span></div>
          <div className={styles.promiseItem}><span className={styles.promiseDot} /><span>You will get a clear, itemised quote with no hidden costs.</span></div>
          <div className={styles.promiseItem}><span className={styles.promiseDot} /><span>Once approved, we will give you a lead time and keep you updated throughout.</span></div>
        </div>
      </div>
    </aside>
  );
}
