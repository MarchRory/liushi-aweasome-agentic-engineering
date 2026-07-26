import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import { CodingTaskSessionAdmissionStatus } from "../enums/index.js";
import type {
  CodingTaskSessionAdmissionBeginPendingInput,
  CodingTaskSessionAdmissionCommitPendingInput,
  CodingTaskSessionAdmissionPending,
  CodingTaskSessionAdmissionState,
  CodingTaskSessionAdmissionTimestampInput,
} from "../contracts/index.js";
import {
  freezeCodingTaskSessionAdmissionState,
  parseCodingTaskSessionAdmissionBeginPendingInput,
  parseCodingTaskSessionAdmissionCommitPendingInput,
  parseCodingTaskSessionAdmissionTimestampInput,
  rebuildCodingTaskSessionAdmissionState,
} from "./codingTaskSessionAdmissionValidation.js";

/** 开始一个仅允许存在一个的 Admission Pending，并首次固定 executor session claim。 */
export function beginPending(
  state: CodingTaskSessionAdmissionState,
  input: CodingTaskSessionAdmissionBeginPendingInput,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  const current = validState(state);
  if (current.status === ResultStatus.Failure) return current;
  const pending = parseCodingTaskSessionAdmissionBeginPendingInput(input);
  if (pending.status === ResultStatus.Failure) return pending;
  if (current.value.status !== CodingTaskSessionAdmissionStatus.WaitingAgent) {
    return transitionError(current.value, "当前 Admission 状态不允许开始 Pending");
  }
  if (current.value.pendingAdmission !== null) {
    return transitionError(current.value, "已有 Admission Pending 未完成");
  }
  if (
    current.value.claimedExecutorSessionIdDigest !== null &&
    current.value.claimedExecutorSessionIdDigest !== pending.value.executorSessionIdDigest
  ) {
    return transitionError(current.value, "executor session claim 不一致", {
      field: "executorSessionIdDigest",
    });
  }
  const { updatedAt, ...pendingAdmission } = pending.value;
  return success(
    nextState(current.value, {
      pendingAdmission,
      claimedExecutorSessionIdDigest:
        current.value.claimedExecutorSessionIdDigest ?? pending.value.executorSessionIdDigest,
      updatedAt,
    }),
  );
}

/** 精确匹配 Pending 身份，并将其原子移动到去重后的 admittedActionIds。 */
export function commitPending(
  state: CodingTaskSessionAdmissionState,
  input: CodingTaskSessionAdmissionCommitPendingInput,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  const current = validState(state);
  if (current.status === ResultStatus.Failure) return current;
  const pending = parseCodingTaskSessionAdmissionCommitPendingInput(input);
  if (pending.status === ResultStatus.Failure) return pending;
  if (current.value.status !== CodingTaskSessionAdmissionStatus.WaitingAgent) {
    return transitionError(current.value, "当前 Admission 状态不允许提交 Pending");
  }
  if (!samePending(current.value.pendingAdmission, pending.value)) {
    return transitionError(current.value, "提交的 Pending 身份与持久化 Pending 不匹配");
  }
  const { updatedAt } = pending.value;
  const admittedActionIds = current.value.admittedActionIds.includes(pending.value.actionId)
    ? current.value.admittedActionIds
    : [...current.value.admittedActionIds, pending.value.actionId];
  return success(
    nextState(current.value, {
      pendingAdmission: null,
      admittedActionIds,
      updatedAt,
    }),
  );
}

/** 在同一 Admission 状态锁保护下开始关闭；存在 Pending 时拒绝迁移。 */
export function beginClosing(
  state: CodingTaskSessionAdmissionState,
  input: CodingTaskSessionAdmissionTimestampInput,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  return transitionWithoutPending(state, input, CodingTaskSessionAdmissionStatus.Closing, "关闭");
}

/** 从可执行或关闭状态标记提交结果未知，并阻断后续 Admission 与 Closeout。 */
export function markOutcomeUnknown(
  state: CodingTaskSessionAdmissionState,
  input: CodingTaskSessionAdmissionTimestampInput,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  const current = validState(state);
  if (current.status === ResultStatus.Failure) return current;
  const timestamp = parseCodingTaskSessionAdmissionTimestampInput(input);
  if (timestamp.status === ResultStatus.Failure) return timestamp;
  if (
    current.value.status !== CodingTaskSessionAdmissionStatus.WaitingAgent &&
    current.value.status !== CodingTaskSessionAdmissionStatus.Closing
  ) {
    return transitionError(current.value, "当前 Admission 状态不允许标记 outcome_unknown");
  }
  return success(
    nextState(current.value, {
      status: CodingTaskSessionAdmissionStatus.OutcomeUnknown,
      updatedAt: timestamp.value.updatedAt,
    }),
  );
}

/** 校验两个 Pending 是否拥有完全相同的 action 与摘要身份。 */
export function sameCodingTaskSessionAdmissionPending(
  left: CodingTaskSessionAdmissionPending | null,
  right: CodingTaskSessionAdmissionPending | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.actionId === right.actionId &&
    left.intentDigest === right.intentDigest &&
    left.executorSessionIdDigest === right.executorSessionIdDigest
  );
}

function transitionWithoutPending(
  state: CodingTaskSessionAdmissionState,
  input: CodingTaskSessionAdmissionTimestampInput,
  status: CodingTaskSessionAdmissionStatus,
  operation: string,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  const current = validState(state);
  if (current.status === ResultStatus.Failure) return current;
  const timestamp = parseCodingTaskSessionAdmissionTimestampInput(input);
  if (timestamp.status === ResultStatus.Failure) return timestamp;
  if (
    status === CodingTaskSessionAdmissionStatus.Closing &&
    current.value.status === CodingTaskSessionAdmissionStatus.Closing &&
    current.value.pendingAdmission === null
  ) {
    return success(current.value);
  }
  if (current.value.status !== CodingTaskSessionAdmissionStatus.WaitingAgent) {
    return transitionError(current.value, `当前 Admission 状态不允许开始${operation}`);
  }
  if (current.value.pendingAdmission !== null) {
    return transitionError(current.value, `${operation}前不得存在 Admission Pending`);
  }
  return success(nextState(current.value, { status, updatedAt: timestamp.value.updatedAt }));
}

function validState(
  state: CodingTaskSessionAdmissionState,
): Result<CodingTaskSessionAdmissionState, HarnessError> {
  return rebuildCodingTaskSessionAdmissionState(state);
}

function samePending(
  left: CodingTaskSessionAdmissionPending | null,
  right: CodingTaskSessionAdmissionPending,
): boolean {
  return sameCodingTaskSessionAdmissionPending(left, right);
}

function nextState(
  state: CodingTaskSessionAdmissionState,
  changes: Partial<CodingTaskSessionAdmissionState>,
): CodingTaskSessionAdmissionState {
  return freezeCodingTaskSessionAdmissionState({
    ...state,
    ...changes,
    version: state.version + 1,
  });
}

function transitionError(
  state: CodingTaskSessionAdmissionState,
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidStateTransition, message, {
      status: state.status,
      ...details,
    }),
  );
}
