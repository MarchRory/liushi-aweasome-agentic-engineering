import type { CodingTaskSessionAdmissionStateStore } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  markOutcomeUnknown,
  sameCodingTaskSessionAdmissionPending,
  type CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";

import { sessionAdmissionCommitUnknown } from "./sessionActionAdmissionCoordinatorUtils.js";

/** 将已经开始的 Session Action 跨 Store 提交统一持久化为未知态。 */
export async function persistSessionAdmissionOutcomeUnknown(
  stateStore: CodingTaskSessionAdmissionStateStore,
  state: CodingTaskSessionAdmissionState,
  updatedAt: string,
  cause: HarnessError,
  resultMessage: string,
): Promise<Result<never, HarnessError>> {
  const unknown = markOutcomeUnknown(state, { updatedAt });
  if (unknown.status === ResultStatus.Failure) {
    return failure(sessionAdmissionCommitUnknown("无法标记 Admission outcome_unknown。", cause));
  }
  const persisted = await persistOutcomeUnknownMarker(stateStore, state, unknown.value);
  return failure(
    sessionAdmissionCommitUnknown(
      resultMessage,
      persisted.status === ResultStatus.Failure ? persisted.error : cause,
    ),
  );
}

/** 在前序 State replace 结果未知时，先读取权威快照，再提交终止态。 */
export async function reconcileSessionAdmissionOutcomeUnknown(
  stateStore: CodingTaskSessionAdmissionStateStore,
  candidates: readonly CodingTaskSessionAdmissionState[],
  updatedAt: string,
  cause: HarnessError,
  resultMessage: string,
): Promise<Result<never, HarnessError>> {
  const first = candidates[0];
  if (first === undefined) {
    return failure(
      sessionAdmissionCommitUnknown(
        resultMessage,
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Admission outcome_unknown 对账缺少候选状态。",
        ),
      ),
    );
  }
  const loaded = await stateStore.load({
    workspaceId: first.workspaceId,
    sessionId: first.sessionId,
  });
  if (loaded.status === ResultStatus.Failure) {
    return failure(sessionAdmissionCommitUnknown(resultMessage, loaded.error));
  }
  if (!candidates.some((candidate) => sameAdmissionState(candidate, loaded.value))) {
    return failure(
      sessionAdmissionCommitUnknown(
        resultMessage,
        new HarnessError(
          HarnessErrorCode.VersionConflict,
          "Admission State 提交结果无法与允许的前后快照对账。",
          {
            actualVersion: String(loaded.value.version),
            candidateVersions: candidates.map((candidate) => candidate.version).join(","),
          },
          cause,
        ),
      ),
    );
  }
  return persistSessionAdmissionOutcomeUnknown(
    stateStore,
    loaded.value,
    updatedAt,
    cause,
    resultMessage,
  );
}

async function persistOutcomeUnknownMarker(
  stateStore: CodingTaskSessionAdmissionStateStore,
  previous: CodingTaskSessionAdmissionState,
  unknown: CodingTaskSessionAdmissionState,
): Promise<Result<void, HarnessError>> {
  const first = await stateStore.replace({
    expectedVersion: previous.version,
    state: unknown,
  });
  if (first.status === ResultStatus.Success) return success(undefined);

  const verified = await stateStore.load({
    workspaceId: previous.workspaceId,
    sessionId: previous.sessionId,
  });
  if (verified.status === ResultStatus.Failure) return failure(first.error);
  if (sameAdmissionState(verified.value, unknown)) return success(undefined);
  if (!sameAdmissionState(verified.value, previous)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
        "Admission outcome_unknown 写入后出现无法对账的状态。",
        {
          actualVersion: String(verified.value.version),
          expectedVersion: String(previous.version),
          unknownVersion: String(unknown.version),
        },
        first.error,
      ),
    );
  }

  const retried = await stateStore.replace({
    expectedVersion: previous.version,
    state: unknown,
  });
  if (retried.status === ResultStatus.Success) return success(undefined);
  const replayed = await stateStore.load({
    workspaceId: previous.workspaceId,
    sessionId: previous.sessionId,
  });
  return replayed.status === ResultStatus.Success && sameAdmissionState(replayed.value, unknown)
    ? success(undefined)
    : failure(retried.error);
}

function sameAdmissionState(
  left: CodingTaskSessionAdmissionState,
  right: CodingTaskSessionAdmissionState,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.activationBindingDigest === right.activationBindingDigest &&
    left.sessionBindingDigest === right.sessionBindingDigest &&
    left.status === right.status &&
    samePending(left, right) &&
    left.admittedActionIds.length === right.admittedActionIds.length &&
    left.admittedActionIds.every(
      (actionId, index) => actionId === right.admittedActionIds[index],
    ) &&
    left.claimedExecutorSessionIdDigest === right.claimedExecutorSessionIdDigest &&
    left.version === right.version &&
    left.updatedAt === right.updatedAt
  );
}

function samePending(
  left: CodingTaskSessionAdmissionState,
  right: CodingTaskSessionAdmissionState,
): boolean {
  return left.pendingAdmission === null && right.pendingAdmission === null
    ? true
    : sameCodingTaskSessionAdmissionPending(left.pendingAdmission, right.pendingAdmission);
}
