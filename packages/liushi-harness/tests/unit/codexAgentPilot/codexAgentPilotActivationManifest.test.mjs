import { describe, expect, it } from "vitest";

import { createSessionActivationManifest } from "../../../scripts/codexAgentPilot/activation/index.mjs";
import { parseCodingTaskSessionActivationManifest } from "../../../src/application/codingTaskSession/index.ts";

describe("Codex Agent Pilot Activation Manifest", () => {
  it("生成物满足正式 Harness Activation 契约", () => {
    const manifest = createSessionActivationManifest({
      workspaceId: "liushi-codex-agent-pilot",
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX",
      repositoryId: "unjs-defu",
      repositoryRevision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
      repositoryRoot: "C:\\pilot\\repository",
      writeSet: ["test/utils.test.ts"],
      executionAuthorization: {},
    });

    expect(parseCodingTaskSessionActivationManifest(manifest)).toMatchObject({
      status: "success",
    });
  });
});
