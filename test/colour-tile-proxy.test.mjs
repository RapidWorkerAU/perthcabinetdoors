// Serving colour tiles from our own origin.
//
// Most library rows have their tile uploaded to our storage, but a handful were
// saved as a link straight to the supplier's website. A plain <img> is happy
// with that; a WebGL texture is not, because the supplier sites send no CORS
// header. In the design tool's 3D view a texture that will not load is not a
// missing swatch, it is the room dropping back to flat colours, which reads as
// "the colour toggle is broken". So a linked picture is fetched by us and
// served from our origin like an uploaded one.
//
// The endpoint fetches whatever it is handed, so these check that the "whatever"
// is a short list of supplier sites and nothing else.
import test from "node:test";
import assert from "node:assert/strict";
import { allowedTileUrl } from "../lib/pcd-colour-tiles.js";

test("a supplier's own site is fetched, anything else is refused", () => {
  const daintree = "https://www.laminex.com.au/medias/Daintree-1200x1200.jpg?context=abc";
  assert.equal(allowedTileUrl(daintree), daintree);
  assert.equal(allowedTileUrl("https://polytec.com.au/tiles/oak.jpg"), "https://polytec.com.au/tiles/oak.jpg");

  // Somebody else's site is not ours to fetch on request.
  assert.equal(allowedTileUrl("https://example.com/tile.jpg"), null);
  // Nor is a lookalike host that merely ends in the right letters.
  assert.equal(allowedTileUrl("https://notlaminex.com.au/tile.jpg"), null);
  assert.equal(allowedTileUrl("https://laminex.com.au.evil.test/tile.jpg"), null);
  // Reaching back into our own network is the whole reason this is a list.
  assert.equal(allowedTileUrl("http://127.0.0.1:3000/admin"), null);
  assert.equal(allowedTileUrl("http://169.254.169.254/latest/meta-data/"), null);
  // Plain http is out even on a supplier, so a tile can't be swapped in transit.
  assert.equal(allowedTileUrl("http://www.laminex.com.au/tile.jpg"), null);
  // And nothing at all is nothing, not a crash.
  assert.equal(allowedTileUrl(""), null);
  assert.equal(allowedTileUrl(null), null);
  assert.equal(allowedTileUrl("not a url"), null);
});
