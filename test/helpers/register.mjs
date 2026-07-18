// The lib modules import each other without file extensions
// (`from "./pcd-drawer-utils"`), which the bundler resolves but Node's ESM
// loader does not. This registers a resolve hook that retries with `.js`, so
// the tests can import the real modules rather than copies of them.
import { register } from "node:module";
register("./resolve-extensionless.mjs", import.meta.url);
