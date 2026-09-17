import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node20",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  // node:sqlite is a Node built-in; platform: "node" already keeps it (and every
  // other node:* import) external. Real npm deps stay external too, same as
  // every other published @open-panel/* package — this is a library, not an
  // app bundle, so its dependencies are resolved normally from node_modules
  // rather than inlined.
  external: [/^@open-panel\//, "zod"],
});
