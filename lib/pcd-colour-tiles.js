// Where a colour-library tile picture may be fetched from.
//
// WHY A LINKED PICTURE CANNOT JUST BE LINKED. Most library rows have their tile
// uploaded to our own storage, but a handful were saved as a link straight to
// the supplier's website. A plain <img> is happy with that; WebGL is not. A
// texture has to be fetched with CORS, supplier sites send no
// Access-Control-Allow-Origin, and the load fails. In the design tool's 3D view
// that is not one missing swatch, it is the room dropping back to flat colours,
// which reads as "the colour toggle is broken". So a linked picture is fetched
// by us and served from our own origin, exactly like an uploaded one.
//
// An allowlist, not "any URL": the tile endpoint fetches whatever it is handed,
// so left open it would read anything our server can reach, our own network
// included. Add a supplier's site here when we start linking their pictures.
const TILE_HOSTS = [
  "laminex.com.au",
  "polytec.com.au",
  "formica.com",
  "formicaanz.co.nz",
  "paperock.com.au",
];

/** The URL to fetch, or null when it is not one of ours to fetch. */
export function allowedTileUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  // https only, so a tile cannot be swapped out in transit.
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  // Host match or a subdomain of it. Never a suffix match on the raw string,
  // which would let "notlaminex.com.au" through.
  const ok = TILE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  return ok ? url.toString() : null;
}
