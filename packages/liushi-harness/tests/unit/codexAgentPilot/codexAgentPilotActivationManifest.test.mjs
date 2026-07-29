import { describe, expect, it } from "vitest";

import { createSessionActivationManifest } from "../../../scripts/codexAgentPilot/activation/index.mjs";
import { parseCodingTaskSessionActivationManifest } from "../../../src/application/codingTaskSession/index.ts";

describe("Codex Agent Pilot Activation Manifest", () => {
  it("生成物满足正式 Harness Activation 契约", () => {
    const manifest = createSessionActivationManifest({
      workspaceId: "liushi-codex-agent-pilot",
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX",
      repositoryRoot: "C:\\pilot\\repository",
      executionAuthorization: {},
    });

    expect(parseCodingTaskSessionActivationManifest(manifest)).toMatchObject({
      status: "success",
    });
  });
});
