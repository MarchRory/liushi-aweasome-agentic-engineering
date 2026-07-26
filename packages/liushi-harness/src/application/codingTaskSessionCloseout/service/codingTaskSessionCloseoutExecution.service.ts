import {
  bindCheckpoint,
  persistSnapshot,
  CodingTaskSessionCloseoutStatus,
} from "#application/codingTaskSessionCloseoutState/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus, success } from "#common/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";

import type {
  CodingTaskSessionCloseoutRunResult,
  CodingTaskSessionCloseoutStateMachineInput,
} from "../contracts/index.js";
import {
  isCodingTaskSessionAdmissionOutcomeUnknownFailure,
  isCodingTaskSessionCloseoutBlockingFailure,
  isCodingTaskSessionCloseoutRetryableLockFailure,
} from "../validation/index.js";
import {
  createCheckpointInput,
  createSnapshotInput,
  invokeAdmission,
  invokeCheckpoint,
  invokeCheckpointInspection,
  invokeCoverage,
  invokeSnapshot,
  replaceTransition,
} from "./codingTaskSessionCloseoutOperations.service.js";
import {
  isTerminal,
  nextTimestamp,
  persistBlocked,
  persistCheckpointUnknown,
  persistUnknown,
  persistUnknownAfterPersistenceFailure,
} from "./codingTaskSessionCloseoutTerminalPersistence.service.js";

/** 在 Repository Lock 内推进 Closeout State，并严格停止在 CheckpointBound。 */
export async function executeCodingTaskSessionCloseoutStateMachine(
  input: CodingTaskSessionCloseoutStateMachineInput,
): Promise<CodingTaskSessionCloseoutRunResult> {
  let current = input.state;
  if (isTerminal(current)) return { result: success(current), state: current };

  if (current.status === CodingTaskSessionCloseoutStatus.Closing) {
    const admission = await invokeAdmission(input);
    if (admission.status === ResultStatus.Failure) {
      if (isCodingTaskSessionCloseoutRetryableLockFailure(admission.error.code)) {
        return { result: admission, state: current };
      }
      if (isCodingTaskSessionCloseoutBlockingFailure(admission.error.code)) {
        return persistBlocked(current, admission.error, input.dependencies);
      }
      return isCodingTaskSessionAdmissionOutcomeUnknownFailure(admission.error.code)
        ? persistUnknown(current, input.dependencies, admission.error)
        : { result: admission, state: current };
    }
    const coverage = await invokeCoverage(input);
    if (coverage.status === ResultStatus.Failure) {
      if (isCodingTaskSessionCloseoutRetryableLockFailure(coverage.error.code)) {
        return { result: coverage, state: current };
      }
      return isCodingTaskSessionCloseoutBlockingFailure(coverage.error.code)
        ? persistBlocked(current, coverage.error, input.dependencies)
        : { result: coverage, state: current };
    }
    const snapshot = await invokeSnapshot(input.dependencies, createSnapshotInput(input.authority));
    if (snapshot.status === ResultStatus.Failure) {
      if (isCodingTaskSessionCloseoutRetryableLockFailure(snapshot.error.code)) {
        return { result: snapshot, state: current };
      }
      return isCodingTaskSessionCloseoutBlockingFailure(snapshot.error.code)
        ? persistBlocked(current, snapshot.error, input.dependencies)
        : { result: snapshot, state: current };
    }
    let persisted;
    try {
      persisted = persistSnapshot(
        current,
        {
          snapshot: snapshot.value,
          coverageManifest: coverage.value,
          updatedAt: nextTimestamp(current, input.dependencies),
        },
        input.dependencies.digest,
      );
    } catch (error) {
      return {
        result: {
          status: ResultStatus.Failure,
          error: unexpectedFailure("Closeout Snapshot 状态转换抛出异常。", error),
        },
        state: current,
      };
    }
    if (persisted.status === ResultStatus.Failure) {
      return isCodingTaskSessionCloseoutBlockingFailure(persisted.error.code)
        ? persistBlocked(current, persisted.error, input.dependencies)
        : { result: persisted, state: current };
    }
    const stored = await replaceTransition(current, persisted, input.dependencies);
    if (stored.result.status === ResultStatus.Failure) return stored;
    current = stored.state!;
  }

  if (
    current.status !== CodingTaskSessionCloseoutStatus.SnapshotPersisted ||
    current.snapshot === null
  ) {
    return persistUnknown(
      current,
      input.dependencies,
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "Closeout Snapshot 状态缺少完整 Snapshot。",
      ),
    );
  }
  const checkpointInput = createCheckpointInput(input.authority, current.snapshot);
  const executed = await invokeCheckpoint(input.dependencies, checkpointInput);
  if (executed.status === ResultStatus.Failure) {
    if (executed.error.code === HarnessErrorCode.LockUnavailable) {
      return { result: executed, state: current };
    }
    return persistCheckpointUnknown(current, input.dependencies, executed.error);
  }
  if (executed.value.outcome === ActionOutcome.NotApplied) {
    return persistBlocked(
      current,
      new HarnessError(
        HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
        "Checkpoint 已明确未应用，Closeout 已停止自动重试。",
      ),
      input.dependencies,
    );
  }
  if (executed.value.outcome !== ActionOutcome.Succeeded) {
    return persistCheckpointUnknown(
      current,
      input.dependencies,
      new HarnessError(
        HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
        "Checkpoint 执行结果无法证明，Closeout 已停止自动重试。",
      ),
    );
  }
  const inspected = await invokeCheckpointInspection(input.dependencies, checkpointInput);
  if (inspected.status === ResultStatus.Failure) {
    return persistCheckpointUnknown(current, input.dependencies, inspected.error);
  }
  let bound;
  try {
    bound = bindCheckpoint(
      current,
      { checkpoint: inspected.value, updatedAt: nextTimestamp(current, input.dependencies) },
      input.dependencies.digest,
    );
  } catch (error) {
    return persistCheckpointUnknown(
      current,
      input.dependencies,
      unexpectedFailure("Checkpoint 绑定状态转换抛出异常。", error),
    );
  }
  if (bound.status === ResultStatus.Failure) {
    return persistCheckpointUnknown(current, input.dependencies, bound.error);
  }
  const stored = await replaceTransition(current, bound, input.dependencies);
  if (stored.result.status === ResultStatus.Failure) {
    return persistUnknownAfterPersistenceFailure(current, stored.result.error, input.dependencies);
  }
  return stored;
}

function unexpectedFailure(message: string, cause: unknown): HarnessError {
  return cause instanceof HarnessError
    ? cause
    : new HarnessError(HarnessErrorCode.IoFailure, message, {}, cause);
}
