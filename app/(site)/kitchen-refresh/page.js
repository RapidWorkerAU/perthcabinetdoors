import Link from "next/link";
import PublicArrowIcon from "@/components/public/PublicArrowIcon";
import CabinetElevation from "@/components/public/CabinetElevation";
import ColourStrip from "@/components/public/ColourStrip";
import PublicFooter from "@/components/public/PublicFooter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";

export const metadata = {
  title: "Kitchen Refresh | Keep the Cabinets, Change the Fronts | Perth Cabinet Doors",
  description:
    "Reface your existing kitchen with new doors, drawer fronts and panels in Polytec, Laminex and Formica. Over 100 colours, made to measure in Perth, with new cabinets added where you need them.",
};

export const dynamic = "force-dynamic";

// Shown when the colour library is unreachable, so the page never renders an
// empty colour section. Mirrors the shape of a pcd_colour_library row.
// The same short run /bespoke draws beside its planner feature, so the two
// pages show the tool the same way.
const PLANNER_RUN = [
  {
    width: 600,
    height: 800,
    arrangement: "rows",
    pieces: [
      { width: 600, height: 200, type: "Drawer front" },
      { width: 600, height: 300, type: "Drawer front" },
      { width: 600, height: 300, type: "Drawer front" },
    ],
  },
  {
    width: 900,
    height: 800,
    arrangement: "columns",
    pieces: [
      { width: 450, height: 800, type: "Door" },
      { width: 450, height: 800, type: "Door" },
    ],
  },
  {
    width: 600,
    height: 2000,
    arrangement: "rows",
    pieces: [
      { width: 600, height: 1200, type: "Door" },
      { width: 600, height: 800, type: "Door" },
    ],
  },
];

const FALLBACK_COLOURS = [
  { name: "Coastal Oak", finish: "Woodmatt", thickness: "18mm", swatch: "#c9ab86" },
  { name: "Notaio Walnut", finish: "Woodmatt", thickness: "18mm", swatch: "#6b4c39" },
  { name: "Blonde Oak", finish: "Woodmatt", thickness: "18mm", swatch: "#d8c4a0" },
  { name: "Prime Oak", finish: "Woodmatt", thickness: "16mm", swatch: "#cdb392" },
  { name: "Blackened Oak", finish: "Woodmatt", thickness: "18mm", swatch: "#3b332c" },
  { name: "Char Oak", finish: "Ravine", thickness: "18mm", swatch: "#4b3d33" },
  { name: "Artisan Oak", finish: "Ravine", thickness: "18mm", swatch: "#b1926e" },
  { name: "Elemental Grey", finish: "Ravine", thickness: "18mm", swatch: "#a8a49c" },
  { name: "Blossom White", finish: "Ravine", thickness: "16mm", swatch: "#f2eee6" },
  { name: "Black Wenge", finish: "Ravine", thickness: "18mm", swatch: "#2c2421" },
  { name: "Crisp White", finish: "Legato", thickness: "18mm", swatch: "#f6f4ef" },
  { name: "Bone White", finish: "Legato", thickness: "18mm", swatch: "#e9e3d6" },
  { name: "Papyrus", finish: "Legato", thickness: "18mm", swatch: "#ded5c4" },
  { name: "Grey Cement", finish: "Legato", thickness: "16mm", swatch: "#a09d97" },
  { name: "New Ultra White", finish: "Gloss", thickness: "18mm", swatch: "#fbfaf7" },
  { name: "Black", finish: "Gloss", thickness: "18mm", swatch: "#181715" },
  { name: "Cinder", finish: "Gloss", thickness: "18mm", swatch: "#6f6d68" },
];

const FINISH_ORDER = ["Woodmatt", "Ravine", "Legato", "Gloss", "Venette", "Smooth", "Matt", "Texture"];

// A colour can carry four thicknesses across the three materials, and a badge
// reading "13mm / 18mm / 21mm / 5mm" is both wrong-order and too wide for the
// tile. Sort numerically and print the unit once: "5/13/18/21mm".
function formatThicknessBadge(thicknesses) {
  const sorted = [...new Set(thicknesses)]
    .map((value) => ({ value, mm: parseFloat(value) }))
    .filter((entry) => Number.isFinite(entry.mm))
    .sort((a, b) => a.mm - b.mm);

  if (!sorted.length) return "";
  return `${sorted.map((entry) => entry.mm).join("/")}mm`;
}

async function loadColours() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pcd_colour_library")
      .select("name,finish_type,thickness,image_url,material_type,sort_order")
      .eq("is_active", true)
      // Doors, drawer fronts and panels only - compact laminate at 5mm and 13mm
      // is benchtop and splashback stock, and listing it here would put "5mm" on
      // a tile a customer is reading as a cabinet door.
      .in("material_type", ["decorative board", "thermolaminate"])
      .order("sort_order", { ascending: true });

    if (error || !data?.length) return FALLBACK_COLOURS;

    // One tile per colour name per finish - the library carries a row per
    // thickness, and a customer does not want to see Char Oak listed twice.
    const byKey = new Map();
    data.forEach((row) => {
      if (!row.name || !row.finish_type) return;
      const key = `${row.finish_type}::${row.name}`;
      const existing = byKey.get(key);
      if (existing) {
        if (row.thickness && !existing.thicknesses.includes(row.thickness)) {
          existing.thicknesses.push(row.thickness);
        }
        if (!existing.imageUrl && row.image_url) existing.imageUrl = row.image_url;
        return;
      }
      byKey.set(key, {
        name: row.name,
        finish: row.finish_type,
        thicknesses: row.thickness ? [row.thickness] : [],
        imageUrl: row.image_url || null,
        swatch: "#dbd8cc",
      });
    });

    const grouped = new Map();
    byKey.forEach((colour) => {
      const list = grouped.get(colour.finish) || [];
      list.push(colour);
      grouped.set(colour.finish, list);
    });

    const finishes = [...grouped.keys()].sort((a, b) => {
      const ai = FINISH_ORDER.indexOf(a);
      const bi = FINISH_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    return finishes.flatMap((finish) =>
      grouped.get(finish).map((colour) => ({
        name: colour.name,
        finish: colour.finish,
        thickness: formatThicknessBadge(colour.thicknesses),
        imageUrl: colour.imageUrl,
        swatch: colour.swatch,
      }))
    );
  } catch {
    return FALLBACK_COLOURS;
  }
}

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

const PROCESS = [
  [
    "Tell us about your kitchen",
    "Photos and rough dimensions are enough to start. We will tell you straight away whether a refresh is the right call for your cabinets.",
  ],
  [
    "Measuring",
    "Send us your own measurements and there is nothing to pay. If you would rather we came out and measured, and gave you design input while we are there, that is a $100 fee - deducted from your order if you go ahead.",
  ],
  [
    "Choose colour and profile",
    "Over 100 colours across the three brands, plus the door profile and edge detail, so you can see exactly what you are choosing before anything is cut.",
  ],
  [
    "Firm quote",
    "One itemised price covering fronts, panels, hardware and any new cabinets. No surprises later.",
  ],
  [
    "We build",
    "Cut, wrapped and pre-drilled in our Perth workshop. Your kitchen stays in use the whole time.",
  ],
  [
    "Delivery or install",
    "Flat-rate delivery across Perth metro, or our team fits it. Most refreshes are installed in a day.",
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
  const colours = await loadColours();

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
            <p>
              A refresh replaces the doors, drawer fronts and panels on the cabinets you already own. It
              costs a fraction of a new kitchen, it is done in days rather than weeks, and your kitchen
              stays usable while we build.
            </p>
            <div className={styles.actions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/request-quote">
                Request a Quote
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutline}`} href="#process">
                See the Process
              </Link>
            </div>
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

        {/* Materials used to be a dark band and colours a full-width block, which
            put two dark bands within one section of each other and made this
            page read as heavier than /bespoke. Both are feature rows now, in the
            same rhythm as that page: copy one side, a visual the other, split by
            a white band. Same devices, same order, so the two read as siblings. */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.feature}>
              <div>
                <p className={styles.label}>Materials &amp; Colours</p>
                <h2>Polytec, Laminex and Formica</h2>
                <p className={styles.lead}>
                  Three of Australia&apos;s major decorative surface ranges, all supplied and made to
                  measure in our own workshop. Over 270 colours across every finish range they make, plus
                  every door profile and edge detail - all available as a door, a drawer front or a panel,
                  so a whole kitchen matches.
                </p>
                <div className={styles.actions}>
                  <Link className={`${styles.button} ${styles.buttonDark}`} href="/finishes">
                    Browse finishes <PublicArrowIcon />
                  </Link>
                </div>
                <p className={styles.note}>
                  Ask us about samples when you enquire and we will sort out the best way to get the colours
                  in front of you.
                </p>
              </div>
              <div className={styles.featureVisual}>
                <ColourStrip colours={colours} />
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionPanel}`}>
          <div className={styles.wrap}>
            <div className={`${styles.feature} ${styles.featureFlip}`}>
              <div>
                <p className={styles.label}>Changing the Layout</p>
                {/* Deliberately not "See It Before You Commit" - that is the
                    heading on /bespoke's planner feature, and two pages sharing
                    an h2 word for word helps neither reader nor search. */}
                <h2>Draw the New Layout First</h2>
                <p className={styles.lead}>
                  A pantry where the old fridge sat, drawers instead of a cupboard, a wider run to suit a
                  new appliance. Draw the new layout in our free 3D planner and send it through - we quote
                  the new cabinets alongside the fronts as one job, finished in the same colour.
                </p>
                <div className={styles.actions}>
                  <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/design">
                    Open the planner <PublicArrowIcon />
                  </Link>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <div className={styles.plannerMock} aria-hidden="true">
                  {PLANNER_RUN.map((cabinet, index) => (
                    <CabinetElevation
                      key={index}
                      cabinet={cabinet}
                      pieces={cabinet.pieces}
                      arrangement={cabinet.arrangement}
                      className={styles.plannerCabinet}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.dark} id="process">
          <div className={styles.wrap}>
            <p className={`${styles.label} ${styles.labelLight}`}>The Process</p>
            <h2>Six Steps, Start to Finish</h2>
            <ol className={styles.process}>
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

        <section className={styles.cta}>
          <div className={styles.wrap}>
            {/* "Changing the layout" is now its own feature section further up
                with the planner beside it, so this closes on the simpler path
                instead of repeating that heading two screens later. */}
            <h2>Send Us a Photo of Your Kitchen</h2>
            <p className={`${styles.lead} ${styles.leadLight}`}>
              That is genuinely all we need to start. Send a photo and we can provide feedback on what can
              be salvaged or what your options are.
            </p>
            <div className={styles.actions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/request-quote">
                Request a Quote
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutlineLight}`} href="/contact">
                Contact Us
              </Link>
            </div>
            <p className={`${styles.note} ${styles.noteLight}`}>
              No minimum order - Quotes are free - On-site measure and design input $100, deducted from your
              order
            </p>
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
