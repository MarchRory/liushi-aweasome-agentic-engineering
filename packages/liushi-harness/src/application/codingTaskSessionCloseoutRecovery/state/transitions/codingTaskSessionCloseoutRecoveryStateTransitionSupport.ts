import { rebuildCloseoutCheckpoint } from "#application/codingTaskSessionCloseoutState/validation/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";

import type {
  CodingTaskSessionCloseoutRecoveryState,
  CodingTaskSessionCloseoutRecoveryStateCheckpointInput,
  CodingTaskSessionCloseoutRecoveryStateResult,
  CodingTaskSessionCloseoutRecoveryStateTerminalInput,
} from "../contracts/index.js";
import type { CodingTaskSessionCloseoutRecoveryStateStatus } from "../enums/index.js";
import {
  freezeRecoveryState,
  rebuildCodingTaskSessionCloseoutRecoveryState,
} from "../validation/index.js";
import {
  hasExactKeys,
  invalid,
  isRecord,
  parseIsoUtc,
  parseSafeText,
  invalidTransition,
} from "../validation/index.js";

/** Recovery State 迁移时必须完整替换的可变字段集合。 */
export interface CodingTaskSessionCloseoutRecoveryStateChanges {
  /** 迁移后的状态。 */
  readonly status: CodingTaskSessionCloseoutRecoveryStateStatus;
  /** 迁移后的完整 Checkpoint 或空值。 */
  readonly checkpoint: ChangeSetCheckpoint | null;
  /** 迁移后的错误类别或空值。 */
  readonly errorCode: HarnessErrorCode | null;
  /** 迁移后的处理指引或空值。 */
  readonly recoveryGuidance: string | null;
  /** 迁移完成时间。 */
  readonly updatedAt: string;
}

/** 严格重建迁移前状态。 */
export function parseRecoveryState(
  input: unknown,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  return rebuildCodingTaskSessionCloseoutRecoveryState(input, digestPort);
}

/** 解析只更新时间的迁移输入。 */
export function parseTimestamp(input: unknown): Result<string, HarnessError> {
  if (!isRecord(input) || !hasExactKeys(input, ["updatedAt"])) {
    return failure(invalid("transition"));
  }
  return parseIsoUtc(input["updatedAt"], "updatedAt");
}

/** 解析并完整复验 Checkpoint 迁移输入。 */
export function parseCheckpointInput(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionCloseoutRecoveryStateCheckpointInput, HarnessError> {
  if (!isRecord(input) || !hasExactKeys(input, ["checkpoint", "updatedAt"])) {
    return failure(invalid("checkpoint"));
  }
  const updatedAt = parseIsoUtc(input["updatedAt"], "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return updatedAt;
  const checkpoint = rebuildCloseoutCheckpoint(input["checkpoint"], digestPort);
  if (checkpoint.status === ResultStatus.Failure) return checkpoint;
  return success({ checkpoint: checkpoint.value, updatedAt: updatedAt.value });
}

/** 解析带稳定错误和处理指引的终态迁移输入。 */
export function parseTerminalInput(
  input: unknown,
): Result<CodingTaskSessionCloseoutRecoveryStateTerminalInput, HarnessError> {
  if (!isRecord(input) || !hasExactKeys(input, ["errorCode", "recoveryGuidance", "updatedAt"])) {
    return failure(invalid("terminal"));
  }
  const errorCode = parseErrorCode(input["errorCode"]);
  if (errorCode.status === ResultStatus.Failure) return errorCode;
  const recoveryGuidance = parseSafeText(input["recoveryGuidance"], "recoveryGuidance");
  if (recoveryGuidance.status === ResultStatus.Failure) return recoveryGuidance;
  const updatedAt = parseIsoUtc(input["updatedAt"], "updatedAt");
  if (updatedAt.status === ResultStatus.Failure) return updatedAt;
  return success({
    errorCode: errorCode.value,
    recoveryGuidance: recoveryGuidance.value,
    updatedAt: updatedAt.value,
  });
}

/** 应用一次纯状态迁移，并再次通过完整 State 规则校验。 */
export function evolveRecoveryState(
  state: CodingTaskSessionCloseoutRecoveryState,
  changes: CodingTaskSessionCloseoutRecoveryStateChanges,
  digestPort: ContentDigestPort,
): CodingTaskSessionCloseoutRecoveryStateResult {
  if (state.version === Number.MAX_SAFE_INTEGER) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "Recovery State version 已达到安全整数上限。",
      ),
    );
  }
  if (Date.parse(changes.updatedAt) < Date.parse(state.updatedAt)) {
    return failure(invalidTransition("Recovery State updatedAt 不得早于当前状态。"));
  }
  const next = freezeRecoveryState({
    ...state,
    ...changes,
    version: state.version + 1,
  });
  return rebuildCodingTaskSessionCloseoutRecoveryState(next, digestPort);
}

function parseErrorCode(value: unknown): Result<HarnessErrorCode, HarnessError> {
  if (
    typeof value !== "string" ||
    !Object.values(HarnessErrorCode).includes(value as HarnessErrorCode)
  ) {
    return failure(invalid("errorCode"));
  }
  return success(value as HarnessErrorCode);
}
