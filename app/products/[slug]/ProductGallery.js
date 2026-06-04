"use client";

import { useMemo, useState } from "react";
import styles from "../products.module.css";

function resolveImageSrc(imageUrl) {
  if (!imageUrl) return "";
  if (
    imageUrl.startsWith("/") ||
    imageUrl.startsWith("http://") ||
    imageUrl.startsWith("https://") ||
    imageUrl.startsWith("data:") ||
    imageUrl.startsWith("blob:")
  ) {
    return imageUrl;
  }
  return `/${imageUrl.replace(/^\.\//, "")}`;
}

export default function ProductGallery({ title, images }) {
  const normalized = useMemo(
    () => (images || []).map((img) => ({ ...img, src: resolveImageSrc(img.image_url || img.imageSrc || "") })),
    [images]
  );

  const [activeSrc, setActiveSrc] = useState(normalized[0]?.src || "");

  if (!normalized.length) {
    return <div className={styles.galleryPlaceholder}>No image</div>;
  }

  return (
    <div className={styles.galleryWrap}>
      <div className={styles.galleryMain}>
        <img src={activeSrc} alt={title} className={styles.detailMainImage} />
      </div>
      <div className={styles.thumbRow}>
        {normalized.map((img) => {
          const active = img.src === activeSrc;
          return (
            <button
              key={`${img.image_url}-${img.sort_order}`}
              type="button"
              onClick={() => setActiveSrc(img.src)}
              className={`${styles.thumbButton} ${active ? styles.thumbActive : ""}`}
            >
              <img src={img.src} alt={title} className={styles.thumb} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
