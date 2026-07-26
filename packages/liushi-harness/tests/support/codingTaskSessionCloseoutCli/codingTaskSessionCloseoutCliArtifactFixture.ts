import {
  ApprovalDecision,
  ArtifactStatus,
  ArtifactType,
  ActorKind,
  GateEvaluationResult,
  ResultStatus,
  RiskLevel,
  type CodingTaskExecutionAuthorization,
  type GateEvaluation,
  type PlanRiskArtifact,
} from "../../../src/index.js";
import type { createHarnessApplication } from "../../../src/index.js";

import {
  CLOSEOUT_CLI_REPOSITORY_ID,
  CLOSEOUT_CLI_SOURCE_TASK_ID,
  CLOSEOUT_CLI_WORKSPACE_ID,
  CLOSEOUT_CLI_WRITE_SET,
} from "./codingTaskSessionCloseoutCliConstants.js";

/** 通过生产 Artifact/Approval API 创建严格绑定的执行授权。 */
export async function createCloseoutCliApprovedAuthorization(
  application: ReturnType<typeof createHarnessApplication>,
): Promise<CodingTaskExecutionAuthorization> {
  const task = await application.createTask.execute({
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    source: "coding-task-session-closeout-cli-e2e",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  if (task.status !== ResultStatus.Success) throw task.error;
  const requirement = await application.proposeArtifact.execute({
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    taskId: CLOSEOUT_CLI_SOURCE_TASK_ID,
    actor: { kind: ActorKind.Human, actorId: "human" },
    proposal: requirementProposal(),
  });
  if (
    requirement.status !== ResultStatus.Success ||
    requirement.value.decisionRequest === undefined
  )
    throw new Error("RequirementContract 必须产生 G1 DecisionRequest。");
  const requirementApproval = await application.recordApproval.execute({
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    taskId: CLOSEOUT_CLI_SOURCE_TASK_ID,
    decisionRequestId: requirement.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: requirement.value.decisionRequest.digest,
    idempotencyKey: "closeout-cli-requirement-approval",
    actor: { kind: ActorKind.Human, actorId: "human" },
    decision: ApprovalDecision.Approved,
  });
  if (requirementApproval.status !== ResultStatus.Success) throw requirementApproval.error;
  const plan = await application.proposeArtifact.execute({
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    taskId: CLOSEOUT_CLI_SOURCE_TASK_ID,
    actor: { kind: ActorKind.Human, actorId: "human" },
    proposal: planRiskProposal(),
  });
  if (plan.status !== ResultStatus.Success || plan.value.decisionRequest === undefined)
    throw new Error("PlanRisk 必须产生 G4 DecisionRequest。");
  if (plan.value.artifact.artifactType !== ArtifactType.PlanRisk)
    throw new Error("PlanRisk Proposal 返回了错误的 Artifact 类型。");
  const planApproval = await application.recordApproval.execute({
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    taskId: CLOSEOUT_CLI_SOURCE_TASK_ID,
    decisionRequestId: plan.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: plan.value.decisionRequest.digest,
    idempotencyKey: "closeout-cli-plan-risk-approval",
    actor: { kind: ActorKind.Human, actorId: "human" },
    decision: ApprovalDecision.Approved,
  });
  if (planApproval.status !== ResultStatus.Success) throw planApproval.error;
  return createExecutionAuthorization(plan.value.artifact, planApproval.value.gateEvaluation);
}

function requirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "修改受管示例导出并形成可审查交付物。",
      goals: ["通过 Session Closeout 生成唯一 Git Checkpoint。"],
      nonGoals: ["自动创建 PR。"],
      observableBehaviors: ["src/index.ts 的导出值变为 2。"],
      acceptanceCriteria: ["Closeout 状态进入 CheckpointBound。"],
      includedScopes: ["src/index.ts"],
      forbiddenScopes: ["其他文件"],
      repositories: [CLOSEOUT_CLI_REPOSITORY_ID],
      edgeCases: ["重复执行同一 Closeout Command"],
      compatibilityConstraints: ["保持单一 Git checkpoint"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function planRiskProposal() {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "修改 src/index.ts。" }],
      readSet: CLOSEOUT_CLI_WRITE_SET,
      writeSet: CLOSEOUT_CLI_WRITE_SET,
      risks: [
        { description: "导出值变化需要人工确认。", mitigation: "检查 Git diff 与 Hook Evidence。" },
      ],
      riskLevel: RiskLevel.R2,
      historicalLogicChange: false,
      riskOperations: [{ target: "src/index.ts", reason: "修改受管示例实现。" }],
      testPlan: ["验证 Hook Journal、Trace 与 Git Snapshot。"],
      rollbackPlan: ["由 Human 审查并回退唯一 checkpoint。"],
      requiredGates: [],
    },
  };
}

function createExecutionAuthorization(
  planRisk: PlanRiskArtifact,
  evaluation: GateEvaluation,
): CodingTaskExecutionAuthorization {
  if (
    evaluation.result !== GateEvaluationResult.Allow ||
    evaluation.artifactId !== planRisk.artifactId ||
    evaluation.artifactDigest !== planRisk.digest
  ) {
    throw new Error("PlanRisk Approval 未精确绑定执行授权。");
  }
  return {
    planRisk: {
      artifactId: planRisk.artifactId,
      artifactDigest: planRisk.digest,
      result: evaluation.result,
      requiredGates: evaluation.requiredGates,
      satisfiedApprovalIds: evaluation.satisfiedApprovals,
    },
    historicalLogicChange: false,
  };
}
