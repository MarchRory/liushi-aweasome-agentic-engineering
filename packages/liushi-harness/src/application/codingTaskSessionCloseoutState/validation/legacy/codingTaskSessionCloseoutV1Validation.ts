import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus, type ContentDigest } from "#common/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";

import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";
import {
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
} from "../../enums/index.js";
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
} from "../index.js";
import {
  CODING_TASK_SESSION_CLOSEOUT_V1_ACTION_EVIDENCE_SCHEMA_VERSION,
  CODING_TASK_SESSION_CLOSEOUT_V1_STATE_KEYS,
  CODING_TASK_SESSION_CLOSEOUT_V1_STATE_SCHEMA_VERSION,
} from "./constants/index.js";

/** 识别旧 v1 文件，并区分完整弱证据与损坏存储。 */
export function classifyCodingTaskSessionCloseoutV1(
  input: unknown,
  locator: { readonly workspaceId: string; readonly sessionId: string },
  digestPort: ContentDigestPort,
): HarnessError | undefined {
  if (
    !isRecord(input) ||
    input["schemaVersion"] !== CODING_TASK_SESSION_CLOSEOUT_V1_STATE_SCHEMA_VERSION
  ) {
    return undefined;
  }
  const corruption = validateLegacyState(input, locator, digestPort);
  return (
    corruption ??
    new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Closeout State v1 证据不足，需显式迁移/Human 决策。",
    )
  );
}

function validateLegacyState(
  input: Record<string, unknown>,
  locator: { readonly workspaceId: string; readonly sessionId: string },
  digestPort: ContentDigestPort,
): HarnessError | undefined {
  if (!hasExactKeys(input, CODING_TASK_SESSION_CLOSEOUT_V1_STATE_KEYS, ["causationId"])) {
    return corrupt("旧 v1 Closeout State 包含未知字段或缺少字段。");
  }
  const identity = parseCloseoutIdentity(input);
  if (identity.status === ResultStatus.Failure)
    return corrupt("旧 v1 Closeout 身份无效。", identity.error);
  if (
    identity.value.workspaceId !== locator.workspaceId ||
    identity.value.sessionId !== locator.sessionId
  ) {
    return corrupt("旧 v1 Closeout 身份与文件 locator 不一致。");
  }
  const status = parseCloseoutStatus(input["status"]);
  if (status.status === ResultStatus.Failure)
    return corrupt("旧 v1 Closeout 状态无效。", status.error);
  const snapshot =
    input["snapshot"] === null ? null : rebuildCloseoutSnapshot(input["snapshot"], digestPort);
  if (snapshot !== null && snapshot.status === ResultStatus.Failure) {
    return corrupt("旧 v1 Snapshot 无效。", snapshot.error);
  }
  const snapshotValue = snapshot === null ? null : snapshot.value;
  const actionIds = parseLegacyActionIds(input["coveredActionIds"]);
  if (actionIds === undefined) return corrupt("旧 v1 coveredActionIds 无效。");
  const actionEvidenceDigest =
    input["actionEvidenceDigest"] === null
      ? null
      : parseDigest(input["actionEvidenceDigest"], "actionEvidenceDigest");
  if (actionEvidenceDigest !== null && actionEvidenceDigest.status === ResultStatus.Failure) {
    return corrupt("旧 v1 actionEvidenceDigest 无效。", actionEvidenceDigest.error);
  }
  const evidenceDigest = actionEvidenceDigest === null ? null : actionEvidenceDigest.value;
  const evidence = validateLegacyEvidence(snapshotValue, actionIds, evidenceDigest, digestPort);
  if (evidence !== undefined) return evidence;
  if (snapshotValue !== null && snapshotValue.repositoryId !== identity.value.repositoryId) {
    return corrupt("旧 v1 Snapshot Repository 身份漂移。");
  }

  const checkpoint =
    input["checkpoint"] === null
      ? null
      : rebuildCloseoutCheckpoint(input["checkpoint"], digestPort);
  if (checkpoint !== null && checkpoint.status === ResultStatus.Failure) {
    return corrupt("旧 v1 Checkpoint 无效。", checkpoint.error);
  }
  const checkpointValue = checkpoint === null ? null : checkpoint.value;
  if (!validateLegacyCheckpoint(snapshotValue, checkpointValue)) {
    return corrupt("旧 v1 Checkpoint 未与 Snapshot 双向绑定。");
  }
  const stoppedStage = parseNullableCloseoutStage(input["stoppedStage"]);
  if (stoppedStage.status === ResultStatus.Failure) return corrupt("旧 v1 stoppedStage 无效。");
  const errorCode = parseNullableHarnessErrorCode(input["errorCode"]);
  if (errorCode.status === ResultStatus.Failure) return corrupt("旧 v1 errorCode 无效。");
  const recoveryGuidance = parseNullableSafeText(input["recoveryGuidance"], "recoveryGuidance");
  if (recoveryGuidance.status === ResultStatus.Failure) {
    return corrupt("旧 v1 recoveryGuidance 无效。");
  }
  const version = parseCloseoutVersion(input["version"]);
  if (version.status === ResultStatus.Failure) return corrupt("旧 v1 version 无效。");
  const updatedAt = parseIsoUtc(input["updatedAt"], "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return corrupt("旧 v1 updatedAt 无效。");
  if (Date.parse(updatedAt.value) < Date.parse(identity.value.createdAt)) {
    return corrupt("旧 v1 updatedAt 早于 createdAt。");
  }
  return validateLegacyStage(
    status.value,
    version.value,
    snapshotValue,
    actionIds,
    evidenceDigest,
    checkpointValue,
    stoppedStage.value,
    errorCode.value,
    recoveryGuidance.value,
    identity.value.createdAt,
    updatedAt.value,
  );
}

function validateLegacyEvidence(
  snapshot: CodingTaskSessionChangeSetSnapshot | null,
  actionIds: readonly ActionId[],
  evidenceDigest: ContentDigest | null,
  digestPort: ContentDigestPort,
): HarnessError | undefined {
  if (snapshot === null) {
    return actionIds.length === 0 && evidenceDigest === null
      ? undefined
      : corrupt("旧 v1 Snapshot 与弱证据必须同时为空。");
  }
  if (actionIds.length === 0 || evidenceDigest === null) {
    return corrupt("旧 v1 完整 Snapshot 必须保留非空弱证据。");
  }
  const expected = digestPort.calculate({
    schemaVersion: CODING_TASK_SESSION_CLOSEOUT_V1_ACTION_EVIDENCE_SCHEMA_VERSION,
    snapshotDigest: snapshot.snapshotDigest,
    coveredActionIds: actionIds,
  });
  if (expected.status === ResultStatus.Failure)
    return corrupt("旧 v1 弱证据摘要无法计算。", expected.error);
  return expected.value === evidenceDigest
    ? undefined
    : corrupt("旧 v1 actionEvidenceDigest 摘要漂移。");
}

function validateLegacyCheckpoint(
  snapshot: CodingTaskSessionChangeSetSnapshot | null,
  checkpoint: ChangeSetCheckpoint | null,
): boolean {
  if (checkpoint === null) return true;
  return (
    snapshot !== null &&
    checkpoint.changeSetDigest === snapshot.changeSetDigest &&
    checkpoint.preSubmitSnapshotDigest === snapshot.snapshotDigest &&
    checkpoint.checkpoint.changedPaths.length === snapshot.changedPaths.length &&
    checkpoint.checkpoint.changedPaths.every((path, index) => path === snapshot.changedPaths[index])
  );
}

function validateLegacyStage(
  status: CodingTaskSessionCloseoutStatus,
  version: number,
  snapshot: CodingTaskSessionChangeSetSnapshot | null,
  actionIds: readonly ActionId[],
  evidenceDigest: ContentDigest | null,
  checkpoint: ChangeSetCheckpoint | null,
  stoppedStage: CodingTaskSessionCloseoutStage | null,
  errorCode: string | null,
  recoveryGuidance: string | null,
  createdAt: string,
  updatedAt: string,
): HarnessError | undefined {
  const hasSnapshot = snapshot !== null;
  const hasEvidence = actionIds.length > 0 && evidenceDigest !== null;
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
        updatedAt === createdAt &&
        !hasSnapshot &&
        !hasEvidence &&
        checkpoint === null &&
        active
      : status === CodingTaskSessionCloseoutStatus.SnapshotPersisted
        ? version === 1 && hasSnapshot && hasEvidence && checkpoint === null && active
        : status === CodingTaskSessionCloseoutStatus.CheckpointBound
          ? version === 2 && hasSnapshot && hasEvidence && checkpoint !== null && active
          : stoppedStage === CodingTaskSessionCloseoutStage.Closing
            ? terminal && version === 1 && !hasSnapshot && !hasEvidence && checkpoint === null
            : stoppedStage === CodingTaskSessionCloseoutStage.SnapshotPersisted
              ? terminal && version === 2 && hasSnapshot && hasEvidence && checkpoint === null
              : stoppedStage === CodingTaskSessionCloseoutStage.CheckpointBound
                ? terminal && version === 3 && hasSnapshot && hasEvidence && checkpoint !== null
                : false;
  return valid ? undefined : corrupt("旧 v1 Closeout 阶段、版本或证据不自洽。");
}

function parseLegacyActionIds(input: unknown): readonly ActionId[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values: ActionId[] = [];
  for (const value of input) {
    if (typeof value !== "string") return undefined;
    const parsed = parseActionId(value);
    if (parsed.status === ResultStatus.Failure) return undefined;
    values.push(parsed.value);
  }
  if (new Set(values).size !== values.length) return undefined;
  const sorted = [...values].sort();
  return values.every((value, index) => value === sorted[index])
    ? Object.freeze(values)
    : undefined;
}

function corrupt(message: string, cause?: unknown): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, {}, cause);
}
