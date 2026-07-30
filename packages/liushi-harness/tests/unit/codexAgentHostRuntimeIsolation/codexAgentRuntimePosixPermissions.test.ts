import { stat } from "node:fs/promises";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import {
  prepareCodexAgentRuntime,
  removeCodexAgentRuntime,
} from "../../../src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";
import {
  cleanupRuntimeTestRoots,
  createRuntimeFixture,
} from "./codexAgentRuntimeIsolation.fixtures.js";

afterEach(cleanupRuntimeTestRoots);

describe("Codex Agent Runtime POSIX 权限", () => {
  it.skipIf(process.platform === "win32")(
    "真实准备后目录权限为 0700 且 auth.json 为 0600",
    async () => {
      const { plan } = await createRuntimeFixture();
      await prepareCodexAgentRuntime(plan);

      try {
        for (const directory of [
          plan.root,
          plan.codexHome,
          plan.sqliteHome,
          plan.tempHome,
          plan.profileHome,
        ]) {
          expect((await stat(directory)).mode & 0o777).toBe(0o700);
        }
        expect((await stat(plan.authFile)).mode & 0o777).toBe(0o600);
      } finally {
        await removeCodexAgentRuntime(plan);
      }
    },
  );
});
