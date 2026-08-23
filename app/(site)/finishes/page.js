import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import { normaliseSupplierName } from "@/lib/pcd-colour-library";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicSiteNav from "../PublicSiteNav";
import styles from "../journey.module.css";
import FinishesBrowser from "./FinishesBrowser";

export const metadata = {
  title: "Colours, Door Profiles & Edge Details | Perth Cabinet Doors",
  description:
    "Every colour we supply across Polytec, Laminex and Formica, all our door profiles and every edge detail. Filter by brand and finish, search by name, and view any of them larger.",
};

export const dynamic = "force-dynamic";

// Doors, drawer fronts and panels only. Compact laminate at 5mm and 13mm is
// benchtop and splashback stock - listing it here would put "5mm" on a tile
// somebody is reading as a cabinet door.
const MATERIAL_TYPES = ["decorative board", "thermolaminate"];

// Roughly how a customer thinks about them: the big timber and stone ranges
// first, the specialist finishes after. Anything unlisted sorts to the end
// alphabetically rather than disappearing.
const FINISH_ORDER = [
  "Woodmatt", "Matt", "Ravine", "Legato", "Venette", "Smooth",
  "Gloss", "Ultramatt", "Sheen", "Texture", "Natura", "Satin", "Raw", "Ashgrain",
];

const SUPPLIER_ORDER = ["Polytec", "Laminex", "Formica"];

// One speller for brand names, shared with the rest of the site. This page used
// to carry its own, which is how a lower case "formica" reached a customer.
const titleCaseSupplier = (value) => normaliseSupplierName(value) || "Other";

// A colour can exist at several thicknesses. One tile per colour, with the
// thicknesses collected onto it, sorted numerically so it never reads
// "13mm / 5mm".
function formatThickness(values) {
  const sorted = [...new Set(values)]
    .map((value) => ({ value, mm: parseFloat(value) }))
    .filter((entry) => Number.isFinite(entry.mm))
    .sort((a, b) => a.mm - b.mm);
  if (!sorted.length) return "";
  return `${sorted.map((entry) => entry.mm).join("/")}mm`;
}

async function loadColours() {
  try {
    const supabase = await createSupabaseServerClient();
    // No cap. The old kitchen-refresh section limited each range to 18, so a
    // page headed "Over 100 Colours" showed about 120 of 274 and never let on
    // that the rest existed. This page is the library - it shows the library.
    const { data, error } = await supabase
      .from("pcd_colour_library")
      .select("name,finish_type,thickness,image_url,material_type,supplier_name,sort_order")
      .eq("is_active", true)
      .in("material_type", MATERIAL_TYPES)
      .order("sort_order", { ascending: true });

    if (error || !data?.length) return [];

    const byKey = new Map();
    data.forEach((row) => {
      if (!row.name || !row.finish_type) return;
      const supplier = titleCaseSupplier(row.supplier_name);
      const key = `${supplier}|${row.finish_type}|${row.name}`;
      const existing = byKey.get(key);
      if (existing) {
        if (row.thickness) existing.thicknesses.push(row.thickness);
        if (!existing.imageUrl && row.image_url) existing.imageUrl = row.image_url;
        return;
      }
      byKey.set(key, {
        name: row.name,
        supplier,
        finish: row.finish_type,
        thicknesses: row.thickness ? [row.thickness] : [],
        imageUrl: row.image_url || null,
      });
    });

    const rank = (list, value) => {
      const index = list.indexOf(value);
      return index === -1 ? list.length : index;
    };

    return [...byKey.values()]
      .map((colour) => ({
        name: colour.name,
        supplier: colour.supplier,
        finish: colour.finish,
        thickness: formatThickness(colour.thicknesses),
        imageUrl: colour.imageUrl,
      }))
      .sort(
        (a, b) =>
          rank(SUPPLIER_ORDER, a.supplier) - rank(SUPPLIER_ORDER, b.supplier) ||
          rank(FINISH_ORDER, a.finish) - rank(FINISH_ORDER, b.finish) ||
          a.finish.localeCompare(b.finish) ||
          a.name.localeCompare(b.name)
      );
  } catch {
    return [];
  }
}

export default async function FinishesPage({ searchParams }) {
  const colours = await loadColours();
  const params = await Promise.resolve(searchParams);
  // /finishes?tab=profiles is the link you send a customer who needs to pick
  // one thing, so they land on it rather than on the colours.
  const initialTab = ["colours", "profiles", "edges"].includes(params?.tab) ? params.tab : "colours";

  return (
    <>
      <PublicSiteNav active="finishes" variant="solid" />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.wrap}>
            <div className={styles.pageHeaderCrumb}>
              <Link href="/">Home</Link> &rsaquo; Finishes
            </div>
            <h1>Colours, Door Profiles &amp; Edge Details</h1>
            <p>
              Everything we can make your doors, drawer fronts and panels in. Filter by brand and finish,
              search by name, and click anything to see it larger. Every colour here is available across
              doors, drawer fronts and panels, so a whole kitchen matches.
            </p>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <FinishesBrowser colours={colours} initialTab={initialTab} />
          </div>
        </section>

        <section className={styles.cta}>
          <div className={styles.wrap}>
            <h2>Seen Something You Like?</h2>
            <p className={`${styles.lead} ${styles.leadLight}`}>
              Tell us the colour, the profile and the edge and we will quote it. Not sure between two? Ask
              us about samples when you enquire and we will sort out the best way to get them in front of
              you.
            </p>
            <div className={styles.actions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/request-quote">
                Request a Quote
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutlineLight}`} href="/contact">
                Contact Us
              </Link>
            </div>
          </div>
        </section>

        <PublicFooter className={styles.siteFooter} />
      </main>
    </>
  );
}
