import {
  block,
  CodingTaskSessionCloseoutStatus,
  markOutcomeUnknown,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus, failure } from "#common/index.js";

import type {
  CodingTaskSessionCloseoutManagerDependencies,
  CodingTaskSessionCloseoutRunResult,
} from "../contracts/index.js";
import { replaceTransition } from "./codingTaskSessionCloseoutOperations.service.js";

/** 把已知的前置失败落为 Blocked。 */
export async function persistBlocked(
  current: CodingTaskSessionCloseoutState,
  cause: HarnessError,
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
): Promise<CodingTaskSessionCloseoutRunResult> {
  try {
    const candidate = block(
      current,
      {
        errorCode: cause.code,
        recoveryGuidance: "修复已记录的 Closeout 前置条件后，由人工通过显式恢复流程决定后续动作。",
        updatedAt: nextTimestamp(current, dependencies),
      },
      dependencies.digest,
    );
    const persisted = await replaceTransition(current, candidate, dependencies);
    return persisted.result.status === ResultStatus.Success
      ? persisted
      : blockedTerminalFailure(current, cause, persisted.result.error);
  } catch (error) {
    return blockedTerminalFailure(
      current,
      cause,
      asInvocationError(error, "Closeout Blocked 状态构建抛出异常。"),
    );
  }
}

/** 把副作用或持久化结果未知记录为 OutcomeUnknown。 */
export async function persistUnknown(
  current: CodingTaskSessionCloseoutState,
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
  cause: HarnessError,
): Promise<CodingTaskSessionCloseoutRunResult> {
  try {
    const candidate = markOutcomeUnknown(
      current,
      {
        errorCode: cause.code,
        recoveryGuidance:
          "副作用或持久化结果无法证明，禁止自动重试；请先人工核对 Repository 状态。",
        updatedAt: nextTimestamp(current, dependencies),
      },
      dependencies.digest,
    );
    const persisted = await replaceTransition(current, candidate, dependencies);
    return persisted.result.status === ResultStatus.Success
      ? persisted
      : unknownTerminalFailure(current, cause, persisted.result.error);
  } catch (error) {
    return unknownTerminalFailure(
      current,
      cause,
      asInvocationError(error, "Closeout OutcomeUnknown 状态构建抛出异常。"),
    );
  }
}

/** 将 Checkpoint execute、inspect 或 bind 的未知结果统一标记为 Git 副作用未知。 */
export async function persistCheckpointUnknown(
  current: CodingTaskSessionCloseoutState,
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
  cause: HarnessError,
): Promise<CodingTaskSessionCloseoutRunResult> {
  return persistUnknown(
    current,
    dependencies,
    new HarnessError(
      HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
      "Checkpoint 副作用结果无法证明。",
      {},
      cause,
    ),
  );
}

/** Checkpoint 已成功但 State CAS 不确定时，尽力记录 OutcomeUnknown。 */
export async function persistUnknownAfterPersistenceFailure(
  current: CodingTaskSessionCloseoutState,
  persistenceError: HarnessError,
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
): Promise<CodingTaskSessionCloseoutRunResult> {
  const unknown = await persistUnknown(
    current,
    dependencies,
    new HarnessError(
      HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
      "Checkpoint 已成功但 Closeout State 持久化结果无法证明。",
      {},
      persistenceError,
    ),
  );
  if (unknown.result.status === ResultStatus.Success) return unknown;
  return {
    result: failure(
      new HarnessError(
        HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
        "Checkpoint 已成功，但绑定状态与 OutcomeUnknown 状态均无法可靠持久化。",
        {
          bindingPersistenceErrorCode: persistenceError.code,
          terminalPersistenceErrorCode: unknown.result.error.code,
        },
        new AggregateError(
          [persistenceError, unknown.result.error],
          "Closeout Checkpoint 状态闭合失败。",
        ),
      ),
    ),
    state: current,
  };
}

/** 让时钟抛错或回拨时仍满足 Closeout State updatedAt 单调不减。 */
export function nextTimestamp(
  current: CodingTaskSessionCloseoutState,
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
): string {
  try {
    const now = dependencies.clock.now().toISOString();
    return Date.parse(now) >= Date.parse(current.updatedAt) ? now : current.updatedAt;
  } catch {
    return current.updatedAt;
  }
}

/** 判断是否为不可自动推进的 Closeout 终态。 */
export function isTerminal(state: CodingTaskSessionCloseoutState): boolean {
  return (
    state.status === CodingTaskSessionCloseoutStatus.Blocked ||
    state.status === CodingTaskSessionCloseoutStatus.OutcomeUnknown ||
    state.status === CodingTaskSessionCloseoutStatus.CheckpointBound
  );
}

function asInvocationError(error: unknown, message: string): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, message, {}, error);
}

function blockedTerminalFailure(
  current: CodingTaskSessionCloseoutState,
  cause: HarnessError,
  terminalError: HarnessError,
): CodingTaskSessionCloseoutRunResult {
  return {
    result: failure(
      new HarnessError(
        cause.code,
        "Closeout 已明确阻断，但 Blocked 状态无法可靠持久化。",
        { terminalPersistenceErrorCode: terminalError.code },
        new AggregateError([cause, terminalError], "Closeout Blocked 状态闭合失败。"),
      ),
    ),
    state: current,
  };
}

function unknownTerminalFailure(
  current: CodingTaskSessionCloseoutState,
  cause: HarnessError,
  terminalError: HarnessError,
): CodingTaskSessionCloseoutRunResult {
  return {
    result: failure(
      new HarnessError(
        resolveOutcomeUnknownErrorCode(cause.code),
        "Closeout 结果未知，且 OutcomeUnknown 状态无法可靠持久化。",
        { terminalPersistenceErrorCode: terminalError.code },
        new AggregateError([cause, terminalError], "Closeout OutcomeUnknown 状态闭合失败。"),
      ),
    ),
    state: current,
  };
}

function resolveOutcomeUnknownErrorCode(code: HarnessErrorCode): HarnessErrorCode {
  return [
    HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
    HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown,
    HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
  ].includes(code)
    ? code
    : HarnessErrorCode.CodingTaskSessionCloseoutOutcomeUnknown;
}
