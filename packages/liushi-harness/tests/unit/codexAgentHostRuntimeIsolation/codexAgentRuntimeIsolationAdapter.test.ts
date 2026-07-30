import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeCodexAgentRuntimeIsolationAdapter } from "../../../src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";
import {
  cleanupRuntimeTestRoots,
  createRuntimeFixture,
  createRuntimeTestRoot,
  SOURCE_STATE_DIGEST,
} from "./codexAgentRuntimeIsolation.fixtures.js";

afterEach(cleanupRuntimeTestRoots);

describe("NodeCodexAgentRuntimeIsolationAdapter", () => {
  it("委托 Host 生命周期所需的计划、环境、准备、校验、外部检查与清理", async () => {
    const adapter = new NodeCodexAgentRuntimeIsolationAdapter();
    const { plan: expectedPlan } = await createRuntimeFixture();
    const plan = adapter.createPlan({
      codexHomeSource: expectedPlan.codexHomeSource,
      taskId: expectedPlan.taskId,
      sourceStateDigest: SOURCE_STATE_DIGEST,
    });
    expect(plan).toEqual(expectedPlan);

    const environment = adapter.createEnvironment(
      { PATH: "path-value", OPENAI_API_KEY: "secret" },
      plan,
    );
    expect(environment["PATH"]).toBe("path-value");
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");

    const externalRoot = await createRuntimeTestRoot("adapter-external");
    const hostHome = join(externalRoot, "host-home");
    const worktreeRoot = join(externalRoot, "worktree");
    await mkdir(hostHome, { recursive: true });
    await mkdir(worktreeRoot, { recursive: true });
    await expect(
      adapter.assertNoExternalAgentSkills({ hostHome, worktreeRoot }),
    ).resolves.toBeUndefined();

    const prepared = await adapter.prepare(plan, { platform: "linux" });
    await expect(
      adapter.assertAuthSourceStable(plan, prepared.credentialSourceSnapshot),
    ).resolves.toEqual({ verified: true });
    await expect(adapter.cleanup(plan)).resolves.toMatchObject({
      plan,
      removed: true,
    });
  });
});
