import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import { normalizeWriteSet } from "#domain/codingTask/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import {
  verifyCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChangeSetSnapshot,
} from "#domain/codingTaskSessionChangeSet/index.js";

import { CHANGE_SET_CHECKPOINT_SCHEMA_VERSION } from "#application/changeSetCheckpoint/index.js";
import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";

import { CODING_TASK_SESSION_CLOSEOUT_ACTION_EVIDENCE_SCHEMA_VERSION } from "../constants/index.js";
import type { CodingTaskSessionCloseoutActionEvidenceDigestInput } from "../contracts/index.js";
import {
  hasExactKeys,
  invalid,
  isRecord,
  parseDigest,
  parseSafeText,
  type UnknownRecord,
} from "./closeoutValidationSupport.js";

const SNAPSHOT_KEYS = [
  "schemaVersion",
  "repositoryId",
  "worktreeId",
  "worktreeRelativePath",
  "branchName",
  "baseRevision",
  "observedHeadRevision",
  "writeSet",
  "changedPaths",
  "changes",
  "changeSetDigest",
  "snapshotDigest",
] as const;
const CHECKPOINT_KEYS = [
  "schemaVersion",
  "checkpoint",
  "changeSetDigest",
  "preSubmitSnapshotDigest",
  "bindingDigest",
] as const;
const GIT_CHECKPOINT_KEYS = ["targetRevision", "changedPaths", "checkpointDigest"] as const;

/** 严格重建并验证完整 ChangeSet Snapshot。 */
export function rebuildCloseoutSnapshot(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionChangeSetSnapshot, HarnessError> {
  if (!isRecord(input) || !hasExactKeys(input, SNAPSHOT_KEYS)) {
    return failure(invalid("snapshot"));
  }
  if (!validateSnapshotNestedShapes(input)) return failure(invalid("snapshot"));
  const verified = verifyCodingTaskSessionChangeSetSnapshot(
    input as unknown as CodingTaskSessionChangeSetSnapshot,
    digestPort,
  );
  if (verified.status === ResultStatus.Failure) return verified;
  return success(freezeSnapshot(verified.value));
}

/** 严格重建并验证 ChangeSet Checkpoint 的所有摘要。 */
export function rebuildCloseoutCheckpoint(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<ChangeSetCheckpoint, HarnessError> {
  if (!isRecord(input) || !hasExactKeys(input, CHECKPOINT_KEYS)) {
    return failure(invalid("checkpoint"));
  }
  if (input["schemaVersion"] !== CHANGE_SET_CHECKPOINT_SCHEMA_VERSION) {
    return failure(invalid("checkpoint.schemaVersion"));
  }
  const checkpointInput = input["checkpoint"];
  if (!isRecord(checkpointInput) || !hasExactKeys(checkpointInput, GIT_CHECKPOINT_KEYS)) {
    return failure(invalid("checkpoint.checkpoint"));
  }
  const targetRevision = parseSafeText(
    checkpointInput["targetRevision"],
    "checkpoint.targetRevision",
  );
  if (targetRevision.status === ResultStatus.Failure || !isRevision(targetRevision.value)) {
    return failure(invalid("checkpoint.targetRevision"));
  }
  const changedPaths = parseCanonicalPaths(
    checkpointInput["changedPaths"],
    "checkpoint.changedPaths",
  );
  if (changedPaths.status === ResultStatus.Failure) return changedPaths;
  const checkpointDigest = parseDigest(
    checkpointInput["checkpointDigest"],
    "checkpoint.checkpointDigest",
  );
  if (checkpointDigest.status === ResultStatus.Failure) return checkpointDigest;
  const expectedCheckpointDigest = digestPort.calculate({
    targetRevision: targetRevision.value,
    changedPaths: changedPaths.value,
  });
  if (
    expectedCheckpointDigest.status === ResultStatus.Failure ||
    expectedCheckpointDigest.value !== checkpointDigest.value
  ) {
    return failure(invalid("checkpoint.checkpointDigest"));
  }

  const changeSetDigest = parseDigest(input["changeSetDigest"], "checkpoint.changeSetDigest");
  if (changeSetDigest.status === ResultStatus.Failure) return changeSetDigest;
  const snapshotDigest = parseDigest(
    input["preSubmitSnapshotDigest"],
    "checkpoint.preSubmitSnapshotDigest",
  );
  if (snapshotDigest.status === ResultStatus.Failure) return snapshotDigest;
  const bindingDigest = parseDigest(input["bindingDigest"], "checkpoint.bindingDigest");
  if (bindingDigest.status === ResultStatus.Failure) return bindingDigest;
  const expectedBindingDigest = digestPort.calculate({
    schemaVersion: CHANGE_SET_CHECKPOINT_SCHEMA_VERSION,
    checkpointDigest: checkpointDigest.value,
    changeSetDigest: changeSetDigest.value,
    preSubmitSnapshotDigest: snapshotDigest.value,
  });
  if (
    expectedBindingDigest.status === ResultStatus.Failure ||
    expectedBindingDigest.value !== bindingDigest.value
  ) {
    return failure(invalid("checkpoint.bindingDigest"));
  }
  return success(
    Object.freeze({
      schemaVersion: CHANGE_SET_CHECKPOINT_SCHEMA_VERSION,
      checkpoint: Object.freeze({
        targetRevision: targetRevision.value,
        changedPaths: Object.freeze([...changedPaths.value]),
        checkpointDigest: checkpointDigest.value,
      }),
      changeSetDigest: changeSetDigest.value,
      preSubmitSnapshotDigest: snapshotDigest.value,
      bindingDigest: bindingDigest.value,
    }),
  );
}

/** 创建绑定 Snapshot 摘要的规范 Action Evidence Digest 输入。 */
export function createCloseoutActionEvidenceDigestInput(
  snapshotDigest: ContentDigest,
  coveredActionIds: readonly ActionId[],
): CodingTaskSessionCloseoutActionEvidenceDigestInput {
  return {
    schemaVersion: CODING_TASK_SESSION_CLOSEOUT_ACTION_EVIDENCE_SCHEMA_VERSION,
    snapshotDigest,
    coveredActionIds,
  };
}

/** 计算并验证 Action Evidence 摘要确实绑定完整 Snapshot。 */
export function verifyCloseoutActionEvidenceDigest(
  snapshotDigest: ContentDigest,
  coveredActionIds: readonly ActionId[],
  actionEvidenceDigest: unknown,
  digestPort: ContentDigestPort,
): Result<readonly ActionId[], HarnessError> {
  const ids = parseCanonicalActionIds(coveredActionIds);
  if (ids.status === ResultStatus.Failure || ids.value.length === 0) {
    return failure(invalid("coveredActionIds"));
  }
  const parsedDigest = parseDigest(actionEvidenceDigest, "actionEvidenceDigest");
  if (parsedDigest.status === ResultStatus.Failure) return parsedDigest;
  const expected = digestPort.calculate(
    createCloseoutActionEvidenceDigestInput(snapshotDigest, ids.value),
  );
  if (expected.status === ResultStatus.Failure || expected.value !== parsedDigest.value) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "Action Evidence 摘要未绑定完整 Snapshot。",
        { field: "actionEvidenceDigest" },
      ),
    );
  }
  return success(Object.freeze([...ids.value]));
}

/** 验证 Action ID 集合的唯一性、格式与规范排序。 */
export function parseCanonicalActionIds(input: unknown): Result<readonly ActionId[], HarnessError> {
  if (!Array.isArray(input)) return failure(invalid("coveredActionIds"));
  const values: ActionId[] = [];
  for (const item of input) {
    if (typeof item !== "string") return failure(invalid("coveredActionIds"));
    const parsed = parseActionId(item);
    if (parsed.status === ResultStatus.Failure) return failure(invalid("coveredActionIds"));
    values.push(parsed.value);
  }
  if (new Set(values).size !== values.length) return failure(invalid("coveredActionIds"));
  const sorted = [...values].sort();
  if (values.some((value, index) => value !== sorted[index])) {
    return failure(invalid("coveredActionIds"));
  }
  return success(Object.freeze(values));
}

function validateSnapshotNestedShapes(snapshot: UnknownRecord): boolean {
  if (!Array.isArray(snapshot["writeSet"]) || !Array.isArray(snapshot["changedPaths"]))
    return false;
  if (!Array.isArray(snapshot["changes"])) return false;
  return snapshot["changes"].every((change) => {
    if (
      !isRecord(change) ||
      !hasExactKeys(change, ["path", "kind", "targetContentDigest"], ["originalPath"])
    ) {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(change, "originalPath")
      ? typeof change["originalPath"] === "string"
      : true;
  });
}

function parseCanonicalPaths(
  input: unknown,
  field: string,
): Result<readonly string[], HarnessError> {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.some((path) => typeof path !== "string")
  ) {
    return failure(invalid(field));
  }
  try {
    const normalized = normalizeWriteSet(input);
    return normalized.length === input.length &&
      normalized.every((path, index) => path === input[index])
      ? success(Object.freeze([...normalized]))
      : failure(invalid(field));
  } catch {
    return failure(invalid(field));
  }
}

function isRevision(value: string): boolean {
  return /^[0-9a-f]{40,128}$/iu.test(value);
}

function freezeSnapshot(
  snapshot: CodingTaskSessionChangeSetSnapshot,
): CodingTaskSessionChangeSetSnapshot {
  return Object.freeze({
    ...snapshot,
    writeSet: Object.freeze([...snapshot.writeSet]),
    changedPaths: Object.freeze([...snapshot.changedPaths]),
    changes: Object.freeze(snapshot.changes.map((change) => Object.freeze({ ...change }))),
  });
}
