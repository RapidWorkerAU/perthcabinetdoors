// Lets Node resolve the project's extensionless relative imports.
//
// Next's bundler resolves `from "./pcd-drawer-utils"` happily; Node's ESM
// loader requires the extension. Rather than change every import in the libs
// (or bundle them just to test them), retry a failed relative specifier with
// `.js` appended.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?js$/.test(specifier)) {
      return next(`${specifier}.js`, context);
    }
    throw err;
  }
}
