import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import { calculateCloseoutCoverageBindingDigest } from "#application/codingTaskSessionCloseoutState/digest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";

import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";
import type { CodingTaskSessionCloseoutStateIdentity } from "../../../contracts/index.js";

import {
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
} from "../../../enums/index.js";
import {
  hasExactKeys,
  isRecord,
  parseCloseoutIdentity,
  parseCloseoutStatus,
  parseCloseoutVersion,
  parseDigest,
  parseIsoUtc,
  parseNullableCloseoutStage,
  parseNullableHarnessErrorCode,
  parseNullableSafeText,
  rebuildCloseoutCheckpoint,
  rebuildCloseoutSnapshot,
} from "../../index.js";
import {
  CODING_TASK_SESSION_CLOSEOUT_V2_STATE_KEYS,
  CODING_TASK_SESSION_CLOSEOUT_V2_STATE_SCHEMA_VERSION,
} from "./constants/index.js";
import {
  parseCodingTaskSessionActionCoverageV1,
  type LegacyCodingTaskSessionActionCoverageManifest,
} from "./coverageManifest/index.js";

/** 识别旧 v2 文件，并独立验证其 v1 Coverage Manifest 语义。 */
export function classifyCodingTaskSessionCloseoutV2(
  input: unknown,
  locator: { readonly workspaceId: string; readonly sessionId: string },
  digestPort: ContentDigestPort,
): HarnessError | undefined {
  if (
    !isRecord(input) ||
    input["schemaVersion"] !== CODING_TASK_SESSION_CLOSEOUT_V2_STATE_SCHEMA_VERSION
  ) {
    return undefined;
  }
  const corruption = validateLegacyState(input, locator, digestPort);
  return (
    corruption ??
    new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Closeout State v2 使用旧 Coverage Manifest v1，需显式迁移/Human 决策。",
    )
  );
}

function validateLegacyState(
  input: Record<string, unknown>,
  locator: { readonly workspaceId: string; readonly sessionId: string },
  digestPort: ContentDigestPort,
): HarnessError | undefined {
  if (!hasExactKeys(input, CODING_TASK_SESSION_CLOSEOUT_V2_STATE_KEYS, ["causationId"])) {
    return corrupt("旧 v2 Closeout State 包含未知字段或缺少字段。");
  }
  const identity = parseCloseoutIdentity(input);
  if (identity.status === ResultStatus.Failure) {
    return corrupt("旧 v2 Closeout 身份无效。", identity.error);
  }
  if (
    identity.value.workspaceId !== locator.workspaceId ||
    identity.value.sessionId !== locator.sessionId
  ) {
    return corrupt("旧 v2 Closeout 身份与文件 locator 不一致。");
  }

  const status = parseCloseoutStatus(input["status"]);
  if (status.status === ResultStatus.Failure)
    return corrupt("旧 v2 Closeout 状态无效。", status.error);
  const snapshot = parseSnapshot(input["snapshot"], digestPort);
  if (snapshot.status === ResultStatus.Failure)
    return corrupt("旧 v2 Snapshot 无效。", snapshot.error);
  const coverageManifest = parseManifest(input["coverageManifest"], digestPort);
  if (coverageManifest.status === ResultStatus.Failure) {
    return corrupt("旧 v2 Coverage Manifest 无效。", coverageManifest.error);
  }
  const coverageBinding = parseNullableDigest(
    input["coverageBindingDigest"],
    "coverageBindingDigest",
  );
  if (coverageBinding.status === ResultStatus.Failure) return corrupt("旧 v2 外层 binding 无效。");

  const evidence = validateCoverageEvidence(
    identity.value,
    snapshot.value,
    coverageManifest.value,
    coverageBinding.value,
    digestPort,
  );
  if (evidence !== undefined) return evidence;

  const checkpoint = parseCheckpoint(input["checkpoint"], digestPort);
  if (checkpoint.status === ResultStatus.Failure)
    return corrupt("旧 v2 Checkpoint 无效。", checkpoint.error);
  if (!sameCheckpointBinding(snapshot.value, checkpoint.value)) {
    return corrupt("旧 v2 Checkpoint 未与 Snapshot 双向绑定。");
  }
  const stoppedStage = parseNullableCloseoutStage(input["stoppedStage"]);
  if (stoppedStage.status === ResultStatus.Failure) return corrupt("旧 v2 stoppedStage 无效。");
  const errorCode = parseNullableHarnessErrorCode(input["errorCode"]);
  if (errorCode.status === ResultStatus.Failure) return corrupt("旧 v2 errorCode 无效。");
  const recoveryGuidance = parseNullableSafeText(input["recoveryGuidance"], "recoveryGuidance");
  if (recoveryGuidance.status === ResultStatus.Failure) {
    return corrupt("旧 v2 recoveryGuidance 无效。");
  }
  const version = parseCloseoutVersion(input["version"]);
  if (version.status === ResultStatus.Failure) return corrupt("旧 v2 version 无效。");
  const updatedAt = parseIsoUtc(input["updatedAt"], "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return corrupt("旧 v2 updatedAt 无效。");
  if (Date.parse(updatedAt.value) < Date.parse(identity.value.createdAt)) {
    return corrupt("旧 v2 updatedAt 早于 createdAt。");
  }
  return validateStage(
    status.value,
    version.value,
    snapshot.value,
    coverageManifest.value,
    coverageBinding.value,
    checkpoint.value,
    stoppedStage.value,
    errorCode.value,
    recoveryGuidance.value,
    updatedAt.value === identity.value.createdAt,
  );
}

function parseSnapshot(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionChangeSetSnapshot | null, HarnessError> {
  return input === null ? success(null) : rebuildCloseoutSnapshot(input, digestPort);
}

function parseManifest(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<LegacyCodingTaskSessionActionCoverageManifest | null, HarnessError> {
  return input === null ? success(null) : parseCodingTaskSessionActionCoverageV1(input, digestPort);
}

function parseNullableDigest(
  input: unknown,
  field: string,
): Result<ContentDigest | null, HarnessError> {
  return input === null ? success(null) : parseDigest(input, field);
}

function parseCheckpoint(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<ChangeSetCheckpoint | null, HarnessError> {
  return input === null ? success(null) : rebuildCloseoutCheckpoint(input, digestPort);
}

function validateCoverageEvidence(
  identity: CodingTaskSessionCloseoutStateIdentity,
  snapshot: CodingTaskSessionChangeSetSnapshot | null,
  manifest: LegacyCodingTaskSessionActionCoverageManifest | null,
  binding: ContentDigest | null,
  digestPort: ContentDigestPort,
): HarnessError | undefined {
  const hasSnapshot = snapshot !== null;
  const hasManifest = manifest !== null;
  const hasBinding = binding !== null;
  if (hasSnapshot !== hasManifest || hasManifest !== hasBinding) {
    return corrupt("旧 v2 Snapshot、Coverage Manifest 与 binding 必须同时存在。");
  }
  if (!hasSnapshot || !hasManifest || !hasBinding) return undefined;
  if (
    manifest.workspaceId !== identity.workspaceId ||
    manifest.sessionId !== identity.sessionId ||
    manifest.codingTaskId !== identity.codingTaskId ||
    manifest.sourceTaskId !== identity.sourceTaskId ||
    manifest.repositoryId !== identity.repositoryId ||
    manifest.attemptNumber !== identity.attemptNumber ||
    manifest.activationBindingDigest !== identity.activationBindingDigest ||
    manifest.sessionBindingDigest !== identity.sessionBindingDigest ||
    manifest.repositoryId !== snapshot.repositoryId ||
    manifest.worktreeId !== snapshot.worktreeId
  ) {
    return corrupt("旧 v2 Coverage Manifest 身份或 Snapshot 绑定漂移。");
  }
  const expected = calculateCloseoutCoverageBindingDigest(
    snapshot.snapshotDigest,
    manifest.manifestDigest,
    digestPort,
  );
  if (expected.status === ResultStatus.Failure || expected.value !== binding) {
    return corrupt(
      "旧 v2 Coverage Binding 摘要漂移。",
      expected.status === ResultStatus.Failure ? expected.error : undefined,
    );
  }
  return undefined;
}

function sameCheckpointBinding(
  snapshot: CodingTaskSessionChangeSetSnapshot | null,
  checkpoint: ChangeSetCheckpoint | null,
): boolean {
  return checkpoint === null
    ? true
    : snapshot !== null &&
        checkpoint.changeSetDigest === snapshot.changeSetDigest &&
        checkpoint.preSubmitSnapshotDigest === snapshot.snapshotDigest &&
        checkpoint.checkpoint.changedPaths.length === snapshot.changedPaths.length &&
        checkpoint.checkpoint.changedPaths.every(
          (path, index) => path === snapshot.changedPaths[index],
        );
}

function validateStage(
  status: CodingTaskSessionCloseoutStatus,
  version: number,
  snapshot: CodingTaskSessionChangeSetSnapshot | null,
  manifest: LegacyCodingTaskSessionActionCoverageManifest | null,
  binding: ContentDigest | null,
  checkpoint: ChangeSetCheckpoint | null,
  stoppedStage: CodingTaskSessionCloseoutStage | null,
  errorCode: HarnessErrorCode | null,
  recoveryGuidance: string | null,
  isInitialTimestamp: boolean,
): HarnessError | undefined {
  const hasSnapshot = snapshot !== null;
  const hasCoverage = manifest !== null && binding !== null;
  const active = stoppedStage === null && errorCode === null && recoveryGuidance === null;
  const terminal =
    (status === CodingTaskSessionCloseoutStatus.Blocked ||
      status === CodingTaskSessionCloseoutStatus.OutcomeUnknown) &&
    stoppedStage !== null &&
    errorCode !== null &&
    recoveryGuidance !== null;
  const valid =
    status === CodingTaskSessionCloseoutStatus.Closing
      ? version === 0 &&
        isInitialTimestamp &&
        !hasSnapshot &&
        !hasCoverage &&
        checkpoint === null &&
        active
      : status === CodingTaskSessionCloseoutStatus.SnapshotPersisted
        ? version === 1 && hasSnapshot && hasCoverage && checkpoint === null && active
        : status === CodingTaskSessionCloseoutStatus.CheckpointBound
          ? version === 2 && hasSnapshot && hasCoverage && checkpoint !== null && active
          : stoppedStage === CodingTaskSessionCloseoutStage.Closing
            ? terminal && version === 1 && !hasSnapshot && !hasCoverage && checkpoint === null
            : stoppedStage === CodingTaskSessionCloseoutStage.SnapshotPersisted
              ? terminal && version === 2 && hasSnapshot && hasCoverage && checkpoint === null
              : stoppedStage === CodingTaskSessionCloseoutStage.CheckpointBound
                ? terminal && version === 3 && hasSnapshot && hasCoverage && checkpoint !== null
                : false;
  return valid ? undefined : corrupt("旧 v2 Closeout 阶段、版本或证据不自洽。");
}

function corrupt(message: string, cause?: unknown): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, {}, cause);
}
