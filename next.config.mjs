import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
