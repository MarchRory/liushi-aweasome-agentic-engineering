import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import {
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_ASSESSMENT_SCHEMA_VERSION,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_EVIDENCE_PREFIX,
} from "../../constants/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryAssessment,
  CodingTaskSessionCloseoutRecoveryAssessmentBody,
} from "../../contracts/index.js";

/** 规范化 Assessment 正文并固定数组边界。 */
export function createCodingTaskSessionCloseoutRecoveryAssessmentBody(
  input: CodingTaskSessionCloseoutRecoveryAssessmentBody,
): CodingTaskSessionCloseoutRecoveryAssessmentBody {
  return Object.freeze({
    schemaVersion: CODING_TASK_SESSION_CLOSEOUT_RECOVERY_ASSESSMENT_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    codingTaskId: input.codingTaskId,
    sourceTaskId: input.sourceTaskId,
    repositoryId: input.repositoryId,
    attemptNumber: input.attemptNumber,
    worktreeId: input.worktreeId,
    branchName: input.branchName,
    repositoryRootDigest: input.repositoryRootDigest,
    worktreeRootDigest: input.worktreeRootDigest,
    baseRevision: input.baseRevision,
    writeSet: Object.freeze([...input.writeSet]),
    closeoutSchemaVersion: input.closeoutSchemaVersion,
    closeoutVersion: input.closeoutVersion,
    closeoutStatus: input.closeoutStatus,
    closeoutStoppedStage: input.closeoutStoppedStage,
    closeoutErrorCode: input.closeoutErrorCode,
    closeoutStateDigest: input.closeoutStateDigest,
    snapshotDigest: input.snapshotDigest,
    coverageBindingDigest: input.coverageBindingDigest,
    checkpointStatus: input.checkpointStatus,
    checkpointBindingDigest: input.checkpointBindingDigest,
    disposition: input.disposition,
    allowedResolution: input.allowedResolution,
    diagnostic: input.diagnostic,
  });
}

/** 只对 Assessment 正文计算 Canonical Digest，不包含自身 Digest 或 evidenceIds。 */
export function calculateCodingTaskSessionCloseoutRecoveryAssessmentDigest(
  body: CodingTaskSessionCloseoutRecoveryAssessmentBody,
  digest: ContentDigestPort,
): Result<ContentDigest, HarnessError> {
  try {
    return digest.calculate(createCodingTaskSessionCloseoutRecoveryAssessmentBody(body));
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Closeout Recovery Assessment Digest 计算抛出异常。",
        {},
        error,
      ),
    );
  }
}

/** 从 Assessment Digest 派生稳定且不参与正文 Digest 的证据标识。 */
export function createCodingTaskSessionCloseoutRecoveryEvidenceIds(
  assessmentDigest: ContentDigest,
): readonly string[] {
  return Object.freeze([
    `${CODING_TASK_SESSION_CLOSEOUT_RECOVERY_EVIDENCE_PREFIX}:${assessmentDigest}`,
  ]);
}

/** 完成 Assessment Digest 与证据标识的公开投影。 */
export function finalizeCodingTaskSessionCloseoutRecoveryAssessment(
  body: CodingTaskSessionCloseoutRecoveryAssessmentBody,
  digest: ContentDigestPort,
): Result<CodingTaskSessionCloseoutRecoveryAssessment, HarnessError> {
  const normalized = createCodingTaskSessionCloseoutRecoveryAssessmentBody(body);
  const assessmentDigest = calculateCodingTaskSessionCloseoutRecoveryAssessmentDigest(
    normalized,
    digest,
  );
  if (assessmentDigest.status === ResultStatus.Failure) return failure(assessmentDigest.error);
  return success({
    ...normalized,
    assessmentDigest: assessmentDigest.value,
    evidenceIds: createCodingTaskSessionCloseoutRecoveryEvidenceIds(assessmentDigest.value),
  });
}
