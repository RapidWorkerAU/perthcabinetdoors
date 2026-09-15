import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pictures the BROWSER loads and no server code ever opens. Static files are
// served separately from functions, so keeping these out of a function bundle
// does not stop a single page showing them.
//
// The folders the production sheet really does read off disk are deliberately
// absent. They are listed in lib/pcd-order-reference-images.js.
const WEBSITE_IMAGERY = [
  "public/images/laminex/**/*",
  "public/images/website/**/*",
  // The hero photographs, several megabytes each.
  "public/images/*.jpg",
  "public/images/*.jpeg",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A build and a running dev server both write to .next, and on Windows they
  // corrupt each other: the build fails collecting page data for whichever page
  // the dev server happened to be rewriting. Set PCD_DIST_DIR to build into a
  // separate folder and leave the dev server's .next alone.
  ...(process.env.PCD_DIST_DIR ? { distDir: process.env.PCD_DIST_DIR } : {}),
  outputFileTracingRoot: __dirname,

  // A BACKSTOP, NOT THE FIX.
  //
  // The real fix is in lib/pcd-order-reference-images.js, which now names the
  // six picture folders it reads instead of rooting a runtime path at public/.
  // That is what took the cut list from 444MB to 47MB against Vercel's 250MB
  // ceiling. Read the note there before changing either.
  //
  // This stays as a second line of defence for anything else that reads with a
  // built up path later. It cannot undo one on its own: an exclude does not
  // reach a folder the build took as a whole, which is why the cut list sat at
  // 444MB with these already in place.
  outputFileTracingExcludes: {
    "*": WEBSITE_IMAGERY,
    "/api/admin/orders/[id]/cut-list-pdf": WEBSITE_IMAGERY,
  },
  pageExtensions: ["js", "jsx", "ts", "tsx"],
  // three.js and the react-three ecosystem ship as ESM that Next's dev webpack
  // does not transpile out of node_modules by default — which surfaces at
  // runtime as "__webpack_modules__[moduleId] is not a function" when the 3D
  // view loads. Naming them here makes dev transpile them the way the
  // production build already does. Only the 3D view pulls these in.
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],

  // ── WHERE THE OLD SHOPIFY SITE'S ADDRESSES GO ───────────────────────────────
  //
  // This site used to be a Shopify store, and Shopify puts everything under its
  // own path structure: /collections for categories, /pages for content pages,
  // /blogs for posts. Those addresses are still out there in old directory
  // listings, supplier pages, saved bookmarks and social posts, and Google was
  // still crawling two of them in May 2026. One request for /collections even
  // reached the launch gate in July.
  //
  // Without these they are a 404: a dead end for a person who followed a real
  // link to us. A redirect makes the same click land on the nearest page that
  // answers what they were looking for.
  //
  // ── WHAT IS DELIBERATELY NOT REDIRECTED ─────────────────────────────────────
  //
  // /products and /cart. Shopify uses both, and so do we: /products is the shop
  // and /cart is its basket. A blanket rule for either would redirect our own
  // live pages away, which is a far worse fault than a 404 on an old link. They
  // are ours now and they answer for themselves.
  //
  // 301 rather than Next's default 308, because 301 is the one every crawler,
  // directory and link checker has understood for twenty years, and these
  // addresses are being followed by old software as much as by Google.
  async redirects() {
    return [
      // Named first: a specific destination beats the catch-all below it.
      { source: "/pages/about-us", destination: "/contact", statusCode: 301 },
      { source: "/collections/all", destination: "/finishes", statusCode: 301 },

      // A Shopify collection was a category of things to look at, which is what
      // /finishes is now.
      { source: "/collections/:slug*", destination: "/finishes", statusCode: 301 },

      // A Shopify page or blog post could have been anything, so the home page
      // is the honest destination: it is the one page that leads everywhere.
      { source: "/pages/:slug*", destination: "/", statusCode: 301 },
      { source: "/blogs/:slug*", destination: "/", statusCode: 301 },
    ];
  },
};

export default nextConfig;
