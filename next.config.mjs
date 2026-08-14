import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A build and a running dev server both write to .next, and on Windows they
  // corrupt each other: the build fails collecting page data for whichever page
  // the dev server happened to be rewriting. Set PCD_DIST_DIR to build into a
  // separate folder and leave the dev server's .next alone.
  ...(process.env.PCD_DIST_DIR ? { distDir: process.env.PCD_DIST_DIR } : {}),
  outputFileTracingRoot: __dirname,
  pageExtensions: ["js", "jsx", "ts", "tsx"],
  // three.js and the react-three ecosystem ship as ESM that Next's dev webpack
  // does not transpile out of node_modules by default — which surfaces at
  // runtime as "__webpack_modules__[moduleId] is not a function" when the 3D
  // view loads. Naming them here makes dev transpile them the way the
  // production build already does. Only the 3D view pulls these in.
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
};

export default nextConfig;
