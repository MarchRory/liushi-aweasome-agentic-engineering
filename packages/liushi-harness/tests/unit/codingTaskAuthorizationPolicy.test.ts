import { describe, expect, it } from "vitest";

import { TaskBackedCodingTaskAuthorizationPolicy } from "#application/codingTask/authorization/index.js";
import type { TaskRepository } from "#application/ports/index.js";
import { ActorKind, ResultStatus, success } from "#common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  parseArtifactDigest,
  parseArtifactId,
  type PlanRiskArtifact,
} from "#domain/artifact/index.js";
import { GateEvaluationResult, RiskLevel } from "#domain/policy/index.js";
import type { TaskAggregate } from "#domain/taskRun/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

const workspaceId = unwrap(parseWorkspaceId("authorization-workspace"));
const sourceTaskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB2"));
const planRiskArtifactId = unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAV"));
const planRiskDigest = unwrap(parseArtifactDigest(`sha256:${"1".repeat(64)}`));
const repositoryId = unwrap(parseRepositoryId("repo-1"));

describe("TaskBackedCodingTaskAuthorizationPolicy", () => {
  it("只接受当前 Task 中存在的 PlanRisk，不接受伪造 Artifact 授权", async () => {
    const policy = new TaskBackedCodingTaskAuthorizationPolicy(
      repositoryWith({ artifacts: [], approvals: [] }),
      fixedClock,
    );
    const result = await policy.resolve(request());

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: "operation_forbidden" },
    });
  });

  it("按已 Replay 的 PlanRisk 重算 Write Set 和 Gate Binding", async () => {
    const planRisk = planRiskArtifact();
    const policy = new TaskBackedCodingTaskAuthorizationPolicy(
      repositoryWith({ artifacts: [planRisk], approvals: [] }),
      fixedClock,
    );
    const result = await policy.resolve(request());

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        historicalLogicChange: false,
        planRisk: {
          artifactId: planRiskArtifactId,
          artifactDigest: planRiskDigest,
          result: GateEvaluationResult.Allow,
          requiredGates: [],
          satisfiedApprovalIds: [],
        },
      },
    });
  });

  it("拒绝与已确认 PlanRisk 不一致的 Write Set", async () => {
    const policy = new TaskBackedCodingTaskAuthorizationPolicy(
      repositoryWith({ artifacts: [planRiskArtifact()], approvals: [] }),
      fixedClock,
    );
    const result = await policy.resolve(request({ writeSet: ["src/other.ts"] }));

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: "operation_forbidden" },
    });
  });
});

function request(overrides: { writeSet?: readonly string[] } = {}) {
  return {
    sourceTaskId,
    workspaceId,
    repositoryId,
    writeSet: overrides.writeSet ?? ["src/index.ts"],
    requested: {
      planRisk: {
        artifactId: planRiskArtifactId,
        artifactDigest: planRiskDigest,
        result: GateEvaluationResult.Allow,
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange: false,
    },
  };
}

function planRiskArtifact(): PlanRiskArtifact {
  return {
    schemaVersion: "1.0.0",
    artifactId: planRiskArtifactId,
    artifactType: ArtifactType.PlanRisk,
    workspaceId,
    taskId: sourceTaskId,
    revision: 1,
    status: ArtifactStatus.Proposed,
    createdAt: "2026-07-12T00:00:00.000Z",
    createdBy: { kind: ActorKind.Human, actorId: "human" },
    digest: planRiskDigest,
    payload: {
      steps: [],
      readSet: [],
      writeSet: ["src/index.ts"],
      risks: [],
      riskLevel: RiskLevel.R1,
      historicalLogicChange: false,
      riskOperations: [],
      testPlan: [],
      rollbackPlan: [],
      requiredGates: [],
    },
  };
}

function repositoryWith(input: {
  artifacts: readonly PlanRiskArtifact[];
  approvals: readonly never[];
}): TaskRepository {
  const aggregate = {
    task: { workspaceId },
    artifacts: input.artifacts,
    approvals: input.approvals,
  } as unknown as TaskAggregate;
  return {
    load: () =>
      Promise.resolve(
        success({
          aggregate,
          lastSequence: 1,
          lastEventHash: "hash",
        }),
      ),
  } as unknown as TaskRepository;
}

const fixedClock = { now: () => new Date("2026-07-12T00:00:00.000Z") };

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试标识解析失败");
  }
  return result.value;
}
