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
};

export default nextConfig;
