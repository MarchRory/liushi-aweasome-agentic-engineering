import {
  rebuildCloseoutCheckpoint,
  parseHarnessErrorCode,
} from "#application/codingTaskSessionCloseoutState/validation/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";

import {
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_IDENTITY_KEYS,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_KEYS,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_OPTIONAL_KEYS,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_SCHEMA_VERSION,
} from "../constants/index.js";
import type { CodingTaskSessionCloseoutRecoveryState } from "../contracts/index.js";
import { CodingTaskSessionCloseoutRecoveryResolution } from "#application/codingTaskSessionCloseoutRecovery/enums/index.js";
import { CodingTaskSessionCloseoutRecoveryStateStatus } from "../enums/index.js";
import {
  hasExactKeys,
  invalid,
  isRecord,
  parseIsoUtc,
  parseNonNegativeInteger,
  parseSafeText,
} from "./codingTaskSessionCloseoutRecoveryStateSupport.js";
import { parseRecoveryStateIdentity } from "./codingTaskSessionCloseoutRecoveryStateIdentityValidation.js";

/** 创建 version=0 的 Approved Recovery State。 */
export function createCodingTaskSessionCloseoutRecoveryState(
  input: unknown,
): Result<CodingTaskSessionCloseoutRecoveryState, HarnessError> {
  if (
    !isRecord(input) ||
    !hasExactKeys(
      input,
      CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_IDENTITY_KEYS,
      CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_OPTIONAL_KEYS,
    )
  ) {
    return failure(invalid("identity"));
  }
  const identity = parseRecoveryStateIdentity(input);
  if (identity.status === ResultStatus.Failure) return identity;
  return success(
    freezeRecoveryState({
      schemaVersion: CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_SCHEMA_VERSION,
      ...identity.value,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.Approved,
      checkpoint: null,
      errorCode: null,
      recoveryGuidance: null,
      version: 0,
      updatedAt: identity.value.createdAt,
    }),
  );
}

/** 严格重建 Recovery State，供未来 File Store 读后复验。 */
export function rebuildCodingTaskSessionCloseoutRecoveryState(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionCloseoutRecoveryState, HarnessError> {
  if (
    !isRecord(input) ||
    !hasExactKeys(
      input,
      CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_KEYS,
      CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_OPTIONAL_KEYS,
    )
  ) {
    return failure(invalid("state"));
  }
  if (input["schemaVersion"] !== CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_SCHEMA_VERSION) {
    return failure(invalid("schemaVersion"));
  }
  const identity = parseRecoveryStateIdentity(input);
  if (identity.status === ResultStatus.Failure) return identity;
  const status = parseStatus(input["status"]);
  if (status.status === ResultStatus.Failure) return status;
  const checkpoint =
    input["checkpoint"] === null
      ? success(null)
      : rebuildCloseoutCheckpoint(input["checkpoint"], digestPort);
  if (checkpoint.status === ResultStatus.Failure) return checkpoint;
  const errorCode = parseNullableErrorCode(input["errorCode"]);
  if (errorCode.status === ResultStatus.Failure) return errorCode;
  const recoveryGuidance = parseNullableGuidance(input["recoveryGuidance"]);
  if (recoveryGuidance.status === ResultStatus.Failure) return recoveryGuidance;
  const version = parseNonNegativeInteger(input["version"], "version");
  if (version.status === ResultStatus.Failure) return version;
  const updatedAt = parseIsoUtc(input["updatedAt"], "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return updatedAt;

  const state = {
    schemaVersion: CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_SCHEMA_VERSION,
    ...identity.value,
    status: status.value,
    checkpoint: checkpoint.value,
    errorCode: errorCode.value,
    recoveryGuidance: recoveryGuidance.value,
    version: version.value,
    updatedAt: updatedAt.value,
  } satisfies CodingTaskSessionCloseoutRecoveryState;
  const invariant = validateRecoveryStateInvariants(state);
  return invariant.status === ResultStatus.Failure
    ? invariant
    : success(freezeRecoveryState(state));
}

/** parse 是 rebuild 的公开别名，确保 Store 与领域迁移共用同一校验。 */
export const parseCodingTaskSessionCloseoutRecoveryState =
  rebuildCodingTaskSessionCloseoutRecoveryState;

/** 校验 Recovery State 的状态、版本、终态信息和 Checkpoint 组合。 */
export function validateRecoveryStateInvariants(
  state: CodingTaskSessionCloseoutRecoveryState,
): Result<void, HarnessError> {
  if (Date.parse(state.updatedAt) < Date.parse(state.createdAt)) {
    return failure(invalid("updatedAt", "updatedAt 不得早于 createdAt。"));
  }

  switch (state.status) {
    case CodingTaskSessionCloseoutRecoveryStateStatus.Approved:
      return state.version === 0 &&
        state.updatedAt === state.createdAt &&
        state.checkpoint === null &&
        hasNoTerminalDetails(state)
        ? success(undefined)
        : failure(invalid("status", "Approved 必须是 version=0 且没有结果信息。"));
    case CodingTaskSessionCloseoutRecoveryStateStatus.Executing:
      return state.version === 1 &&
        state.requestedResolution === CodingTaskSessionCloseoutRecoveryResolution.RetryOnce &&
        state.checkpoint === null &&
        hasNoTerminalDetails(state)
        ? success(undefined)
        : failure(invalid("status", "Executing 只能来自 RetryOnce 且不能携带结果信息。"));
    case CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound:
      return ((state.requestedResolution ===
        CodingTaskSessionCloseoutRecoveryResolution.BindExisting &&
        state.version === 1) ||
        (state.requestedResolution === CodingTaskSessionCloseoutRecoveryResolution.RetryOnce &&
          state.version === 2)) &&
        hasMatchingCheckpointBinding(state) &&
        hasNoTerminalDetails(state)
        ? success(undefined)
        : failure(invalid("status", "CheckpointBound 必须保存完整 Checkpoint。"));
    case CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied:
      return state.version === 2 &&
        state.requestedResolution === CodingTaskSessionCloseoutRecoveryResolution.RetryOnce &&
        state.checkpoint === null &&
        state.errorCode === HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied &&
        hasTerminalDetails(state)
        ? success(undefined)
        : failure(invalid("status", "RetryNotApplied 的状态组合无效。"));
    case CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown:
      return state.version === 2 &&
        state.requestedResolution === CodingTaskSessionCloseoutRecoveryResolution.RetryOnce &&
        state.checkpoint === null &&
        state.errorCode === HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown &&
        hasTerminalDetails(state)
        ? success(undefined)
        : failure(invalid("status", "OutcomeUnknown 的状态组合无效。"));
    case CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired:
      return isHumanRequiredVersion(state) && state.checkpoint === null && hasTerminalDetails(state)
        ? success(undefined)
        : failure(invalid("status", "HumanRequired 必须保存完整人工处理信息。"));
  }
}

/** 深冻结状态及其嵌套审计对象，避免迁移后输入被外部修改。 */
export function freezeRecoveryState(
  state: CodingTaskSessionCloseoutRecoveryState,
): CodingTaskSessionCloseoutRecoveryState {
  const { causationId, ...required } = state;
  const checkpoint =
    state.checkpoint === null
      ? null
      : Object.freeze({
          ...state.checkpoint,
          checkpoint: Object.freeze({
            ...state.checkpoint.checkpoint,
            changedPaths: Object.freeze([...state.checkpoint.checkpoint.changedPaths]),
          }),
        });
  return Object.freeze({
    ...required,
    ...(causationId === undefined ? {} : { causationId }),
    actor: Object.freeze({ ...state.actor }),
    checkpoint,
  });
}

function parseStatus(
  value: unknown,
): Result<CodingTaskSessionCloseoutRecoveryStateStatus, HarnessError> {
  return typeof value === "string" &&
    Object.values(CodingTaskSessionCloseoutRecoveryStateStatus).includes(
      value as CodingTaskSessionCloseoutRecoveryStateStatus,
    )
    ? success(value as CodingTaskSessionCloseoutRecoveryStateStatus)
    : failure(invalid("status"));
}

function parseNullableErrorCode(value: unknown): Result<null | HarnessErrorCode, HarnessError> {
  if (value === null) return success(null);
  return parseHarnessErrorCode(value);
}

function parseNullableGuidance(value: unknown): Result<string | null, HarnessError> {
  if (value === null) return success(null);
  const parsed = parseSafeText(value, "recoveryGuidance");
  return parsed.status === ResultStatus.Failure ? parsed : success(parsed.value);
}

function hasNoTerminalDetails(state: CodingTaskSessionCloseoutRecoveryState): boolean {
  return state.errorCode === null && state.recoveryGuidance === null;
}

function hasTerminalDetails(state: CodingTaskSessionCloseoutRecoveryState): boolean {
  return state.errorCode !== null && state.recoveryGuidance !== null;
}

function hasMatchingCheckpointBinding(state: CodingTaskSessionCloseoutRecoveryState): boolean {
  if (
    state.checkpoint === null ||
    state.checkpoint.preSubmitSnapshotDigest !== state.preSubmitSnapshotDigest ||
    state.checkpoint.changeSetDigest !== state.changeSetDigest
  ) {
    return false;
  }
  return state.requestedResolution === CodingTaskSessionCloseoutRecoveryResolution.RetryOnce
    ? state.assessmentCheckpointBindingDigest === null
    : state.checkpoint.bindingDigest === state.assessmentCheckpointBindingDigest;
}

function isHumanRequiredVersion(state: CodingTaskSessionCloseoutRecoveryState): boolean {
  return state.requestedResolution === CodingTaskSessionCloseoutRecoveryResolution.BindExisting
    ? state.version === 1
    : state.version === 1 || state.version === 2;
}
