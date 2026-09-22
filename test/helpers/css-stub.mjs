// What a CSS module import becomes when a test renders a component.
//
// `import styles from "./quote-editor.module.css"` is resolved by the bundler
// into an object of generated class names. Node cannot load a stylesheet at
// all, so every component that imports one is unrenderable in a test without
// this.
//
// It hands back the property name itself rather than an empty object, so
// `styles.panelHeader` is the string "panelHeader". That keeps className values
// truthy and makes the rendered HTML readable when a test needs to look at it.
// A test must never assert on these names: they are a stand-in, not the real
// generated classes.
const stub = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      // Let the module system's own questions through untouched.
      if (property === "default" || property === "__esModule") return stub;
      if (property === "then") return undefined;
      return property;
    },
  }
);

export default stub;
