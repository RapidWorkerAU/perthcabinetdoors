import Link from "next/link";
import PublicArrowIcon from "@/components/public/PublicArrowIcon";
import CabinetElevation from "@/components/public/CabinetElevation";
import ColourStrip from "@/components/public/ColourStrip";
import PublicFooter from "@/components/public/PublicFooter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";

export const metadata = {
  title: "Bespoke Cabinetry Perth | Designed, Built & Installed | Perth Cabinet Doors",
  description:
    "Custom kitchens, vanities, laundries, wardrobes and entertainment units designed, built and installed across Perth metro by cabinet makers with 20+ years of trade experience.",
};

export const dynamic = "force-dynamic";

// A short run of cabinets, drawn with the same elevation component the
// configurator and the quote drawer use. Stands in for a planner screenshot
// while being honest about what the tool actually draws.
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

// Same colour source as /finishes and /kitchen-refresh, so the strip beside the
// finishes link is real stock rather than decoration.
async function loadColours() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pcd_colour_library")
      .select("name,finish_type,image_url,material_type,sort_order")
      .eq("is_active", true)
      .in("material_type", ["decorative board", "thermolaminate"])
      .order("sort_order", { ascending: true });

    if (error || !data?.length) return [];

    const seen = new Set();
    return data.reduce((rows, row) => {
      if (!row.name || !row.finish_type || !row.image_url) return rows;
      const key = `${row.finish_type}|${row.name}`;
      if (seen.has(key)) return rows;
      seen.add(key);
      rows.push({ name: row.name, finish: row.finish_type, imageUrl: row.image_url });
      return rows;
    }, []);
  } catch {
    return [];
  }
}

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
  const colours = await loadColours();

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
            <div className={styles.actions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/design">
                Plan Your Kitchen in 3D
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutline}`} href="/request-quote">
                Request a Quote
              </Link>
            </div>
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

        {/* The planner and the finishes library each used to be an outlined box
            with one dark button, alongside a third for the refresh page. Three
            identical containers doing unrelated jobs read as a stack of adverts,
            and by the third nobody was reading them. Each now gets the treatment
            it actually warrants: the planner is our differentiator so it gets a
            feature with a visual, finishes sits beside real colour because that
            is what sells it, and "not the whole room" is one line under the
            header buttons - which is all it ever was. */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.feature}>
              <div>
                <p className={styles.label}>Plan It Yourself</p>
                <h2>See It Before You Commit</h2>
                <p className={styles.lead}>
                  Set your room size, put cabinets along the walls, try colours and look at the whole thing
                  in 3D. It is free, there is no account, and it saves under its own link so you can come
                  back to it. Send it through when you are happy and we will quote what you have drawn.
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

        <section className={`${styles.section} ${styles.sectionPanel}`}>
          <div className={styles.wrap}>
            <div className={`${styles.feature} ${styles.featureFlip}`}>
              <div>
                <p className={styles.label}>Colours &amp; Finishes</p>
                <h2>Over 270 Colours, and Every Profile We Cut</h2>
                <p className={styles.lead}>
                  Polytec, Laminex and Formica across every finish range they make, plus every door profile
                  and every edge detail. Filter by brand and finish, search by name, and see any of them
                  larger before you decide.
                </p>
                <div className={styles.actions}>
                  <Link className={`${styles.button} ${styles.buttonDark}`} href="/finishes">
                    Browse finishes <PublicArrowIcon />
                  </Link>
                </div>
              </div>
              <div className={styles.featureVisual}>
                <ColourStrip colours={colours} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.dark}>
          <div className={styles.wrap}>
            <p className={`${styles.label} ${styles.labelLight}`}>How It Runs</p>
            <h2>From First Conversation to Installed</h2>
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

        <section className={styles.cta}>
          <div className={styles.wrap}>
            <h2>Tell Us About Your Project</h2>
            <p className={`${styles.lead} ${styles.leadLight}`}>
              Draw it in the planner, or send a room and a rough idea through the quote form - both reach us
              the same way. If you want us on site to measure and work through the design, that is a $100
              fee which comes off your order if you go ahead.
            </p>
            <div className={styles.actions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/design">
                Plan Your Kitchen in 3D
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutlineLight}`} href="/request-quote">
                Request a Quote
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutlineLight}`} href="/contact">
                Contact Us
              </Link>
            </div>
            <p className={`${styles.note} ${styles.noteLight}`}>
              20+ years cabinet making - Design, build and install - Supply-only available
            </p>
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
