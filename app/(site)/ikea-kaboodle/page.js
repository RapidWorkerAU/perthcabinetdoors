import Link from "next/link";
import PublicArrowIcon from "@/components/public/PublicArrowIcon";
import PublicFooter from "@/components/public/PublicFooter";
import { PUBLIC_PRICE_ESTIMATES_ENABLED } from "@/lib/pcd-site-flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";
import { PRICED_MATERIAL_KEYS, publicRatePerSqmIncGst } from "./cabinet-data";
import ConfiguratorClient from "./ConfiguratorClient";

export const metadata = {
  title: "IKEA & Kaboodle Doors and Drawer Fronts | Perth Cabinet Doors",
  description:
    "Replacement doors, drawer fronts and panels for IKEA Metod, Pax and Besta and Kaboodle cabinets. Standard sizes, pre-drilled to suit your hinges, made to measure in Perth.",
};

export const dynamic = "force-dynamic";

// Colours for step 5 come straight from pcd_colour_library so the public page
// and the quote editor can never offer different ranges. material_type decides
// whether a colour appears under "flat" or "profiled", and thickness both
// filters the grid and prints on the tile badge.
const MATERIAL_KEYS = {
  "decorative board": "decorative_board",
  thermolaminate: "thermolaminate",
};

function titleCaseSupplier(value) {
  const name = String(value || "").trim();
  if (!name) return "Other";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// ratePerSqm 0 on every fallback on purpose: if the colour library cannot be
// read we show no prices at all rather than a made-up one. A wrong price on a
// public page is worse than no price.
const FALLBACK_COLOURS = [
  { material: "decorative_board", finish: "Legato", name: "Crisp White", thickness: "18mm", supplier: "Polytec", imageUrl: null, ratePerSqm: 0 },
  { material: "decorative_board", finish: "Woodmatt", name: "Coastal Oak", thickness: "18mm", supplier: "Polytec", imageUrl: null, ratePerSqm: 0 },
  { material: "thermolaminate", finish: "Smooth", name: "Matte White", thickness: "18mm", supplier: "Polytec", imageUrl: null, ratePerSqm: 0 },
  { material: "thermolaminate", finish: "Smooth", name: "Classic White", thickness: "21mm", supplier: "Polytec", imageUrl: null, ratePerSqm: 0 },
];

async function loadColours() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pcd_colour_library")
      .select(
        // `id` is the library row behind the tile. It is carried through the
        // quote list and the request form so the back end can price the line
        // off the exact board, rather than re-matching on a colour name that
        // two suppliers can share. It is an identifier, not a cost.
        "id,name,finish_type,thickness,image_url,material_type,supplier_name,sort_order," +
          // Cost columns are read here and turned into a customer-facing rate
          // below. They never leave the server.
          "cost_per_sqm_ex_gst,cost_per_board_ex_gst,preferred_board_width_mm,preferred_board_height_mm"
      )
      .eq("is_active", true)
      .in("material_type", Object.keys(MATERIAL_KEYS))
      .order("sort_order", { ascending: true });

    if (error || !data?.length) return FALLBACK_COLOURS;

    const seen = new Set();
    const rows = [];
    data.forEach((row) => {
      const material = MATERIAL_KEYS[row.material_type];
      if (!material || !row.name || !row.finish_type || !row.thickness) return;
      const key = `${material}|${row.thickness}|${row.finish_type}|${row.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        id: row.id,
        material,
        finish: row.finish_type,
        name: row.name,
        thickness: row.thickness,
        // The library stores this inconsistently cased ("formica"), and it is a
        // brand name on a customer-facing tile, so normalise it here.
        supplier: titleCaseSupplier(row.supplier_name),
        imageUrl: row.image_url || null,
        // Marked up and GST-inclusive, so nothing about our cost is sent to the
        // browser. Only flat materials get a rate - profiled fronts are quoted
        // by hand until we have real profile prices. 0 means "not priced", and
        // the configurator falls back to Quote for it.
        //
        // PUBLIC_PRICE_ESTIMATES_ENABLED is the master switch. While it is off
        // every colour goes out at 0, so no price is calculated or shown
        // anywhere and the whole list is quoted by hand.
        ratePerSqm:
          PUBLIC_PRICE_ESTIMATES_ENABLED && PRICED_MATERIAL_KEYS.includes(material)
            ? publicRatePerSqmIncGst(row)
            : 0,
      });
    });

    return rows.length ? rows : FALLBACK_COLOURS;
  } catch {
    return FALLBACK_COLOURS;
  }
}

const MAKE = [
  ["Cabinet doors", "Flat slab or profiled, in over 100 colours."],
  ["Drawer fronts", "Matched to your doors, drilled to suit your runners."],
  ["End and return panels", "To cover exposed carcass sides in the same finish."],
  ["Kicks and fillers", "Including the odd widths IKEA and Kaboodle do not make."],
  ["Floating shelves", "In a finish that matches the rest of the run."],
  ["Custom-size fronts", "For the one opening that is not a standard size."],
];

export default async function IkeaKaboodlePage() {
  const colours = await loadColours();

  return (
    <>
      <PublicSiteNav variant="solid" />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.wrap}>
            <div className={styles.pageHeaderCrumb}>
              <Link href="/">Home</Link> &rsaquo; <Link href="/start">Services</Link> &rsaquo; IKEA &amp;
              Kaboodle
            </div>
            <h1>New Doors, Drawer Fronts and Panels for Your IKEA or Kaboodle Cabinets</h1>
            <p>
              Metod, Pax, Besta and Kaboodle all use standard sizes, so there is nothing to measure. Answer
              six questions below - your cabinet, how it is fronted, and the finish you want - and add as
              many pieces as you need. Send us the finished list and we will price it.
            </p>
          </div>
        </header>

        {/* The page heading above is the only one this page needs. A second
            heading block here made the page read as though it had two starts. */}
        <section className={styles.section} id="build">
          <div className={styles.wrap}>
            {/* The rates above are already 0 when estimates are off, so this is
                only about wording: "3 to quote" reads as odd when everything is
                quoted by hand. */}
            <ConfiguratorClient colours={colours} pricingEnabled={PUBLIC_PRICE_ESTIMATES_ENABLED} />
          </div>
        </section>

        <section className={styles.dark}>
          <div className={styles.wrap}>
            <p className={`${styles.label} ${styles.labelLight}`}>What We Make</p>
            <h2>More Than Just Doors</h2>
            <div className={styles.materialGrid}>
              {MAKE.map(([title, detail]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.crossSell}>
              <div>
                <h3>Doing More Than Fronts?</h3>
                <p>
                  Plenty of IKEA and Kaboodle kitchens need one odd-sized cabinet the range does not make,
                  or a run of new cabinetry alongside the standard units. Lay the whole room out in our free
                  3D planner - the standard units and the pieces we build to suit - then send it through and
                  we will quote the lot as one job, finished in the same colour so it all matches.
                </p>
              </div>
              <Link className={`${styles.button} ${styles.buttonDark}`} href="/design">
                Plan the whole room <PublicArrowIcon />
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <div className={styles.wrap}>
            <h2>Tell Us What You Have Got</h2>
            <p className={`${styles.lead} ${styles.leadLight}`}>
              Your cabinet range, roughly how many doors and drawers, and the look you are after. We will
              come back with a free, no-obligation quote.
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
              No minimum order - Pre-drilled to suit your hinges - Flat-rate Perth metro delivery
            </p>
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
