import { describe, expect, it } from "vitest";

import type { WorktreeInspectorPort } from "../../src/application/ports/index.js";
import { createChangeSetCheckpointApplication } from "../../src/bootstrap/compositionRoot/factory/index.js";
import { Rfc8785Sha256DigestAdapter, type CommandRunner } from "../../src/infrastructure/index.js";

describe("createChangeSetCheckpointApplication", () => {
  it("创建端口与恢复端口复用同一个应用服务实例", () => {
    const application = createChangeSetCheckpointApplication({
      commandRunner: createUnusedCommandRunner(),
      worktreeInspector: createUnusedWorktreeInspector(),
      digest: new Rfc8785Sha256DigestAdapter(),
    });

    expect(application.changeSetCheckpointRecovery).toBe(application.changeSetCheckpoints);
  });
});

function createUnusedCommandRunner(): CommandRunner {
  return {
    run: () => {
      throw new Error("对象身份测试不应调用 CommandRunner。");
    },
  };
}

function createUnusedWorktreeInspector(): WorktreeInspectorPort {
  return {
    inspect: () => {
      throw new Error("对象身份测试不应调用 WorktreeInspector。");
    },
  };
}
