import { describe, expect, it, vi } from "vitest";

import {
  BUSINESS_LOGIC_PROPOSAL_IDEMPOTENCY_PREFIX,
  ConfirmPlanRiskUseCase,
  PLAN_RISK_PROPOSAL_IDEMPOTENCY_PREFIX,
  PlanRiskAnalysisStatus,
  PlanRiskNextStep,
  PlanRiskReviewKind,
  type TaskRepository,
} from "../../src/application/index.js";
import {
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
} from "../../src/common/index.js";
import { ApprovalDecision } from "../../src/domain/approval/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  type BusinessLogicChangeContractArtifact,
} from "../../src/domain/artifact/index.js";
import { GateEvaluationResult, GateId, RiskLevel } from "../../src/domain/policy/index.js";

const CONFIRMATION_DIGEST = `sha256:${"a".repeat(64)}` as ContentDigest;
const BUSINESS_LOGIC_DIGEST = `sha256:${"b".repeat(64)}` as ContentDigest;

describe("ConfirmPlanRiskUseCase", () => {
  it("拒绝 Agent Actor，且不调用任何写入能力", async () => {
    const proposeArtifact = { execute: vi.fn() };
    const recordApproval = { execute: vi.fn() };
    const result = await createUseCase(proposeArtifact, recordApproval).execute({
      ...input(planDocument(RiskLevel.R1)),
      actor: { kind: ActorKind.Agent, actorId: "agent-a" },
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
    expect(proposeArtifact.execute).not.toHaveBeenCalled();
    expect(recordApproval.execute).not.toHaveBeenCalled();
  });

  it("R1 只有 Human confirm 后才提交，但不创建 G4 Approval", async () => {
    const proposal = planDraft(RiskLevel.R1);
    const artifact = {
      artifactType: ArtifactType.PlanRisk,
      artifactId: "plan-a",
      payload: proposal.payload,
    };
    const proposeArtifact = {
      execute: vi.fn(() =>
        Promise.resolve(
          success({
            artifact,
            gateEvaluation: { result: GateEvaluationResult.Allow },
            task: { taskId: "01J00000000000000000000000" },
          }),
        ),
      ),
    };
    const recordApproval = { execute: vi.fn() };
    const result = await createUseCase(proposeArtifact, recordApproval).execute(
      input(planDocument(RiskLevel.R1)),
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.nextStep).toBe(PlanRiskNextStep.CodingTask);
    expect(proposeArtifact.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { kind: ActorKind.Human, actorId: "human-a" },
        proposal,
      }),
    );
    expect(recordApproval.execute).not.toHaveBeenCalled();
  });

  it.each([RiskLevel.R2, RiskLevel.R3])(
    "%s 在同一次 Human confirm 内完成 G4",
    async (riskLevel) => {
      const proposal = planDraft(riskLevel);
      const artifact = {
        artifactType: ArtifactType.PlanRisk,
        artifactId: "plan-a",
        payload: proposal.payload,
      };
      const proposeArtifact = {
        execute: vi.fn(() =>
          Promise.resolve(
            success({
              artifact,
              gateEvaluation: { result: GateEvaluationResult.WaitingHuman },
              decisionRequest: {
                gate: GateId.G4RiskOperation,
                decisionRequestId: "request-g4",
                digest: "sha256:request-g4",
              },
              task: { taskId: "01J00000000000000000000000" },
            }),
          ),
        ),
      };
      const recordApproval = {
        execute: vi.fn(() =>
          Promise.resolve(
            success({
              approval: { approvalId: "approval-g4" },
              gateEvaluation: { result: GateEvaluationResult.Allow },
              task: { taskId: "01J00000000000000000000000" },
            }),
          ),
        ),
      };
      const result = await createUseCase(proposeArtifact, recordApproval).execute(
        input(planDocument(riskLevel)),
      );

      expect(result.status).toBe(ResultStatus.Success);
      expect(recordApproval.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionRequestId: "request-g4",
          decision: ApprovalDecision.Approved,
          actor: { kind: ActorKind.Human, actorId: "human-a" },
        }),
      );
    },
  );

  it("Business Logic Review 完整记录 Human Answers 并完成 G2", async () => {
    const proposal = businessLogicProposal(["空值是否保持旧回退？"]);
    const reviewedProposal = {
      ...proposal,
      payload: { ...proposal.payload, plannedBehavior: ["空值显示未知"] },
    };
    const answers = [{ question: "空值是否保持旧回退？", answer: "不保持，显示未知" }];
    const artifact = {
      artifactType: ArtifactType.BusinessLogicChangeContract,
      artifactId: "business-a",
    };
    const proposeArtifact = {
      execute: vi.fn(() =>
        Promise.resolve(
          success({
            artifact,
            gateEvaluation: { result: GateEvaluationResult.WaitingHuman },
            decisionRequest: {
              gate: GateId.G2BusinessLogic,
              decisionRequestId: "request-g2",
              digest: "sha256:request-g2",
            },
            task: { taskId: "01J00000000000000000000000" },
          }),
        ),
      ),
    };
    const recordApproval = {
      execute: vi.fn(() =>
        Promise.resolve(
          success({
            approval: { approvalId: "approval-g2" },
            gateEvaluation: { result: GateEvaluationResult.Allow },
            task: { taskId: "01J00000000000000000000000" },
          }),
        ),
      ),
    };
    const analysisDocument = {
      ...documentBase(),
      analysisStatus: PlanRiskAnalysisStatus.BusinessLogicReviewRequired,
      proposal,
      humanQuestions: proposal.payload.unknowns,
      reviewDraft: {
        kind: PlanRiskReviewKind.BusinessLogic,
        proposal: reviewedProposal,
        answers,
      },
    };
    const result = await createUseCase(proposeArtifact, recordApproval).execute(
      input(analysisDocument),
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.nextStep).toBe(PlanRiskNextStep.ReanalyzePlanRisk);
    expect(proposeArtifact.execute).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      taskId: "01J00000000000000000000000",
      proposal: {
        ...reviewedProposal,
        payload: { ...reviewedProposal.payload, unknowns: [] },
      },
      actor: { kind: ActorKind.Human, actorId: "human-a" },
      idempotencyKey: `${BUSINESS_LOGIC_PROPOSAL_IDEMPOTENCY_PREFIX}${CONFIRMATION_DIGEST}`,
    });
  });

  it("历史逻辑 PlanRisk 只绑定 Task Replay 中精确 G2 Artifact Digest", async () => {
    const proposal = planDraft(RiskLevel.R3, true);
    const document = {
      ...documentBase(),
      analysisStatus: PlanRiskAnalysisStatus.PlanRiskReviewRequired,
      proposal,
      humanQuestions: [],
      reviewDraft: { kind: PlanRiskReviewKind.PlanRisk, proposal },
    };
    const proposeArtifact = {
      execute: vi.fn((call: { proposal: ReturnType<typeof planDraft> & { payload: object } }) =>
        Promise.resolve(
          success({
            artifact: {
              artifactType: ArtifactType.PlanRisk,
              artifactId: "plan-a",
              payload: call.proposal.payload,
            },
            gateEvaluation: { result: GateEvaluationResult.WaitingHuman },
            decisionRequest: {
              gate: GateId.G4RiskOperation,
              decisionRequestId: "request-g4",
              digest: "sha256:request-g4",
            },
            task: { taskId: "01J00000000000000000000000" },
          }),
        ),
      ),
    };
    const recordApproval = {
      execute: vi.fn(() =>
        Promise.resolve(
          success({
            approval: { approvalId: "approval-g4" },
            gateEvaluation: { result: GateEvaluationResult.Allow },
            task: { taskId: "01J00000000000000000000000" },
          }),
        ),
      ),
    };
    const result = await createUseCase(
      proposeArtifact,
      recordApproval,
      approvedBusinessLogicRepository(),
    ).execute(input(document));

    expect(result.status).toBe(ResultStatus.Success);
    expect(proposeArtifact.execute).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      taskId: "01J00000000000000000000000",
      proposal: {
        ...proposal,
        payload: { ...proposal.payload, businessLogicArtifactDigest: BUSINESS_LOGIC_DIGEST },
      },
      actor: { kind: ActorKind.Human, actorId: "human-a" },
      idempotencyKey: `${PLAN_RISK_PROPOSAL_IDEMPOTENCY_PREFIX}${CONFIRMATION_DIGEST}`,
    });
    expect(JSON.stringify(document)).not.toContain(BUSINESS_LOGIC_DIGEST);
  });

  it("R4 在写入前 fail closed", async () => {
    const proposeArtifact = { execute: vi.fn() };
    const recordApproval = { execute: vi.fn() };
    const result = await createUseCase(proposeArtifact, recordApproval).execute(
      input(planDocument(RiskLevel.R4)),
    );

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) return;
    expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
    expect(proposeArtifact.execute).not.toHaveBeenCalled();
  });
});

function createUseCase(
  proposeArtifact: unknown,
  recordApproval: unknown,
  repository: TaskRepository = {} as TaskRepository,
) {
  return new ConfirmPlanRiskUseCase(
    repository,
    proposeArtifact as ConstructorParameters<typeof ConfirmPlanRiskUseCase>[1],
    recordApproval as ConstructorParameters<typeof ConfirmPlanRiskUseCase>[2],
    { calculate: () => success(CONFIRMATION_DIGEST) },
  );
}

function input(analysisDocument: unknown) {
  return {
    workspaceId: "workspace-a",
    taskId: "01J00000000000000000000000",
    repositoryId: "repo-a",
    analysisDocument,
    actor: { kind: ActorKind.Human, actorId: "human-a" },
  };
}

function documentBase() {
  return {
    workspaceId: "workspace-a",
    taskId: "01J00000000000000000000000",
    repositoryId: "repo-a",
  };
}

function planDocument(riskLevel: RiskLevel, historicalLogicChange = false) {
  const proposal = planDraft(riskLevel, historicalLogicChange);
  return {
    ...documentBase(),
    analysisStatus: PlanRiskAnalysisStatus.PlanRiskReviewRequired,
    proposal,
    humanQuestions: [],
    reviewDraft: { kind: PlanRiskReviewKind.PlanRisk, proposal },
  };
}

function planDraft(riskLevel: RiskLevel, historicalLogicChange = false) {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "修改状态组件" }],
      readSet: ["src/status.ts"],
      writeSet: ["src/status.ts"],
      risks: [{ description: "状态不一致", mitigation: "增加测试" }],
      riskLevel,
      historicalLogicChange,
      riskOperations:
        riskLevel === RiskLevel.R2 || riskLevel === RiskLevel.R3
          ? [{ target: "src/status.ts", reason: "改变运行行为" }]
          : [],
      testPlan: ["运行状态组件单元测试"],
      rollbackPlan: ["回退提交"],
      requiredGates:
        riskLevel === RiskLevel.R2 || riskLevel === RiskLevel.R3 ? [GateId.G4RiskOperation] : [],
    },
  };
}

function businessLogicProposal(unknowns: readonly string[]) {
  return {
    artifactType: ArtifactType.BusinessLogicChangeContract,
    status: ArtifactStatus.Proposed,
    payload: {
      currentBehavior: { facts: [], inferences: [] },
      plannedBehavior: ["待 Human 确认"],
      differences: ["空值行为变化"],
      affectedConsumers: ["状态组件用户"],
      invariants: ["非空行为不变"],
      rollback: ["恢复旧行为"],
      evidence: [],
      unknowns,
    },
  };
}

function approvedBusinessLogicRepository(): TaskRepository {
  const artifact = {
    artifactId: "business-a",
    artifactType: ArtifactType.BusinessLogicChangeContract,
    digest: BUSINESS_LOGIC_DIGEST,
    payload: businessLogicProposal([]).payload,
  } as unknown as BusinessLogicChangeContractArtifact;
  return {
    load: () =>
      Promise.resolve(
        success({
          aggregate: {
            artifacts: [artifact],
            approvals: [
              {
                gate: GateId.G2BusinessLogic,
                decision: ApprovalDecision.Approved,
                artifactId: artifact.artifactId,
                artifactDigest: artifact.digest,
              },
            ],
          },
        }),
      ),
  } as unknown as TaskRepository;
}
