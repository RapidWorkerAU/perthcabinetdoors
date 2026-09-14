import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicPaths from "@/components/public/PublicPaths";
import { loadColourBand, spreadAcross } from "@/lib/pcd-colour-band";
import { evenColumns } from "@/lib/pcd-grid-columns";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";

export const metadata = {
  title: "Bespoke Cabinetry Perth | Designed, Built & Installed | Perth Cabinet Doors",
  description:
    "Custom kitchens, vanities, laundries, wardrobes and entertainment units designed, built and installed across Perth metro by cabinet makers with 20+ years of trade experience.",
};

export const dynamic = "force-dynamic";


const ROOMS = [
  ["Kitchens", "Full kitchens including islands, pantries and appliance cabinetry."],
  ["Bathroom vanities", "Wall-hung or floor-standing, sized to the space you have got."],
  ["Laundry fitouts", "Benches, tall storage and machine surrounds."],
  ["Built-in wardrobes", "Hanging, shelving, drawers and shoe storage."],
  ["TV and entertainment", "Wall units, floating cabinetry and media storage."],
  ["Home office", "Desks, joinery walls and integrated storage."],
  ["Bedroom drawers", "Matching drawer banks and bedside cabinetry."],
  ["Odd spaces", "Under-stairs, nooks and alcoves - the ones nothing off the shelf fits."],
];

const PROCESS = [
  [
    "Show us the room",
    "Lay it out in the 3D planner and send it through, or just send photos and rough dimensions with the quote form. Either way there is no charge to talk it through.",
  ],
  [
    "Measure & design - $100",
    "We come to you, measure the space properly and work through the design with you. The $100 is deducted from your order if you go ahead.",
  ],
  ["Selections", "Finishes, profiles, edges, handles and hardware, so you can see what you are choosing."],
  ["Fixed quote", "Itemised and firm. You approve before anything is cut."],
  ["Build", "Made in our own Perth workshop, not ordered in from overseas."],
  ["Install", "Our team fits it, or we supply-only if you have your own installer."],
];

export default async function BespokePage() {
  // TWENTY FIVE, WHICH IS FIVE BY FIVE. The grid beside the copy is five
  // columns of square tiles, so the count has to stay a multiple of five or the
  // last row strands tiles. See lib/pcd-colour-band.js.
  const colours = spreadAcross(await loadColourBand(), 25);

  return (
    <>
      <PublicSiteNav variant="solid" />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.wrap}>
            <div className={styles.pageHeaderCrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/start">Services</Link> &rsaquo; Bespoke
              cabinetry
            </div>
            <h1>Built to Your Space, in Our Perth Workshop</h1>
            <p>
              When there is nothing worth keeping, or you are starting with an empty room, we design and
              build the whole thing - by cabinet makers with more than twenty years on the tools. Lay the
              room out yourself in our free 3D planner, or just tell us about it.
            </p>
            {/* No buttons in the cream header. It is a title block, not a
                hero, and this page closes on the two ways to get a price with
                the planner beside them. The line below stays: it is a link to
                another page rather than a call to action on this one. */}
            <p className={styles.note}>
              Not the whole room? <Link href="/kitchen-refresh">Look at a kitchen refresh instead</Link>.
            </p>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <p className={styles.label}>Where We Work</p>
            <h2>Every Room in the House</h2>
            <div className={styles.roomGrid}>
              {ROOMS.map(([title, detail]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* THE PLANNER AND THE FINISHES, IN ONE SECTION.
            Each used to be a feature row with its own filled button, which made
            two calls to action in the middle of a page that closes on one. Both
            are now links in a sentence, the colour band does the work the strip
            did at full width, and the planner is offered again properly in the
            closing block. */}
        <section className={`${styles.section} ${styles.sectionPanel}`}>
          <div className={styles.wrap}>
            <div className={styles.colourSplit}>
              <div className={styles.colourSplitText}>
                <p className={styles.label}>Seeing It First</p>
                <h2>Over 270 Colours, and the Room Drawn Before Anything Is Cut</h2>
                <p className={styles.lead}>
                  Set your room size in our <Link href="/design">free 3D planner</Link>, put cabinets along
                  the walls, try colours and look at the whole thing in 3D. It is free, there is no account,
                  and it saves under its own link so you can come back to it. Send it through when you are
                  happy and we will quote what you have drawn.
                </p>
                <p className={styles.lead}>
                  Then choose from Polytec, Laminex and Formica across every finish range they make, plus
                  every door profile and every edge detail. <Link href="/finishes">Browse the finishes</Link>{" "}
                  to filter by brand, search by name and see any of them larger before you decide.
                </p>
              </div>
              {colours.length ? (
                <div className={styles.colourGrid} aria-hidden="true">
                  {colours.map((colour) => (
                    <span key={colour.name} style={{ backgroundImage: `url(${colour.imageUrl})` }} title={colour.name} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className={styles.dark}>
          <div className={styles.wrap}>
            <p className={`${styles.label} ${styles.labelLight}`}>How It Runs</p>
            <h2>From First Conversation to Installed</h2>
            <ol className={styles.process} style={{ "--cols": evenColumns(PROCESS.length) }}>
              {PROCESS.map(([title, detail]) => (
                <li key={title}>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* TWO PATHS HERE, NOT THREE, AND THE MISSING ONE IS THE SHOP.
            Somebody costing a whole kitchen is not the person buying a single
            flat door, and a Buy now button on this page would read as though we
            had misread the job. The block drops to two cards on its own when it
            is only given two.

            The planner and the $100 measure are in the lead rather than inside
            a card, because the cards describe the three ways to buy from us and
            those are the same three on every page. Anything true only of
            bespoke is said here, where there is room to say it properly. */}
        <section className={styles.closing}>
          <div className={styles.wrap}>
            <PublicPaths
              onDark
              heading="How do I get a price for bespoke cabinetry?"
              lead="Every bespoke job is quoted by hand, because no two rooms are the same. Draw it in the free 3D planner or send the room through the quote form, and if you want us on site to measure and work through the design, that is a $100 fee which comes off your order if you go ahead."
              paths={["quote", "ask"]}
              note="20+ years cabinet making · Design, build and install · Supply-only available"
            />
            {/* A third planner link used to sit here, directly under a block
                whose lead already offers the planner. Gone: the lead says it,
                and the section above says it with the room drawn. */}
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
