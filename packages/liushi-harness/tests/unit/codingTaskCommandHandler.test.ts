import { describe, expect, it } from "vitest";
import { ResultStatus } from "#common/index.js";
import { CodingTaskCommandType, parseCodingTaskPayload } from "#application/index.js";

const validCreate = {
  workspaceId: "workspace-1",
  sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
  repositoryId: "repo-1",
  baseRevision: "main-1",
  worktreeBinding: {
    worktreeId: "tree-1",
    relativePath: "work",
    branchName: "task-1",
    managed: true,
  },
  writeSet: ["src/index.ts"],
  inputBindingSet: { bindings: [] },
  executionAuthorization: {
    planRisk: {
      artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      artifactDigest: `sha256:${"1".repeat(64)}`,
      result: "allow",
      requiredGates: [],
      satisfiedApprovalIds: [],
    },
    historicalLogicChange: false,
  },
};

describe("CodingTask Command 契约", () => {
  it("拒绝 Create 的未知字段", () => {
    const result = parseCodingTaskPayload(CodingTaskCommandType.Create, {
      ...validCreate,
      extra: true,
    });
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("保留枚举 payload 并拒绝缺少 attemptNumber", () => {
    const result = parseCodingTaskPayload(CodingTaskCommandType.StartAttempt, {
      workspaceId: "workspace-1",
    });
    expect(result.status).toBe(ResultStatus.Failure);
  });
});
