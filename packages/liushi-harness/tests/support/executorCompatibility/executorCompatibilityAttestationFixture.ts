import {
  APPROVAL_RECORD_SCHEMA_VERSION,
  DECISION_REQUEST_SCHEMA_VERSION,
  ActorKind,
  ResultStatus,
} from "../../../src/common/index.js";
import {
  ApprovalDecision,
  parseApprovalId,
  parseDecisionRequestId,
  type ApprovalRecord,
  type ApprovalRecordDigestInput,
  type DecisionRequest,
  type DecisionRequestDigestInput,
} from "../../../src/domain/approval/index.js";
import { parseArtifactId } from "../../../src/domain/artifact/index.js";
import {
  EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_ACTION,
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVED_CHECKPOINT,
  ExecutorCompatibilityCertificateIdentityKind,
  ExecutorCompatibilityPublicationTargetKind,
  SIGSTORE_BUILD_SIGNER_URI_OID,
  SIGSTORE_RUNNER_ENVIRONMENT_OID,
  SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  SIGSTORE_SOURCE_REPOSITORY_URI_OID,
  createExecutorCompatibilityPublisherIdentityPolicy,
  createExecutorCompatibilityReleaseAttestationDraft,
  createExecutorCompatibilityReleaseCandidate,
  type CreateExecutorCompatibilityPublisherIdentityPolicyInput,
  type ExecutorCompatibilityPublicationTarget,
} from "../../../src/domain/executorCompatibilityAttestation/index.js";
import { GateId, RiskLevel } from "../../../src/domain/policy/index.js";
import { TaskPhase, parseTaskId } from "../../../src/domain/task/index.js";

import { createExecutorCompatibilityPublicationFixture } from "./executorCompatibilityPublicationFixture.js";

const ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
const DECISION_REQUEST_ID = "01ARZ3NDEKTSV4RRFFQ69G5FC0";
const APPROVAL_ID = "01ARZ3NDEKTSV4RRFFQ69G5FD0";
const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CREATED_AT = "2026-07-16T00:00:00.000Z";

/** 测试使用的固定 GitHub Actions Workflow Identity。 */
export const executorCompatibilityAttestationWorkflowIdentity =
  "https://github.com/MarchRory/liushi-aweasome-agentic-engineering/.github/workflows/release.yml@refs/heads/main";

async function createAttestationFixture() {
  const publication = await createExecutorCompatibilityPublicationFixture();
  const policyInput = createPublisherIdentityPolicyInput(
    publication.releaseSubject.repositoryUri,
    publication.releaseSubject.sourceRevision,
  );
  const publisherIdentityPolicy = createExecutorCompatibilityPublisherIdentityPolicy(
    policyInput,
    publication.digest,
  );
  if (publisherIdentityPolicy.status === ResultStatus.Failure) {
    throw publisherIdentityPolicy.error;
  }
  const target: ExecutorCompatibilityPublicationTarget = {
    kind: ExecutorCompatibilityPublicationTargetKind.NpmRegistry,
    uri: "https://registry.npmjs.org/liushi-harness",
  };
  const releaseCandidate = createExecutorCompatibilityReleaseCandidate(
    {
      bundle: publication.bundle,
      publisherIdentityPolicy: publisherIdentityPolicy.value,
      target,
    },
    publication.digest,
  );
  if (releaseCandidate.status === ResultStatus.Failure) throw releaseCandidate.error;
  const decisionRequest = createDecisionRequest(
    releaseCandidate.value.candidateDigest,
    publication,
  );
  const approvalRecord = createApprovalRecord(decisionRequest, publication);
  const draft = createExecutorCompatibilityReleaseAttestationDraft(
    {
      bundle: publication.bundle,
      publisherIdentityPolicy: publisherIdentityPolicy.value,
      releaseCandidate: releaseCandidate.value,
      decisionRequest,
      approvalRecord,
    },
    publication.digest,
  );
  if (draft.status === ResultStatus.Failure) throw draft.error;
  return {
    ...publication,
    ...draft.value,
    policyInput,
    target,
  };
}

/** Executor Compatibility Attestation Fixture 的稳定静态类型。 */
export type ExecutorCompatibilityAttestationFixture = Awaited<
  ReturnType<typeof createAttestationFixture>
>;

/** 创建完整但不调用网络或真实签名服务的 Attestation Fixture。 */
export function createExecutorCompatibilityAttestationFixture(): Promise<ExecutorCompatibilityAttestationFixture> {
  return createAttestationFixture();
}

/** 创建按反向顺序输入、由 Domain 负责规范化的 Identity Policy 候选。 */
export function createPublisherIdentityPolicyInput(
  repositoryUri: string,
  sourceRevision: string,
  workflowIdentity = executorCompatibilityAttestationWorkflowIdentity,
): CreateExecutorCompatibilityPublisherIdentityPolicyInput {
  return {
    schemaVersion: EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
    certificateIssuer: "https://token.actions.githubusercontent.com",
    certificateIdentity: {
      kind: ExecutorCompatibilityCertificateIdentityKind.Uri,
      value: workflowIdentity,
    },
    certificateExtensions: [
      { oid: SIGSTORE_SOURCE_REPOSITORY_URI_OID, value: repositoryUri },
      { oid: SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID, value: sourceRevision },
      { oid: SIGSTORE_BUILD_SIGNER_URI_OID, value: workflowIdentity },
      { oid: SIGSTORE_RUNNER_ENVIRONMENT_OID, value: "github-hosted" },
    ].reverse(),
    ctLogThreshold: 1,
    tlogThreshold: 1,
  };
}

/** 对变更后的 DecisionRequest 重新计算真实 Digest。 */
export function withDecisionRequestDigest(
  decisionRequest: DecisionRequest,
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityPublicationFixture>>,
): DecisionRequest {
  const digest = fixture.digest.calculate(createDecisionRequestDigestInput(decisionRequest));
  if (digest.status === ResultStatus.Failure) throw digest.error;
  return { ...decisionRequest, digest: digest.value };
}

/** 对变更后的 ApprovalRecord 重新计算真实 Digest。 */
export function withApprovalRecordDigest(
  approvalRecord: ApprovalRecord,
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityPublicationFixture>>,
): ApprovalRecord {
  const digest = fixture.digest.calculate(createApprovalRecordDigestInput(approvalRecord));
  if (digest.status === ResultStatus.Failure) throw digest.error;
  return { ...approvalRecord, digest: digest.value };
}

function createDecisionRequest(
  candidateDigest: DecisionRequest["artifactDigest"],
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityPublicationFixture>>,
): DecisionRequest {
  const artifactId = parseArtifactId(ARTIFACT_ID);
  const decisionRequestId = parseDecisionRequestId(DECISION_REQUEST_ID);
  const taskId = parseTaskId(TASK_ID);
  if (artifactId.status === ResultStatus.Failure) throw artifactId.error;
  if (decisionRequestId.status === ResultStatus.Failure) throw decisionRequestId.error;
  if (taskId.status === ResultStatus.Failure) throw taskId.error;
  return withDecisionRequestDigest(
    {
      schemaVersion: DECISION_REQUEST_SCHEMA_VERSION,
      decisionRequestId: decisionRequestId.value,
      taskId: taskId.value,
      gate: GateId.G6MergeRelease,
      artifactId: artifactId.value,
      artifactDigest: candidateDigest,
      riskLevel: RiskLevel.R4,
      resumePhase: TaskPhase.Review,
      resumeCheckpoint: EXECUTOR_COMPATIBILITY_RELEASE_APPROVED_CHECKPOINT,
      requiredAction: EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_ACTION,
      digest: fixture.releaseSubject.packageDigest,
      createdAt: CREATED_AT,
      createdBy: { kind: ActorKind.Agent, actorId: "release-planner" },
    },
    fixture,
  );
}

function createApprovalRecord(
  decisionRequest: DecisionRequest,
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityPublicationFixture>>,
): ApprovalRecord {
  const approvalId = parseApprovalId(APPROVAL_ID);
  if (approvalId.status === ResultStatus.Failure) throw approvalId.error;
  return withApprovalRecordDigest(
    {
      schemaVersion: APPROVAL_RECORD_SCHEMA_VERSION,
      approvalId: approvalId.value,
      decisionRequestId: decisionRequest.decisionRequestId,
      decisionRequestDigest: decisionRequest.digest,
      gate: GateId.G6MergeRelease,
      artifactId: decisionRequest.artifactId,
      artifactDigest: decisionRequest.artifactDigest,
      idempotencyKey: "executor-compatibility-release-approval",
      actor: { kind: ActorKind.Human, actorId: "release-reviewer" },
      decision: ApprovalDecision.Approved,
      createdAt: CREATED_AT,
      digest: fixture.releaseSubject.packageDigest,
    },
    fixture,
  );
}

function createDecisionRequestDigestInput(request: DecisionRequest): DecisionRequestDigestInput {
  return {
    schemaVersion: request.schemaVersion,
    decisionRequestId: request.decisionRequestId,
    taskId: request.taskId,
    gate: request.gate,
    artifactId: request.artifactId,
    artifactDigest: request.artifactDigest,
    riskLevel: request.riskLevel,
    resumePhase: request.resumePhase,
    resumeCheckpoint: request.resumeCheckpoint,
    requiredAction: request.requiredAction,
    createdAt: request.createdAt,
    createdBy: request.createdBy,
  };
}

function createApprovalRecordDigestInput(approval: ApprovalRecord): ApprovalRecordDigestInput {
  return {
    schemaVersion: approval.schemaVersion,
    approvalId: approval.approvalId,
    decisionRequestId: approval.decisionRequestId,
    decisionRequestDigest: approval.decisionRequestDigest,
    gate: approval.gate,
    artifactId: approval.artifactId,
    artifactDigest: approval.artifactDigest,
    idempotencyKey: approval.idempotencyKey,
    actor: approval.actor,
    decision: approval.decision,
    ...(approval.reason === undefined ? {} : { reason: approval.reason }),
    createdAt: approval.createdAt,
  };
}
