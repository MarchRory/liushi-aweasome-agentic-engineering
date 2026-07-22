import {
  APPROVAL_RECORD_SCHEMA_VERSION,
  ActorKind,
  DECISION_REQUEST_SCHEMA_VERSION,
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
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_APPROVAL_ACTION,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_APPROVED_CHECKPOINT,
  createExecutorCompatibilityReleaseManifestAttestationDraft,
} from "../../../src/domain/executorCompatibilityReleaseManifestAttestation/index.js";
import { GateId, RiskLevel } from "../../../src/domain/policy/index.js";
import { TaskPhase, parseTaskId } from "../../../src/domain/task/index.js";

import { createExecutorCompatibilityReleaseManifestFixture } from "./executorCompatibilityReleaseManifestFixture.js";

const MANIFEST_ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FE0";
const MANIFEST_DECISION_REQUEST_ID = "01ARZ3NDEKTSV4RRFFQ69G5FF0";
const MANIFEST_APPROVAL_ID = "01ARZ3NDEKTSV4RRFFQ69G5FG0";
const MANIFEST_TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const REQUEST_CREATED_AT = "2026-07-16T00:01:00.000Z";
const APPROVAL_CREATED_AT = "2026-07-16T00:02:00.000Z";

async function createReleaseManifestAttestationFixture() {
  const fixture = await createExecutorCompatibilityReleaseManifestFixture();
  const decisionRequest = createManifestDecisionRequest(fixture);
  const approvalRecord = createManifestApprovalRecord(decisionRequest, fixture);
  const draft = createExecutorCompatibilityReleaseManifestAttestationDraft(
    {
      manifest: fixture.manifest,
      publisherIdentityPolicy: fixture.publisherIdentityPolicy,
      decisionRequest,
      approvalRecord,
    },
    fixture.digest,
  );
  if (draft.status === ResultStatus.Failure) throw draft.error;
  return {
    ...fixture,
    manifestDecisionRequest: decisionRequest,
    manifestApprovalRecord: approvalRecord,
    manifestAttestationDraft: draft.value,
  };
}

/** Release Manifest Attestation Fixture 的稳定静态类型。 */
export type ExecutorCompatibilityReleaseManifestAttestationFixture = Awaited<
  ReturnType<typeof createReleaseManifestAttestationFixture>
>;

/** 创建包含独立 Human G6 的 Manifest Attestation Draft Fixture。 */
export function createExecutorCompatibilityReleaseManifestAttestationFixture(): Promise<ExecutorCompatibilityReleaseManifestAttestationFixture> {
  return createReleaseManifestAttestationFixture();
}

/** 对变更后的 Manifest DecisionRequest 重算真实摘要。 */
export function withManifestDecisionRequestDigest(
  decisionRequest: DecisionRequest,
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityReleaseManifestFixture>>,
): DecisionRequest {
  const digest = fixture.digest.calculate(createDecisionRequestDigestInput(decisionRequest));
  if (digest.status === ResultStatus.Failure) throw digest.error;
  return { ...decisionRequest, digest: digest.value };
}

/** 对变更后的 Manifest ApprovalRecord 重算真实摘要。 */
export function withManifestApprovalRecordDigest(
  approvalRecord: ApprovalRecord,
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityReleaseManifestFixture>>,
): ApprovalRecord {
  const digest = fixture.digest.calculate(createApprovalRecordDigestInput(approvalRecord));
  if (digest.status === ResultStatus.Failure) throw digest.error;
  return { ...approvalRecord, digest: digest.value };
}

function createManifestDecisionRequest(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityReleaseManifestFixture>>,
): DecisionRequest {
  const artifactId = parseArtifactId(MANIFEST_ARTIFACT_ID);
  const decisionRequestId = parseDecisionRequestId(MANIFEST_DECISION_REQUEST_ID);
  const taskId = parseTaskId(MANIFEST_TASK_ID);
  if (artifactId.status === ResultStatus.Failure) throw artifactId.error;
  if (decisionRequestId.status === ResultStatus.Failure) throw decisionRequestId.error;
  if (taskId.status === ResultStatus.Failure) throw taskId.error;
  return withManifestDecisionRequestDigest(
    {
      schemaVersion: DECISION_REQUEST_SCHEMA_VERSION,
      decisionRequestId: decisionRequestId.value,
      taskId: taskId.value,
      gate: GateId.G6MergeRelease,
      artifactId: artifactId.value,
      artifactDigest: fixture.manifest.manifestDigest,
      riskLevel: RiskLevel.R4,
      resumePhase: TaskPhase.Review,
      resumeCheckpoint: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_APPROVED_CHECKPOINT,
      requiredAction: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_APPROVAL_ACTION,
      digest: fixture.manifest.manifestDigest,
      createdAt: REQUEST_CREATED_AT,
      createdBy: { kind: ActorKind.Agent, actorId: "manifest-release-planner" },
    },
    fixture,
  );
}

function createManifestApprovalRecord(
  decisionRequest: DecisionRequest,
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityReleaseManifestFixture>>,
): ApprovalRecord {
  const approvalId = parseApprovalId(MANIFEST_APPROVAL_ID);
  if (approvalId.status === ResultStatus.Failure) throw approvalId.error;
  return withManifestApprovalRecordDigest(
    {
      schemaVersion: APPROVAL_RECORD_SCHEMA_VERSION,
      approvalId: approvalId.value,
      decisionRequestId: decisionRequest.decisionRequestId,
      decisionRequestDigest: decisionRequest.digest,
      gate: GateId.G6MergeRelease,
      artifactId: decisionRequest.artifactId,
      artifactDigest: decisionRequest.artifactDigest,
      idempotencyKey: "executor-compatibility-release-manifest-approval",
      actor: { kind: ActorKind.Human, actorId: "manifest-release-reviewer" },
      decision: ApprovalDecision.Approved,
      createdAt: APPROVAL_CREATED_AT,
      digest: fixture.manifest.manifestDigest,
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
    ...(request.writeSetDigest === undefined ? {} : { writeSetDigest: request.writeSetDigest }),
    ...(request.baseRevision === undefined ? {} : { baseRevision: request.baseRevision }),
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
