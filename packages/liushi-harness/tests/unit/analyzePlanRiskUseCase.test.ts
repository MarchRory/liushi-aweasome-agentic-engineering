import { describe, expect, it, vi } from "vitest";

import {
  AnalyzePlanRiskUseCase,
  PlanRiskAnalysisStatus,
  PlanRiskReviewKind,
  type PlanRiskAnalysisAgent,
  type RepositoryRootResolverPort,
  type TaskRepository,
} from "../../src/application/index.js";
import { ActorKind, ResultStatus, success } from "../../src/common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  type BusinessLogicChangeContractArtifact,
  type RequirementContractArtifact,
} from "../../src/domain/artifact/index.js";
import { EvidenceKind } from "../../src/domain/evidence/index.js";
import type { TaskAggregateRecord } from "../../src/domain/taskRun/index.js";
import { ApprovalDecision } from "../../src/domain/approval/index.js";
import { GateId, RiskLevel } from "../../src/domain/policy/index.js";
import { TaskCheckpoint } from "../../src/domain/taskRun/index.js";

describe("AnalyzePlanRiskUseCase", () => {
  it("从精确 G1 Requirement 生成不写 Store 的 R1 PlanRisk Review", async () => {
    const load = vi.fn(() => Promise.resolve(success(requirementApprovedRecord())));
    const append = vi.fn();
    const analyze = vi.fn(() =>
      Promise.resolve(
        success({
          analysisKind: PlanRiskReviewKind.PlanRisk,
          businessLogicProposal: null,
          planRiskProposal: planRiskDraft(),
        }),
      ),
    );
    const result = await new AnalyzePlanRiskUseCase(
      { load, append } as unknown as TaskRepository,
      rootResolver(),
      { analyze } satisfies PlanRiskAnalysisAgent,
    ).execute(input());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.analysisStatus).toBe(PlanRiskAnalysisStatus.PlanRiskReviewRequired);
    expect(result.value.reviewDraft).toEqual({
      kind: PlanRiskReviewKind.PlanRisk,
      proposal: planRiskDraft(),
    });
    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryId: "repo-a", requirement: requirement().payload }),
    );
    expect(append).not.toHaveBeenCalled();
  });

  it("识别历史逻辑时先生成带 Human Questions 的 Business Logic Review", async () => {
    const proposal = businessLogicProposal(["旧版空值是否继续回退？"]);
    const agent: PlanRiskAnalysisAgent = {
      analyze: () =>
        Promise.resolve(
          success({
            analysisKind: PlanRiskReviewKind.BusinessLogic,
            businessLogicProposal: proposal,
            planRiskProposal: null,
          }),
        ),
    };
    const result = await new AnalyzePlanRiskUseCase(
      repository(requirementApprovedRecord()),
      rootResolver(),
      agent,
    ).execute(input());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.analysisStatus).toBe(PlanRiskAnalysisStatus.BusinessLogicReviewRequired);
    expect(result.value.humanQuestions).toEqual(["旧版空值是否继续回退？"]);
    expect(result.value.reviewDraft).toEqual({
      kind: PlanRiskReviewKind.BusinessLogic,
      proposal,
      answers: [{ question: "旧版空值是否继续回退？", answer: "" }],
    });
  });

  it("G2 已批准后只接受 historicalLogicChange=true 的 PlanRisk", async () => {
    const result = await new AnalyzePlanRiskUseCase(
      repository(businessLogicApprovedRecord()),
      rootResolver(),
      {
        analyze: () =>
          Promise.resolve(
            success({
              analysisKind: PlanRiskReviewKind.PlanRisk,
              businessLogicProposal: null,
              planRiskProposal: planRiskDraft({
                riskLevel: RiskLevel.R1,
                historicalLogicChange: false,
              }),
            }),
          ),
      },
    ).execute(input());

    expect(result.status).toBe(ResultStatus.Failure);
  });
});

function input() {
  return {
    workspaceId: "workspace-a",
    taskId: "01J00000000000000000000000",
    repositoryId: "repo-a",
  };
}

function rootResolver(): RepositoryRootResolverPort {
  return {
    resolve: () => Promise.resolve(success({ repositoryRoot: "C:\\workspace\\repo-a" })),
  };
}

function repository(record: unknown): TaskRepository {
  return {
    load: () => Promise.resolve(success(record as TaskAggregateRecord)),
  } as unknown as TaskRepository;
}

function requirementApprovedRecord() {
  const artifact = requirement();
  return {
    aggregate: {
      checkpoint: TaskCheckpoint.RequirementApproved,
      artifacts: [artifact],
      approvals: [
        {
          approvalId: "approval-g1",
          gate: GateId.G1Requirement,
          decision: ApprovalDecision.Approved,
          artifactId: artifact.artifactId,
          artifactDigest: artifact.digest,
        },
      ],
    },
  };
}

function businessLogicApprovedRecord() {
  const record = requirementApprovedRecord();
  const artifact = businessLogicArtifact();
  return {
    aggregate: {
      ...record.aggregate,
      checkpoint: TaskCheckpoint.BusinessLogicApproved,
      artifacts: [...record.aggregate.artifacts, artifact],
      approvals: [
        ...record.aggregate.approvals,
        {
          approvalId: "approval-g2",
          gate: GateId.G2BusinessLogic,
          decision: ApprovalDecision.Approved,
          artifactId: artifact.artifactId,
          artifactDigest: artifact.digest,
        },
      ],
    },
  };
}

function requirement(): RequirementContractArtifact {
  return {
    schemaVersion: "1.0.0",
    artifactId: "artifact-requirement",
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    workspaceId: "workspace-a",
    taskId: "01J00000000000000000000000",
    revision: 1,
    createdAt: "2026-08-02T00:00:00.000Z",
    createdBy: { kind: ActorKind.Human, actorId: "human-a" },
    digest: `sha256:${"1".repeat(64)}`,
    payload: {
      problem: "需要增加可观察状态",
      goals: ["显示状态"],
      nonGoals: ["修改权限模型"],
      observableBehaviors: ["用户看到状态"],
      acceptanceCriteria: ["状态与后端一致"],
      includedScopes: ["src/status.ts"],
      forbiddenScopes: ["src/auth.ts"],
      repositories: ["repo-a"],
      edgeCases: [],
      compatibilityConstraints: ["保持旧行为"],
      evidence: [],
      claims: [],
      unknowns: [],
    },
  } as unknown as RequirementContractArtifact;
}

function businessLogicArtifact(): BusinessLogicChangeContractArtifact {
  return {
    schemaVersion: "1.0.0",
    artifactId: "artifact-business",
    artifactType: ArtifactType.BusinessLogicChangeContract,
    status: ArtifactStatus.Proposed,
    workspaceId: "workspace-a",
    taskId: "01J00000000000000000000000",
    revision: 1,
    createdAt: "2026-08-02T00:00:00.000Z",
    createdBy: { kind: ActorKind.Human, actorId: "human-a" },
    digest: `sha256:${"2".repeat(64)}`,
    payload: businessLogicProposal([]).payload,
  } as unknown as BusinessLogicChangeContractArtifact;
}

function businessLogicProposal(unknowns: readonly string[]) {
  return {
    artifactType: ArtifactType.BusinessLogicChangeContract,
    status: ArtifactStatus.Proposed,
    payload: {
      currentBehavior: { facts: [], inferences: [] },
      plannedBehavior: ["空值显示未知"],
      differences: ["不再静默回退"],
      affectedConsumers: ["状态组件用户"],
      invariants: ["非空值行为不变"],
      rollback: ["恢复旧组件"],
      evidence: [
        {
          evidenceId: "status-source",
          kind: EvidenceKind.File,
          source: "repository",
          title: "状态组件",
          locator: "src/status.ts",
        },
      ],
      unknowns,
    },
  };
}

function planRiskDraft(overrides: Partial<ReturnType<typeof basePlanPayload>> = {}) {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: { ...basePlanPayload(), ...overrides },
  };
}

function basePlanPayload() {
  return {
    steps: [{ order: 1, action: "修改状态组件" }],
    readSet: ["src/status.ts"],
    writeSet: ["src/status.ts"],
    risks: [{ description: "文案不一致", mitigation: "增加单元测试" }],
    riskLevel: RiskLevel.R1,
    historicalLogicChange: false,
    riskOperations: [],
    testPlan: ["运行状态组件单元测试"],
    rollbackPlan: ["回退提交"],
    requiredGates: [],
  };
}
