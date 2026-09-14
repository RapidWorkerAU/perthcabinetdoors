import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicPaths from "@/components/public/PublicPaths";
import { loadColourBand, spreadAcross } from "@/lib/pcd-colour-band";
import { evenColumns } from "@/lib/pcd-grid-columns";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";

export const metadata = {
  title: "Kitchen Refresh | Keep the Cabinets, Change the Fronts | Perth Cabinet Doors",
  description:
    "Reface your existing kitchen with new doors, drawer fronts and panels in Polytec, Laminex and Formica. Over 270 colours, made to measure in Perth, with new cabinets added where you need them.",
};

export const dynamic = "force-dynamic";

const SCOPE = [
  {
    title: "We replace",
    className: styles.scopeReplace,
    items: [
      "Cabinet doors",
      "Drawer fronts",
      "End and return panels",
      "Kicks and fillers",
      "Open and floating shelves",
      "Handles and hinges",
    ],
  },
  {
    title: "You keep",
    className: styles.scopeKeep,
    items: [
      "Cabinet carcasses",
      "Your existing layout",
      "Benchtops, unless you want them changed",
      "Plumbing and electrical",
      "Splashback",
      "Appliances",
    ],
  },
  {
    title: "We add where needed",
    className: styles.scopeAdd,
    items: [
      "New base cabinets",
      "New wall cabinets",
      "Pantry and broom units",
      "Island benches",
      "Drawer conversions",
      "Custom-width infills",
    ],
  },
];

// FOUR STEPS, NOT SIX.
//
// Measuring and the firm quote were two steps describing one exchange, and
// delivery and installation were two endings to the same step. Nothing was
// dropped: the $100 measure, the itemised price, the flat rate delivery and the
// one day install are all still here, in four steps instead of six.
const PROCESS = [
  [
    "Tell us about your kitchen",
    "Photos and rough dimensions are enough to start. We will tell you straight away whether a refresh is the right call for your cabinets.",
  ],
  [
    "Measure and quote",
    "Send us your own measurements and there is nothing to pay. If you would rather we came out, measured properly and gave you design input while we are there, that is a $100 fee, deducted from your order if you go ahead. Either way you get one itemised price covering fronts, panels, hardware and any new cabinets.",
  ],
  [
    "Choose colour and profile",
    "Over 270 colours across the three brands, plus the door profile and edge detail, so you can see exactly what you are choosing before anything is cut.",
  ],
  [
    "We build, then deliver or fit",
    "Cut, wrapped and pre-drilled in our Perth workshop, and your kitchen stays in use the whole time. Flat-rate delivery across Perth metro, or our team fits it, usually in a day.",
  ],
];

const FAQ = [
  [
    "How do I know if my cabinets are worth keeping?",
    "If the carcasses are square, dry and solid, they are worth keeping - the doors take all the wear, not the boxes. Water damage under the sink or sagging shelves are the usual reasons we would recommend replacing a run instead. Send us photos and we will tell you honestly.",
  ],
  [
    "What does a refresh cost compared to a new kitchen?",
    "Refacing generally costs a fraction of replacing the same kitchen outright, because you are not paying for carcasses, demolition, plumbing or electrical. Your quote depends on the number of fronts, the finish and whether new cabinets are involved.",
  ],
  [
    "Can I change the layout at the same time?",
    "Yes, and it is the most common version of this job - new fronts everywhere, plus a new pantry, a drawer bank replacing a cupboard, or a wider cabinet where an old appliance used to sit. It is all quoted together.",
  ],
  [
    "Do I have to use your installers?",
    "No. We supply-only for plenty of customers and trades. Fronts arrive cut, finished and pre-drilled, so it is a screwdriver job.",
  ],
  [
    "How long does it take?",
    "Measure to delivery is typically two to three weeks depending on the finish. Installing a standard kitchen refresh is usually a single day.",
  ],
];

export default async function KitchenRefreshPage() {
  // TWENTY FIVE, WHICH IS FIVE BY FIVE. The grid beside the copy is five
  // columns of square tiles, so the count has to be a multiple of five or the
  // last row strands tiles. Spread across the whole library rather than taken
  // from the front of it, which is all one finish. See lib/pcd-colour-band.js.
  const colours = spreadAcross(await loadColourBand(), 25);

  return (
    <>
      <PublicSiteNav variant="solid" />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.wrap}>
            <div className={styles.pageHeaderCrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/start">Services</Link> &rsaquo; Kitchen
              refresh
            </div>
            <h1>Keep the Cabinets. Change Everything You See.</h1>
            {/* No buttons in the cream header. It is a title block, not a
                hero, and this page closes on the three ways to buy. */}
            <p>
              A refresh replaces the doors, drawer fronts and panels on the cabinets you already own. It
              costs a fraction of a new kitchen, it is done in days rather than weeks, and your kitchen
              stays usable while we build.
            </p>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <p className={styles.label}>What&apos;s Involved</p>
            <h2>Replaced, Kept, or Added</h2>
            <div className={styles.threeCol}>
              {SCOPE.map((column) => (
                <div className={`${styles.scopeCard} ${column.className}`} key={column.title}>
                  <strong>{column.title}</strong>
                  <ul>
                    {column.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className={styles.pullNote}>
              <strong>You do not have to choose one or the other.</strong> Most refreshes we do are a mix -
              new fronts across the whole kitchen, plus one or two new cabinets where the old layout does
              not work any more. It is quoted as one job. If none of the carcasses are worth keeping, read
              about <Link href="/bespoke">our bespoke cabinetry</Link> instead.
            </p>
          </div>
        </section>

        {/* TWO FEATURE ROWS BECAME ONE SECTION.
            Materials carried a colour strip and a dark button; the planner
            carried an elevation mock and a filled button. Both existed largely
            to hold a button, and this page closes on the three ways to buy. The
            colour band does the work the strip did at full width, and both
            links are links in a sentence. */}
        <section className={`${styles.section} ${styles.sectionPanel}`}>
          <div className={styles.wrap}>
            <div className={styles.colourSplit}>
              <div className={styles.colourSplitText}>
                <p className={styles.label}>Materials &amp; Colours</p>
                <h2>Polytec, Laminex and Formica</h2>
                <p className={styles.lead}>
                  Three of Australia&apos;s major decorative surface ranges, all supplied and made to measure
                  in our own workshop. Over 270 colours across every finish range they make, plus every door
                  profile and edge detail, all available as a door, a drawer front or a panel so a whole
                  kitchen matches. <Link href="/finishes">Browse the finishes</Link>, and ask about samples
                  when you enquire.
                </p>
                <p className={styles.lead}>
                  Changing the layout at the same time? A pantry where the old fridge sat, drawers instead of
                  a cupboard, a wider run to suit a new appliance. Draw it in our{" "}
                  <Link href="/design">free 3D planner</Link> and send it through, and we quote the new
                  cabinets alongside the fronts as one job, finished in the same colour.
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
        <section className={styles.dark} id="process">
          <div className={styles.wrap}>
            <p className={`${styles.label} ${styles.labelLight}`}>The Process</p>
            <h2>Four Steps, Start to Finish</h2>
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


        <section className={styles.section}>
          <div className={styles.wrap}>
            <p className={styles.label}>Common Questions</p>
            <h2>Before You Enquire</h2>
            <div className={styles.faq}>
              {FAQ.map(([question, answer], index) => (
                <details key={question} open={index === 0}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* THE THREE WAYS, QUOTE FIRST.
            Same block as /ikea-kaboodle, same wording, different order. A
            refresh is nearly always hand priced, because it involves a finish
            or a new cabinet that has to be worked out, so leading with the shop
            would point most of this page's readers at the wrong door. On the
            IKEA page the shop leads, because somebody replacing six plain Metod
            doors genuinely can buy them in five minutes.

            This replaced a two button close that offered a quote and the
            contact page and never mentioned that part of this can be bought
            outright. "Send us a photo of your kitchen" was the best line on it
            and now lives inside the third card. */}
        <section className={styles.closing}>
          <div className={styles.wrap}>
            <PublicPaths
              onDark
              heading="How do I get a price for a kitchen refresh?"
              lead="There are three ways, depending on how much you already know. Most refreshes are quoted by hand, because they involve a finish or a new cabinet that has to be priced properly."
              paths={["quote", "shop", "ask"]}
              note="No minimum order · Quotes are free · On-site measure and design input $100, deducted from your order"
            />
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
