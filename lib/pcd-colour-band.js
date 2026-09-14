import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isColourTileUrl } from "@/lib/pcd-colour-library";

/**
 * THE COLOUR BAND THAT RUNS ACROSS THE PUBLIC PAGES.
 *
 * ONE LOADER, BECAUSE THERE WERE FOUR. The home page, /ikea-kaboodle,
 * /kitchen-refresh and /bespoke each had their own copy of the same Supabase
 * read, the same dedupe and the same strip of tiles. They drifted, as four
 * copies do, and the drift was a bug: three of them deduped on the finish and
 * the colour name together but used the name alone as the React key, so a
 * library holding Black in Gloss and Black in Matt rendered two tiles with the
 * key "Black" and React warned on every one of those pages. Fixing it in one
 * place and leaving three copies behind is how it comes back a fifth time.
 *
 * ONE TILE PER COLOUR NAME. This is a narrower rule than /finishes uses. That
 * page keys on the finish and the name together, because Black in Gloss and
 * Black in Matt are two things you can order and it has to list both. A band
 * tile is around 100px tall and shows no texture, so the same name twice is the
 * same tile twice: a wasted slot in the one element on the page whose whole job
 * is to show range.
 *
 * Doors, drawer fronts and panels only. Compact laminate at 5mm and 13mm is
 * benchtop and splashback stock, and a customer reading the band is reading it
 * as cabinet fronts.
 *
 * Returns [] if the library cannot be read. Every caller renders nothing at all
 * in that case rather than a row of grey boxes, which is the honest failure: an
 * empty band says nothing, a grey band says our colours are grey.
 */
export async function loadColourBand() {
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
    return data.reduce((out, row) => {
      // Not every image_url is an image: some rows carry a link to the
      // supplier's product page, which renders as a transparent gap in the
      // middle of the strip. See isColourTileUrl.
      if (!row.name || !row.finish_type || !isColourTileUrl(row.image_url)) return out;
      if (seen.has(row.name)) return out;
      seen.add(row.name);
      out.push({ name: row.name, imageUrl: row.image_url });
      return out;
    }, []);
  } catch {
    return [];
  }
}

/**
 * An even sample across a list rather than the front of it.
 *
 * The library is ordered by sort_order, which groups the woodgrains together,
 * so the first 18 rows are eighteen shades of oak. That says the opposite of
 * what a band showing 270 colours is for. Taking every nth row instead walks
 * the whole library, so the strip reads as range.
 *
 * Shorter than the count asked for comes back whole.
 */
export function spreadAcross(rows, count) {
  const list = rows || [];
  if (list.length <= count) return list;
  const step = Math.max(1, Math.floor(list.length / count));
  const picks = [];
  for (let i = 0; i < list.length && picks.length < count; i += step) picks.push(list[i]);
  return picks;
}
