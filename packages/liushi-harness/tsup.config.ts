import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bootstrap/cli/cliEntrypoint.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  noExternal: ["canonicalize"],
});
