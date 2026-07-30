import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/bootstrap/cli/cliEntrypoint.ts",
    "src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  noExternal: ["canonicalize"],
});
