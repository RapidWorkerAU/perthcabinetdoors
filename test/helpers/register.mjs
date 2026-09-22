// The lib modules import each other without file extensions
// (`from "./pcd-drawer-utils"`), which the bundler resolves but Node's ESM
// loader does not. This registers a resolve hook that retries with `.js`, so
// the tests can import the real modules rather than copies of them.
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);

// What a test needs in order to RENDER a component rather than read it as text:
// JSX, stylesheets, the "@/" alias and .tsx files. Registered second so it runs
// first, and written to be additive: anything the hook above already handles
// reaches it untouched, and the transform is scoped to app/ and components/ so
// the lib modules load exactly as they did before. See render-support.mjs.
register("./render-support.mjs", import.meta.url);
