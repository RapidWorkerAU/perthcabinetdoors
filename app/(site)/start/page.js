import Link from "next/link";
import PublicArrowIcon from "@/components/public/PublicArrowIcon";
import PublicFooter from "@/components/public/PublicFooter";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";

export const metadata = {
  title: "What Are You Working With? | Perth Cabinet Doors",
  description:
    "IKEA or Kaboodle cabinets, an existing kitchen you want to update, or new cabinetry built from scratch. Pick the one that sounds like your place and we will take you to the right prices or the right plan.",
};

const CHOICES = [
  {
    href: "/ikea-kaboodle",
    image: "/images/ikea.jpg",
    imageAlt: "IKEA and Kaboodle style cabinets with new fronts",
    kicker: "Most popular",
    title: "IKEA or Kaboodle cabinets",
    body:
      "Metod, Pax, Besta and Kaboodle use standard opening sizes. That means we can show you a real price right now - pick a size, a colour and a profile.",
    ticks: [
      "Priced from standard sizes, no measuring required",
      "Pre-drilled for your hinge system",
      "Doors, drawer fronts, end panels and kicks",
    ],
    cta: "See sizes and prices",
  },
  {
    href: "/kitchen-refresh",
    image: "/images/kitchen.jpg",
    imageAlt: "Updated kitchen with new cabinet fronts",
    kicker: "Our specialty",
    title: "An existing kitchen I want to update",
    body:
      "Your cabinets are sound, you just cannot stand looking at them. We make new fronts to your measurements - and build new cabinets where the layout needs to change.",
    ticks: [
      "Polytec, Laminex and Formica",
      "Over 100 colours, plus door profiles and edge details",
      "New base or wall cabinets added where required",
    ],
    cta: "See colours, profiles and process",
  },
  {
    href: "/bespoke",
    image: "/images/vanity.jpg",
    imageAlt: "New cabinetry built from scratch",
    kicker: "Full service",
    title: "New cabinetry, built from scratch",
    body:
      "A new kitchen, vanity, laundry, wardrobe or entertainment unit - designed around your space and built in our Perth workshop by cabinet makers with 20+ years on the tools.",
    ticks: [
      "Lay it out yourself in our free 3D planner",
      "Design, build and install across Perth metro",
      "Supply-only if you have your own installer",
    ],
    cta: "Plan it or talk to us",
  },
];

const REASSURANCE = [
  ["No minimum order", "One door or a whole kitchen."],
  ["Made in Perth", "Cut and finished in our own workshop."],
  ["Flat-rate metro delivery", "One price across Perth metro."],
  ["Quotes are free", "On-site measure and design input is $100, deducted from your order."],
];

export default function StartPage() {
  return (
    <>
      <PublicSiteNav active="start" variant="solid" />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.wrap}>
            <div className={styles.pageHeaderCrumb}>
              <Link href="/">Home</Link> &rsaquo; Services
            </div>
            <h1>What Are You Working With?</h1>
            <p>
              Pick the one that sounds like your place and we will put the right tool in front of you - a
              price list, a colour range, or a 3D planner. No forms, no measurements, not yet.
            </p>
          </div>
        </header>

        <div className={styles.wrap}>
          <div className={styles.chooserGrid}>
            {CHOICES.map((choice) => (
              <Link key={choice.href} className={styles.choice} href={choice.href}>
                <span className={styles.choiceArt}>
                  <img src={choice.image} alt={choice.imageAlt} loading="lazy" decoding="async" />
                </span>
                <span className={styles.choiceBody}>
                  <span className={styles.kicker}>{choice.kicker}</span>
                  <h3>{choice.title}</h3>
                  <p>{choice.body}</p>
                  <ul className={styles.ticks}>
                    {choice.ticks.map((tick) => (
                      <li key={tick}>{tick}</li>
                    ))}
                  </ul>
                  <span className={styles.choiceGo}>
                    {choice.cta} <PublicArrowIcon />
                  </span>
                </span>
              </Link>
            ))}
          </div>

          <Link className={styles.catchAll} href="/request-quote">
            <span>
              <strong>Somewhere in between? Most people are.</strong>
              <em>
                Send a photo of your kitchen and rough measurements. We will tell you which parts are worth
                refacing and which are better rebuilt, and quote it for you - no obligation.
              </em>
            </span>
            <PublicArrowIcon className={styles.catchAllArrow} />
          </Link>
        </div>

        <section className={styles.reassure}>
          <div className={styles.wrap}>
            <div className={styles.reassureGrid}>
              {REASSURANCE.map(([title, detail]) => (
                <div key={title}>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
