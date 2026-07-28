import type { ArtifactDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ActorRef,
  type Result,
} from "#common/index.js";
import type { DecisionRequest } from "#domain/approval/index.js";
import {
  MAX_ARTIFACT_PROPOSAL_IDEMPOTENCY_KEY_LENGTH,
  type ArtifactProposal,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import { evaluateArtifactGate, type GateEvaluation } from "#domain/gate/index.js";
import type { TaskState } from "#domain/task/index.js";
import type { TaskAggregateRecord } from "#domain/taskRun/index.js";

/** 已提交 Proposal 可安全重放给调用方的最小结果。 */
export interface ArtifactProposalReplay {
  /** 首次提交生成的不可变 Artifact。 */
  readonly artifact: SupportedArtifact;
  /** 基于当前权威 Approval 集合重算的 Gate 结果。 */
  readonly gateEvaluation: GateEvaluation;
  /** Artifact 仍在等待 Human 时的唯一 DecisionRequest。 */
  readonly decisionRequest?: DecisionRequest;
  /** 当前权威 Task State。 */
  readonly task: TaskState;
}

/** 校验可选 Proposal 幂等键，不对外部输入做隐式修剪。 */
export function parseArtifactProposalIdempotencyKey(
  value: unknown,
): Result<string | undefined, HarnessError> {
  if (value === undefined) return success(undefined);
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ARTIFACT_PROPOSAL_IDEMPOTENCY_KEY_LENGTH ||
    value !== value.trim() ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Artifact Proposal idempotencyKey 缺失或无效。",
      ),
    );
  }
  return success(value);
}

/** 对已提交的同键 Proposal 做精确内容校验，并返回可安全重放的原结果。 */
export function replayArtifactProposal(input: {
  readonly record: TaskAggregateRecord;
  readonly proposal: ArtifactProposal;
  readonly actor: ActorRef;
  readonly idempotencyKey: string | undefined;
  readonly digestPort: ArtifactDigestPort;
}): Result<ArtifactProposalReplay | undefined, HarnessError> {
  if (input.idempotencyKey === undefined) return success(undefined);
  const artifact = input.record.aggregate.artifacts.find(
    (candidate) => candidate.proposalIdempotencyKey === input.idempotencyKey,
  );
  if (artifact === undefined) return success(undefined);

  const incomingIdentity = input.digestPort.calculate({
    artifactType: input.proposal.artifactType,
    status: input.proposal.status,
    payload: input.proposal.payload,
    actor: input.actor,
  });
  if (incomingIdentity.status === ResultStatus.Failure) return incomingIdentity;
  const existingIdentity = input.digestPort.calculate({
    artifactType: artifact.artifactType,
    status: artifact.status,
    payload: artifact.payload,
    actor: artifact.createdBy,
  });
  if (existingIdentity.status === ResultStatus.Failure) return existingIdentity;
  if (incomingIdentity.value !== existingIdentity.value) {
    return failure(
      new HarnessError(
        HarnessErrorCode.ActionConflict,
        "Artifact Proposal idempotencyKey 已绑定不同内容或 Actor。",
      ),
    );
  }

  const pendingDecision = input.record.aggregate.pendingDecision;
  const matchingPendingDecision =
    pendingDecision?.artifactId === artifact.artifactId &&
    pendingDecision.artifactDigest === artifact.digest
      ? pendingDecision
      : undefined;
  const matchingApproval = [...input.record.aggregate.approvals]
    .reverse()
    .find(
      (approval) =>
        approval.artifactId === artifact.artifactId && approval.artifactDigest === artifact.digest,
    );
  const evaluatedAt =
    matchingPendingDecision?.createdAt ?? matchingApproval?.createdAt ?? artifact.createdAt;
  return success({
    artifact,
    gateEvaluation: evaluateArtifactGate(artifact, input.record.aggregate.approvals, evaluatedAt),
    ...(matchingPendingDecision === undefined ? {} : { decisionRequest: matchingPendingDecision }),
    task: input.record.aggregate.task,
  });
}
