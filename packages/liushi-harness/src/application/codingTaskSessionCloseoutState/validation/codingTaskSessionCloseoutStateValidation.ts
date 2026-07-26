import { ResultStatus, failure, success, type HarnessError, type Result } from "#common/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";

import { CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION } from "../constants/index.js";
import type { CodingTaskSessionCloseoutState } from "../contracts/index.js";
import { CodingTaskSessionCloseoutStatus } from "../enums/index.js";
import {
  parseCloseoutStatus,
  parseCloseoutVersion,
  parseNullableCloseoutStage,
  parseNullableHarnessErrorCode,
  parseNullableSafeText,
} from "./codingTaskSessionCloseoutFieldValidation.js";
import { parseCloseoutIdentity } from "./codingTaskSessionCloseoutIdentityValidation.js";
import {
  freezeCloseoutState,
  validateCloseoutStateInvariants,
} from "./codingTaskSessionCloseoutInvariantValidation.js";
import {
  rebuildCloseoutCheckpoint,
  rebuildCloseoutSnapshot,
} from "./codingTaskSessionCloseoutNestedValidation.js";
import { rebuildCloseoutCoverageManifest } from "./codingTaskSessionCloseoutCoverageValidation.js";
import {
  hasExactKeys,
  invalid,
  isRecord,
  parseDigest,
  parseIsoUtc,
} from "./closeoutValidationSupport.js";

const IDENTITY_KEYS = [
  "workspaceId",
  "sessionId",
  "codingTaskId",
  "sourceTaskId",
  "repositoryId",
  "attemptNumber",
  "activationBindingDigest",
  "sessionBindingDigest",
  "requestDigest",
  "idempotencyKey",
  "commandId",
  "correlationId",
  "actor",
  "createdAt",
] as const;
const STATE_KEYS = [
  "schemaVersion",
  ...IDENTITY_KEYS,
  "status",
  "snapshot",
  "coverageManifest",
  "coverageBindingDigest",
  "checkpoint",
  "stoppedStage",
  "errorCode",
  "recoveryGuidance",
  "version",
  "updatedAt",
] as const;

/** 创建 version=0 的 Closing Process State。 */
export function createCodingTaskSessionCloseoutState(
  input: unknown,
): Result<CodingTaskSessionCloseoutState, HarnessError> {
  if (!isRecord(input) || !hasExactKeys(input, IDENTITY_KEYS, ["causationId"])) {
    return failure(invalid("identity"));
  }
  const identity = parseCloseoutIdentity(input);
  if (identity.status === ResultStatus.Failure) return identity;
  return success(
    freezeCloseoutState({
      schemaVersion: CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION,
      ...identity.value,
      status: CodingTaskSessionCloseoutStatus.Closing,
      snapshot: null,
      coverageManifest: null,
      coverageBindingDigest: null,
      checkpoint: null,
      stoppedStage: null,
      errorCode: null,
      recoveryGuidance: null,
      version: 0,
      updatedAt: identity.value.createdAt,
    }),
  );
}

/** 严格重建持久化 State，并验证阶段不变量与全部摘要绑定。 */
export function rebuildCodingTaskSessionCloseoutState(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionCloseoutState, HarnessError> {
  if (!isRecord(input) || !hasExactKeys(input, STATE_KEYS, ["causationId"])) {
    return failure(invalid("state"));
  }
  if (input["schemaVersion"] !== CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION) {
    return failure(invalid("schemaVersion"));
  }
  const identity = parseCloseoutIdentity(input);
  if (identity.status === ResultStatus.Failure) return identity;
  const status = parseCloseoutStatus(input["status"]);
  if (status.status === ResultStatus.Failure) return status;
  const snapshot =
    input["snapshot"] === null
      ? success(null)
      : rebuildCloseoutSnapshot(input["snapshot"], digestPort);
  if (snapshot.status === ResultStatus.Failure) return snapshot;
  const coverageManifest =
    input["coverageManifest"] === null
      ? success(null)
      : rebuildCloseoutCoverageManifest(input["coverageManifest"], digestPort);
  if (coverageManifest.status === ResultStatus.Failure) return coverageManifest;
  const coverageBindingDigest =
    input["coverageBindingDigest"] === null
      ? success(null)
      : parseDigest(input["coverageBindingDigest"], "coverageBindingDigest");
  if (coverageBindingDigest.status === ResultStatus.Failure) return coverageBindingDigest;
  const checkpoint =
    input["checkpoint"] === null
      ? success(null)
      : rebuildCloseoutCheckpoint(input["checkpoint"], digestPort);
  if (checkpoint.status === ResultStatus.Failure) return checkpoint;
  const stoppedStage = parseNullableCloseoutStage(input["stoppedStage"]);
  if (stoppedStage.status === ResultStatus.Failure) return stoppedStage;
  const errorCode = parseNullableHarnessErrorCode(input["errorCode"]);
  if (errorCode.status === ResultStatus.Failure) return errorCode;
  const recoveryGuidance = parseNullableSafeText(input["recoveryGuidance"], "recoveryGuidance");
  if (recoveryGuidance.status === ResultStatus.Failure) return recoveryGuidance;
  const version = parseCloseoutVersion(input["version"]);
  if (version.status === ResultStatus.Failure) return version;
  const updatedAt = parseIsoUtc(input["updatedAt"], "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return updatedAt;

  const state = {
    schemaVersion: CODING_TASK_SESSION_CLOSEOUT_STATE_SCHEMA_VERSION,
    ...identity.value,
    status: status.value,
    snapshot: snapshot.value,
    coverageManifest: coverageManifest.value,
    coverageBindingDigest: coverageBindingDigest.value,
    checkpoint: checkpoint.value,
    stoppedStage: stoppedStage.value,
    errorCode: errorCode.value,
    recoveryGuidance: recoveryGuidance.value,
    version: version.value,
    updatedAt: updatedAt.value,
  } satisfies CodingTaskSessionCloseoutState;
  const invariant = validateCloseoutStateInvariants(state, digestPort);
  return invariant.status === ResultStatus.Failure
    ? invariant
    : success(freezeCloseoutState(state));
}

/** parse 是 rebuild 的公开别名，统一执行相同的严格校验。 */
export const parseCodingTaskSessionCloseoutState = rebuildCodingTaskSessionCloseoutState;

/** validate 是 rebuild 的公开别名，拒绝未知字段或摘要漂移。 */
export const validateCodingTaskSessionCloseoutState = rebuildCodingTaskSessionCloseoutState;
