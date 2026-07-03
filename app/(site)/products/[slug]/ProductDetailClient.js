"use client";

import { useEffect, useState } from "react";
import PortalModal from "@/components/PortalModal";
import { EDGE_PROFILES, profileNamesForSelection, profileTypesForSelection } from "../../../../lib/quote-form-data";
import styles from "./product-detail.module.css";

const THUMBS = ["Front view", "Side profile", "Close-up", "Installed"];

function assetSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function edgeOptionSrc(label) {
  return `/images/edges/${assetSlug(label)}.png`;
}

function profileOptionSrc(profileType, label) {
  return `/images/profiles/${assetSlug(profileType)}/${assetSlug(label)}.jpg`;
}

function deliveryText(product) {
  if (product.type === "panel" || product.type === "table-top") {
    return "Cut to your measurements";
  }
  return "Pre-drilled, ready to hang";
}

export default function ProductDetailClient({
  product,
  relatedProducts,
  colourFamily: initialColourFamily,
  availableThicknesses = [],
  initialThickness = "",
}) {
  const emptyColourFamily = { label: "Colour library", note: "", groups: [] };
  const galleryImages = product.galleryImages || [];
  const thumbs = galleryImages.length
    ? galleryImages.map((_, index) => `Image ${index + 1}`)
    : THUMBS;
  const visibleThumbs = thumbs.slice(0, 4);
  const [activeThumb, setActiveThumb] = useState(0);
  const [selectedThickness, setSelectedThickness] = useState(initialThickness);
  const [colourFamily, setColourFamily] = useState(initialColourFamily?.groups?.length ? initialColourFamily : emptyColourFamily);
  const [activeFinish, setActiveFinish] = useState(0);
  const [activeColour, setActiveColour] = useState(0);
  const [viewerMode, setViewerMode] = useState("colours");
  const [activeProfileType, setActiveProfileType] = useState("");
  const [activeProfile, setActiveProfile] = useState(0);
  const [activeEdge, setActiveEdge] = useState(0);
  // Which tile group is currently open in the full-screen viewer, if any —
  // small swatch/tile images (44px colour squares especially) are too
  // small to judge accurately on a phone, so tapping one opens it larger
  // with prev/next to browse the rest of that group without closing.
  const [lightboxType, setLightboxType] = useState(null); // "colour" | "profile" | "edge" | null
  const [enquiryStatus, setEnquiryStatus] = useState("");
  const [isSendingEnquiry, setIsSendingEnquiry] = useState(false);
  const [enquiryErrors, setEnquiryErrors] = useState({});
  const showThicknessPicker = availableThicknesses.length > 1;
  const selectedFinish = colourFamily.groups[activeFinish] || colourFamily.groups[0] || { label: "", colours: [] };
  const hasColourOptions = selectedFinish.colours.length > 0;
  const selectedColour = hasColourOptions ? selectedFinish.colours[activeColour] || selectedFinish.colours[0] : null;
  const availableProfileTypes = profileTypesForSelection(product.material === "thermolaminate" ? "Thermolaminate" : "", selectedThickness);
  const resolvedProfileType = availableProfileTypes.includes(activeProfileType) ? activeProfileType : availableProfileTypes[0] || "";
  const profileOptions = profileNamesForSelection(resolvedProfileType, "Thermolaminate", selectedThickness);
  const selectedProfile = profileOptions[activeProfile] || profileOptions[0];
  const selectedEdge = EDGE_PROFILES[activeEdge] || EDGE_PROFILES[0];
  const showThermolaminateProfiles = product.material === "thermolaminate";

  useEffect(() => {
    if (!selectedThickness || selectedThickness === initialThickness) return;
    let cancelled = false;

    async function loadColourFamily() {
      try {
        const response = await fetch(
          `/api/colour-library?material=${encodeURIComponent(product.material)}&thickness=${encodeURIComponent(selectedThickness)}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (!cancelled) {
          setColourFamily(payload?.colourFamily?.groups?.length ? payload.colourFamily : emptyColourFamily);
          setActiveFinish(0);
          setActiveColour(0);
        }
      } catch {
        if (!cancelled) setColourFamily(emptyColourFamily);
      }
    }

    loadColourFamily();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThickness]);

  function selectThickness(thickness) {
    setSelectedThickness(thickness);
  }

  function selectFinish(index) {
    setActiveFinish(index);
    setActiveColour(0);
  }

  function selectProfileType(profileType) {
    setActiveProfileType(profileType);
    setActiveProfile(0);
  }

  // The lightbox always browses whatever the *current* group/filters are
  // (e.g. the active finish's colours, or the active profile type's names) —
  // it's a bigger view of the same grid on screen, not a separate list.
  function lightboxItems() {
    if (lightboxType === "colour") {
      return selectedFinish.colours.map((colour) => ({
        src: colour.src,
        name: colour.name,
        sub: selectedFinish.label,
      }));
    }
    if (lightboxType === "profile") {
      return profileOptions.map((profile) => ({
        src: profileOptionSrc(resolvedProfileType, profile),
        name: profile,
        sub: resolvedProfileType,
      }));
    }
    if (lightboxType === "edge") {
      return EDGE_PROFILES.map((edge) => ({ src: edgeOptionSrc(edge), name: edge, sub: "" }));
    }
    return [];
  }

  function lightboxActiveIndex() {
    if (lightboxType === "colour") return activeColour;
    if (lightboxType === "profile") return activeProfile;
    if (lightboxType === "edge") return activeEdge;
    return 0;
  }

  function setLightboxActiveIndex(index) {
    if (lightboxType === "colour") setActiveColour(index);
    if (lightboxType === "profile") setActiveProfile(index);
    if (lightboxType === "edge") setActiveEdge(index);
  }

  function openLightbox(type, index) {
    setLightboxType(type);
    if (type === "colour") setActiveColour(index);
    if (type === "profile") setActiveProfile(index);
    if (type === "edge") setActiveEdge(index);
  }

  async function submitProductEnquiry(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setEnquiryStatus("");

    const formData = new FormData(form);
    const nextErrors = {};
    if (!String(formData.get("width") || "").trim()) nextErrors.width = "Please enter a width.";
    if (!String(formData.get("height") || "").trim()) nextErrors.height = "Please enter a height.";
    if (!String(formData.get("name") || "").trim()) nextErrors.name = "Please enter your name.";
    if (!String(formData.get("contact") || "").trim()) nextErrors.contact = "Please enter a phone number or email address.";
    if (hasColourOptions && !selectedColour) nextErrors.colour = "Please choose a colour from the options above.";

    if (Object.keys(nextErrors).length) {
      setEnquiryErrors(nextErrors);
      return;
    }
    setEnquiryErrors({});
    setIsSendingEnquiry(true);

    const width = Number(formData.get("width") || 0) || undefined;
    const height = Number(formData.get("height") || 0) || undefined;
    const qty = Number(formData.get("qty") || 1) || 1;

    try {
      const response = await fetch("/api/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "product_detail",
          productId: product.id,
          productName: product.name,
          customerName: String(formData.get("name") || ""),
          customerEmail: String(formData.get("contact") || "").includes("@") ? String(formData.get("contact") || "") : "",
          customerPhone: String(formData.get("contact") || "").includes("@") ? "" : String(formData.get("contact") || ""),
          deliverySuburb: String(formData.get("deliverySuburb") || ""),
          notes: String(formData.get("notes") || ""),
          lines: [
            {
              productType: product.typeLabel,
              productName: product.name,
              material: product.materialLabel,
              thickness: selectedThickness,
              width,
              height,
              qty,
              finish: selectedColour ? selectedFinish.label : "",
              colour: selectedColour ? selectedColour.name : "",
            },
          ],
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not send enquiry.");
      form.reset();
      setEnquiryStatus("Thanks. Your quote request has been sent.");
    } catch (error) {
      setEnquiryStatus(error?.message || "Could not send enquiry.");
    } finally {
      setIsSendingEnquiry(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.breadcrumbBar}>
        <p>
          <a href="/">Home</a> &rsaquo; <a href="/products">Products</a> &rsaquo; {product.name}
        </p>
      </div>

      <div className={styles.productPage}>
        <section className={styles.productHero}>
            <div className={styles.gallery}>
              <div className={styles.galleryMain}>
              {galleryImages[activeThumb] ? (
                <img className={styles.galleryMainImage} src={galleryImages[activeThumb]} alt={product.name} />
              ) : (
                <div className={styles.galleryMainPlaceholder}>
                  <div className={styles.galleryMainIcon} />
                  <span className={styles.galleryMainLabel}>{thumbs[activeThumb]}</span>
                </div>
              )}
              <span className={styles.galleryCaption}>{product.heroCaption}</span>
            </div>
            <div className={styles.galleryThumbs}>
              {visibleThumbs.map((thumb, index) => (
                <button
                  className={`${styles.thumb} ${activeThumb === index ? styles.active : ""}`}
                  key={thumb}
                  type="button"
                  onClick={() => setActiveThumb(index)}
                >
                  {galleryImages[index] ? (
                    <img className={styles.thumbImage} src={galleryImages[index]} alt="" />
                  ) : (
                    <span>{thumb}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.productDetails}>
            <div className={styles.detailBadges}>
              <span className={`${styles.badge} ${styles.badgeType}`}>{product.typeLabel}</span>
              <span className={`${styles.badge} ${styles.badgeMaterial}`}>{product.materialLabel}</span>
              {product.compatLabel ? <span className={`${styles.badge} ${styles.badgeCompat}`}>{product.compatLabel}</span> : null}
            </div>

            <h1 className={styles.productName}>{product.name}</h1>
            <p className={styles.productDesc}>{product.detailDesc}</p>

            <div className={styles.specList}>
              <div className={styles.specRow}><span>Material</span><strong>{product.materialLabel}</strong></div>
              <div className={styles.specRow}><span>Style</span><strong>{product.style}</strong></div>
              <div className={styles.specRow}><span>Finish brand</span><strong>{product.finishBrand}</strong></div>
              <div className={styles.specRow}><span>Compatible with</span><strong>{product.compatLabel || "Custom cabinetry"}</strong></div>
              <div className={styles.specRow}><span>Pre-drilled</span><strong>{product.preDrilled}</strong></div>
              <div className={styles.specRow}><span>Made to measure</span><strong>{product.madeToMeasure}</strong></div>
              <div className={styles.specRow}><span>Lead time</span><strong>{product.leadTime}</strong></div>
            </div>

            <div className={styles.productViewer}>
              {showThermolaminateProfiles ? (
                <div className={styles.viewerToggle} role="radiogroup" aria-label="Product option viewer">
                  {[
                    ["colours", "Colours"],
                    ["profiles", "Front profiles"],
                    ["edges", "Edge profiles"],
                  ].map(([value, label]) => (
                    <button
                      aria-checked={viewerMode === value}
                      className={`${styles.viewerToggleButton} ${viewerMode === value ? styles.active : ""}`}
                      key={value}
                      onClick={() => setViewerMode(value)}
                      role="radio"
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {viewerMode === "colours" || !showThermolaminateProfiles ? (
                <div className={styles.viewerPanel}>
                  <div className={styles.sectionLabel}>{colourFamily.label || "Colour library"} colour</div>
                  {showThicknessPicker ? (
                    <>
                      <div className={styles.finishTabs} role="radiogroup" aria-label="Board thickness">
                        {availableThicknesses.map((thickness) => (
                          <button
                            aria-checked={selectedThickness === thickness}
                            className={`${styles.finishTab} ${selectedThickness === thickness ? styles.active : ""}`}
                            key={thickness}
                            onClick={() => selectThickness(thickness)}
                            role="radio"
                            type="button"
                          >
                            {thickness}
                          </button>
                        ))}
                      </div>
                      <label className={styles.mobileSelectLabel}>
                        Thickness
                        <select
                          className={styles.mobileSelect}
                          value={selectedThickness}
                          onChange={(event) => selectThickness(event.target.value)}
                        >
                          {availableThicknesses.map((thickness) => (
                            <option key={thickness} value={thickness}>{thickness}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : null}
                  <div className={styles.finishTabs}>
                    {colourFamily.groups.map((finish, index) => (
                      <button
                        className={`${styles.finishTab} ${activeFinish === index ? styles.active : ""}`}
                        key={`${finish.label}-${index}`}
                        onClick={() => selectFinish(index)}
                        type="button"
                      >
                        {finish.label}
                      </button>
                    ))}
                  </div>
                  <label className={styles.mobileSelectLabel}>
                    Finish
                    <select
                      className={styles.mobileSelect}
                      value={activeFinish}
                      onChange={(event) => selectFinish(Number(event.target.value))}
                    >
                      {colourFamily.groups.map((finish, index) => (
                        <option key={`${finish.label}-${index}`} value={index}>{finish.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.colourSwatches}>
                    {selectedFinish.colours.map((colour, index) => (
                      <button
                        aria-label={`${colour.name} - tap to view larger`}
                        className={`${styles.swatch} ${activeColour === index ? styles.active : ""}`}
                        key={colour.id || `${selectedFinish.label}-${colour.name}-${index}`}
                        onClick={() => openLightbox("colour", index)}
                        title={colour.name}
                        type="button"
                      >
                        <img src={colour.src} alt="" />
                      </button>
                    ))}
                  </div>
                  <p className={styles.tileHint}>Tap a swatch to view it larger and select it.</p>
                  {selectedColour ? (
                    <div className={styles.colourName}>
                      {selectedColour.name} <span>{selectedFinish.label}</span>
                    </div>
                  ) : (
                    <div className={styles.colourName}>No colours available for this thickness yet - contact us for options.</div>
                  )}
                  <div className={styles.colourNote}>{colourFamily.note} Shown colours are indicative only. Request a sample before ordering.</div>
                </div>
              ) : null}

              {showThermolaminateProfiles && viewerMode === "profiles" ? (
                <div className={styles.viewerPanel}>
                  <div className={styles.sectionLabel}>Front profile type</div>
                  <div className={styles.finishTabs}>
                    {availableProfileTypes.map((profileType) => (
                      <button
                        className={`${styles.finishTab} ${resolvedProfileType === profileType ? styles.active : ""}`}
                        key={profileType}
                        onClick={() => selectProfileType(profileType)}
                        type="button"
                      >
                        {profileType}
                      </button>
                    ))}
                  </div>
                  <label className={styles.mobileSelectLabel}>
                    Profile type
                    <select
                      className={styles.mobileSelect}
                      value={resolvedProfileType}
                      onChange={(event) => selectProfileType(event.target.value)}
                    >
                      {availableProfileTypes.map((profileType) => (
                        <option key={profileType} value={profileType}>{profileType}</option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.profileSwatches}>
                    {profileOptions.map((profile, index) => (
                      <button
                        aria-label={`${profile} - tap to view larger`}
                        className={`${styles.profileSwatch} ${activeProfile === index ? styles.active : ""}`}
                        key={`${resolvedProfileType}-${profile}`}
                        onClick={() => openLightbox("profile", index)}
                        title={profile}
                        type="button"
                      >
                        <img src={profileOptionSrc(resolvedProfileType, profile)} alt="" />
                        <span>{profile}</span>
                      </button>
                    ))}
                  </div>
                  <p className={styles.tileHint}>Tap a profile to view it larger and select it.</p>
                  {selectedProfile ? (
                    <div className={styles.colourName}>
                      {selectedProfile} <span>{resolvedProfileType}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showThermolaminateProfiles && viewerMode === "edges" ? (
                <div className={styles.viewerPanel}>
                  <div className={styles.sectionLabel}>Edge profile</div>
                  <div className={styles.edgeProfileList}>
                    {EDGE_PROFILES.map((edge, index) => (
                      <button
                        aria-label={`${edge} - tap to view larger`}
                        className={`${styles.edgeProfileTile} ${activeEdge === index ? styles.active : ""}`}
                        key={edge}
                        onClick={() => openLightbox("edge", index)}
                        title={edge}
                        type="button"
                      >
                        <img src={edgeOptionSrc(edge)} alt="" />
                        <span>{edge}</span>
                      </button>
                    ))}
                  </div>
                  <p className={styles.tileHint}>Tap an edge profile to view it larger and select it.</p>
                  <div className={styles.colourName}>{selectedEdge}</div>
                </div>
              ) : null}
            </div>

            <div className={styles.priceBlock}>
              <div className={styles.priceFromLabel}>Starting from</div>
              <div className={styles.priceAmount}>${product.price}</div>
              <div className={styles.priceSize}>{product.size} - see full pricing table below</div>
              <div className={styles.priceNote}>Prices are indicative and based on standard sizes. Custom dimensions are available and priced on enquiry. All prices exclude delivery.</div>
            </div>

            <div className={styles.ctaGroup}>
              <a href="/request-quote" className={styles.btnPrimary}>Get a free quote</a>
              <a href="tel:0408906784" className={styles.btnSecondary}>Call us - 0408 906 784</a>
            </div>
            <p className={styles.ctaNote}>We will come back to you promptly with a quote based on your exact measurements and chosen finish.</p>

            <div className={styles.deliveryStrip}>
              <div><span />Flat-rate shipping, Perth metro</div>
              <div><span />{deliveryText(product)}</div>
              <div><span />Made to your measurements</div>
            </div>
          </div>
        </section>

        <section className={styles.lowerSections}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardHeader}>Indicative pricing</div>
            <div className={styles.sectionCardBody}>
              <table className={styles.pricingTable}>
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Description</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {product.pricingRows.map((row) => (
                    <tr key={`${row.size}-${row.description}`}>
                      <td>{row.size}{row.popular ? <span className={styles.popularTag}>Popular</span> : null}</td>
                      <td>{row.description}</td>
                      <td className={styles.priceCell}>${row.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.pricingNote}>All prices are indicative and in AUD. Final pricing is confirmed on enquiry based on your dimensions, quantity and chosen Polytec finish. Laminex and Formica pricing available on request.</p>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardHeader}>Enquire about a custom size</div>
            <form className={styles.sectionCardBody} onSubmit={submitProductEnquiry}>
              <p className={styles.enquiryIntro}>Need a size not listed above, or want a firm quote? Fill in your details and we will get back to you promptly.</p>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  Width (mm)
                  <input name="width" type="number" placeholder="e.g. 600" className={enquiryErrors.width ? styles.fieldInputError : ""} />
                  {enquiryErrors.width ? <span className={styles.fieldError}>{enquiryErrors.width}</span> : null}
                </label>
                <label className={styles.field}>
                  Height (mm)
                  <input name="height" type="number" placeholder="e.g. 900" className={enquiryErrors.height ? styles.fieldInputError : ""} />
                  {enquiryErrors.height ? <span className={styles.fieldError}>{enquiryErrors.height}</span> : null}
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field}>Quantity<input name="qty" type="number" min="1" placeholder="e.g. 6" /></label>
                <div className={styles.field}>
                  Colour / finish
                  <input
                    type="text"
                    value={selectedColour ? `${selectedFinish.label} - ${selectedColour.name}` : "Select a colour above"}
                    readOnly
                    disabled
                    className={enquiryErrors.colour ? styles.fieldInputError : ""}
                  />
                  <small>Pick your colour using the swatches above - this updates automatically.</small>
                  {enquiryErrors.colour ? <span className={styles.fieldError}>{enquiryErrors.colour}</span> : null}
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  Your name
                  <input name="name" type="text" placeholder="First and last name" className={enquiryErrors.name ? styles.fieldInputError : ""} />
                  {enquiryErrors.name ? <span className={styles.fieldError}>{enquiryErrors.name}</span> : null}
                </label>
                <label className={styles.field}>
                  Phone or email
                  <input name="contact" type="text" placeholder="How should we reach you?" className={enquiryErrors.contact ? styles.fieldInputError : ""} />
                  {enquiryErrors.contact ? <span className={styles.fieldError}>{enquiryErrors.contact}</span> : null}
                </label>
              </div>
              <label className={`${styles.field} ${styles.fieldFull}`}>Delivery suburb<input name="deliverySuburb" type="text" placeholder="e.g. Subiaco" /></label>
              <label className={`${styles.field} ${styles.fieldFull}`}>Anything else?<textarea name="notes" placeholder="e.g. compatible cabinet range, hinge requirements, delivery suburb..." /></label>
              <button className={styles.submitBtn} type="submit" disabled={isSendingEnquiry}>{isSendingEnquiry ? "Sending..." : "Send enquiry"}</button>
              {enquiryStatus ? <p className={styles.enquiryIntro}>{enquiryStatus}</p> : null}
            </form>
          </div>
        </section>

        <section className={styles.infoSection}>
          <h2 className={styles.sectionTitle}>Product information</h2>
          <p className={styles.sectionSub}>Everything you need to know before ordering</p>
            <div className={styles.infoGrid}>
            {(product.infoCards || []).map((card) => (
              <article className={styles.infoCard} key={`${card.title}-${card.body || card.text}`}>
                <h3>{card.title}</h3>
                <p>{card.body || card.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.relatedSection}>
          <h2 className={styles.sectionTitle}>You might also need</h2>
          <p className={styles.sectionSub}>Commonly ordered alongside this product</p>
          <div className={styles.relatedGrid}>
            {relatedProducts.map((related) => (
              <a className={styles.relatedTile} href={`/products/${related.id}`} key={related.id}>
                <div className={styles.relatedImage}>
                  {related.galleryImages?.[0] ? (
                    <img src={related.galleryImages[0]} alt={related.name} className={styles.relatedImageImg} />
                  ) : (
                    <div />
                  )}
                </div>
                <div className={styles.relatedBody}>
                  <div className={styles.relatedType}>{related.typeLabel}</div>
                  <div className={styles.relatedName}>{related.name}</div>
                  <div className={styles.relatedPrice}>Starting from <strong>${related.price}</strong></div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>

      <footer className={styles.siteFooter}>
        <p>Copyright 2026 Perth Cabinet Doors. All rights reserved.</p>
        <p>Perth, Western Australia &nbsp;&middot;&nbsp; <a href="tel:0408906784">0408 906 784</a> &nbsp;&middot;&nbsp; <a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a></p>
      </footer>

      {(() => {
        if (!lightboxType) return null;
        const items = lightboxItems();
        const activeIndex = lightboxActiveIndex();
        const item = items[activeIndex];
        if (!item) return null;
        const goPrev = () => setLightboxActiveIndex((activeIndex - 1 + items.length) % items.length);
        const goNext = () => setLightboxActiveIndex((activeIndex + 1) % items.length);

        return (
          <PortalModal
            open
            onClose={() => setLightboxType(null)}
            ariaLabel={`${item.name} preview`}
            eyebrow={item.sub || undefined}
            title={item.name}
            size="lg"
          >
            <div className={styles.lightboxViewer}>
              <button
                type="button"
                className={styles.lightboxNav}
                onClick={goPrev}
                aria-label="Previous"
                disabled={items.length < 2}
              >
                &lsaquo;
              </button>
              <div className={styles.lightboxImageWrap}>
                <img className={styles.lightboxImage} src={item.src} alt={item.name} />
              </div>
              <button
                type="button"
                className={styles.lightboxNav}
                onClick={goNext}
                aria-label="Next"
                disabled={items.length < 2}
              >
                &rsaquo;
              </button>
            </div>
            {items.length > 1 ? (
              <p className={styles.lightboxCount}>{activeIndex + 1} of {items.length}</p>
            ) : null}
          </PortalModal>
        );
      })()}
    </main>
  );
}

