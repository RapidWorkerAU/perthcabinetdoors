"use client";

import styles from "../contact/contact.module.css";
import ImageSelect from "./ImageSelect";
import Tabs from "./Tabs";

/**
 * THE ROUTED FACE OF A THERMOLAMINATE FRONT: the family as tabs, then the
 * profile itself as a dropdown with its photograph, because there are forty of
 * some and nobody tells Bathurst from Bega by name.
 *
 * Shared by the quote builder and the shop's product pages, because the two are
 * one configurator and a profile chosen one way on one page and another way on
 * the next reads as two different websites.
 *
 * Presentational. The caller decides what is on offer:
 *
 *   families   ["Minimal", ...] or [{ value, label, disabled }]
 *   profiles   the profiles in the chosen family, [{ name, image }]
 *   onChange   called with { profileType, profile: "" } when a family is
 *              chosen, because a Soft profile is not in the Sharp list, and
 *              with { profile } alone when a profile is. The quote builder
 *              clears the profile on any patch naming a family, so a profile
 *              pick must not name one.
 *   hint       a sentence under the family tabs, when the caller has one
 */
export default function FrontProfileFields({ families = [], profileType = "", profile = "", profiles = [], onChange, hint = null }) {
  const count = families.length;
  return (
    <div className={styles.stepStack}>
      <div className={styles.stepWide}>
        <span className={styles.fieldLabel}>Profile family</span>
        <Tabs
          options={families}
          value={profileType}
          cols={Math.min(4, Math.max(1, count))}
          onChoose={(value) => onChange({ profileType: value, profile: "" })}
        />
        {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
      </div>
      <div className={styles.stepWide}>
        <span className={styles.fieldLabel}>{profileType ? `${profileType} profiles` : "Profile"}</span>
        {profileType ? (
          <ImageSelect
            value={profile}
            placeholder="Select a profile"
            options={profiles.map((entry) => ({ value: entry.name, label: entry.name, image: entry.image || "" }))}
            onChange={(value) => onChange({ profile: value })}
          />
        ) : (
          <span className={styles.notApplicable}>Pick a profile type first</span>
        )}
      </div>
    </div>
  );
}
