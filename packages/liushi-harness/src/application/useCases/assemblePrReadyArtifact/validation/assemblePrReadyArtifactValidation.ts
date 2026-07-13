import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ArtifactType,
  type BusinessLogicChangeContractArtifact,
  type PlanRiskArtifact,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import {
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  parseCodingTaskId,
  type CodingTaskAggregate,
  type CodingTaskAttempt,
} from "#domain/codingTask/index.js";
import { GateEvaluationResult } from "#domain/policy/index.js";
import { VerificationStatus, type EvidenceBundle } from "#domain/verification/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import type { AssemblePrReadyArtifactInput } from "../contracts/index.js";

const INPUT_FIELDS = ["workspaceId", "codingTaskId", "verificationRunId"] as const;
const VERIFICATION_RUN_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;

/** 已完成且具有完整交付身份的 CodingTask Attempt。 */
export type CompletedCodingTaskAttempt = CodingTaskAttempt & {
  readonly targetRevision: string;
  readonly changedPaths: readonly string[];
};

/** 严格校验调用方只提供 Evidence Bundle 定位字段。 */
export function validateAssemblePrReadyArtifactInput(
  input: unknown,
): Result<AssemblePrReadyArtifactInput, HarnessError> {
  if (!isRecord(input) || !hasExactFields(input, INPUT_FIELDS)) {
    return invalidInput("PR-ready Artifact 输入无效。");
  }
  if (
    typeof input["workspaceId"] !== "string" ||
    typeof input["codingTaskId"] !== "string" ||
    typeof input["verificationRunId"] !== "string" ||
    !VERIFICATION_RUN_ID_PATTERN.test(input["verificationRunId"])
  ) {
    return invalidInput("PR-ready Artifact 输入身份无效。");
  }
  const workspaceId = parseWorkspaceId(input["workspaceId"]);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const codingTaskId = parseCodingTaskId(input["codingTaskId"]);
  if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
  return success({
    workspaceId: workspaceId.value,
    codingTaskId: codingTaskId.value,
    verificationRunId: input["verificationRunId"],
  });
}

/** 校验 CodingTask 已完成且最新 Attempt 已通过验证。 */
export function validateCompletedCodingTask(
  aggregate: CodingTaskAggregate,
): Result<CompletedCodingTaskAttempt, HarnessError> {
  const attempt = aggregate.attempts.at(-1);
  if (
    aggregate.runState !== CodingTaskRunState.Completed ||
    attempt?.verificationOutcome !== CodingTaskVerificationOutcome.Passed ||
    attempt.targetRevision === undefined ||
    attempt.targetRevision.length === 0 ||
    attempt.changedPaths === undefined ||
    attempt.changedPaths.length === 0
  ) {
    return invalidState("CodingTask 尚未形成已通过验证的完整交付状态。");
  }
  return success({
    ...attempt,
    targetRevision: attempt.targetRevision,
    changedPaths: attempt.changedPaths,
  });
}

/** 校验强一致读取的 Evidence 与权威 CodingTask 完全绑定。 */
export function validatePrReadyEvidence(
  evidence: EvidenceBundle,
  verificationRunId: string,
  aggregate: CodingTaskAggregate,
  attempt: CompletedCodingTaskAttempt,
): Result<EvidenceBundle, HarnessError> {
  if (evidence.status !== VerificationStatus.Passed) {
    return invalidState("EvidenceBundle 尚未通过验证。");
  }
  if (
    evidence.verificationRunId !== verificationRunId ||
    evidence.repositoryId !== aggregate.repositoryId ||
    evidence.worktreeId !== aggregate.worktreeBinding.worktreeId ||
    evidence.baseRevision !== aggregate.baseRevision ||
    evidence.targetRevision !== attempt.targetRevision
  ) {
    return invalidInput("EvidenceBundle 与 CodingTask Revision 身份不匹配。");
  }
  return success(evidence);
}

/** 校验来源 Task 中与 CodingTask 缓存绑定完全一致的授权 Artifact。 */
export function validatePrReadyAuthorizationArtifacts(
  aggregate: CodingTaskAggregate,
  artifacts: readonly SupportedArtifact[],
): Result<PlanRiskArtifact, HarnessError> {
  const authorization = aggregate.executionAuthorization;
  if (authorization.planRisk.result !== GateEvaluationResult.Allow) {
    return forbidden("PlanRisk Gate Binding 未达到 allow。");
  }
  const planRisk = artifacts.find(
    (artifact): artifact is PlanRiskArtifact =>
      artifact.artifactType === ArtifactType.PlanRisk &&
      artifact.artifactId === authorization.planRisk.artifactId &&
      artifact.digest === authorization.planRisk.artifactDigest,
  );
  if (
    planRisk === undefined ||
    planRisk.workspaceId !== aggregate.workspaceId ||
    planRisk.taskId !== aggregate.sourceTaskId
  ) {
    return forbidden("CodingTask 未绑定来源 Task 中的精确 PlanRisk Artifact。");
  }
  if (planRisk.payload.historicalLogicChange !== authorization.historicalLogicChange) {
    return forbidden("CodingTask 与 PlanRisk 的历史业务逻辑声明不一致。");
  }
  if (!authorization.historicalLogicChange) {
    return authorization.businessLogic === undefined
      ? success(planRisk)
      : forbidden("非历史业务逻辑变更不能携带 Business Logic Binding。");
  }
  const businessBinding = authorization.businessLogic;
  if (
    businessBinding === undefined ||
    businessBinding.result !== GateEvaluationResult.Allow ||
    planRisk.payload.businessLogicArtifactDigest !== businessBinding.artifactDigest
  ) {
    return forbidden("历史业务逻辑变更缺少精确且已允许的 Business Logic Binding。");
  }
  const businessLogic = artifacts.find(
    (artifact): artifact is BusinessLogicChangeContractArtifact =>
      artifact.artifactType === ArtifactType.BusinessLogicChangeContract &&
      artifact.artifactId === businessBinding.artifactId &&
      artifact.digest === businessBinding.artifactDigest,
  );
  return businessLogic !== undefined &&
    businessLogic.workspaceId === aggregate.workspaceId &&
    businessLogic.taskId === aggregate.sourceTaskId
    ? success(planRisk)
    : forbidden("来源 Task 缺少精确 Business Logic Artifact。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(input: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(input);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(input, field));
}

function invalidInput(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}

function invalidState(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidStateTransition, message));
}

function forbidden(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
