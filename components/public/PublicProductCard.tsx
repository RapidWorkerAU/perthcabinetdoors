import PublicButton from "./PublicButton";

type PublicProductCardProps = {
  classNames: Record<string, string | undefined>;
  product: {
    compatLabel?: string;
    desc: string;
    galleryImages?: string[];
    id: string;
    materialLabel: string;
    name: string;
    price: number;
    size: string;
    slug?: string;
    typeLabel: string;
  };
};

export default function PublicProductCard({ classNames: styles, product }: PublicProductCardProps) {
  return (
    <article className={styles.tile} key={product.id}>
      <div className={styles.tileImage}>
        {product.galleryImages?.[0] ? (
          <img className={styles.tileProductImage} src={product.galleryImages[0]} alt={product.name} />
        ) : (
          <div className={styles.tileImagePlaceholder}>
            <div className={styles.tileImageIcon} />
            <span className={styles.tileImageLabel}>Product photo</span>
          </div>
        )}
        <div className={styles.tileBadges}>
          {product.compatLabel ? <span className={`${styles.badge} ${styles.badgeCompat}`}>{product.compatLabel}</span> : null}
          <span className={`${styles.badge} ${styles.badgeMaterial}`}>{product.materialLabel}</span>
        </div>
      </div>
      <div className={styles.tileBody}>
        <div className={styles.tileType}>{product.typeLabel}</div>
        <h2 className={styles.tileName}>{product.name}</h2>
        <p className={styles.tileDesc}>{product.desc}</p>
        <div className={styles.tileFooter}>
          <div>
            <div className={styles.tilePriceLabel}>Starting from</div>
            <div className={styles.tilePriceAmount}>${product.price}</div>
            <div className={styles.tilePriceSize}>{product.size}</div>
          </div>
          <PublicButton href={`/products/${product.slug || product.id}`} className={styles.tileBtn}>
            View details
          </PublicButton>
        </div>
      </div>
    </article>
  );
}
