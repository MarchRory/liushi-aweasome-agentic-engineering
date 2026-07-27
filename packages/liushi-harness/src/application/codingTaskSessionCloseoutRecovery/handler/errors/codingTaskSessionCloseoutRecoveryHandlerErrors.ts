import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 创建或替换 Recovery State 时出现未确认结果。 */
export function recoveryStoreOutcomeUnknown(cause: unknown): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown,
    "Closeout Recovery State 写入结果无法确认。",
    {},
    cause,
  );
}

/** 将 Repository Lock 释放失败提升为不可自动恢复的专属错误。 */
export function repositoryLockReleaseUnknown(
  operationError: HarnessError | undefined,
  releaseError: HarnessError,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CodingTaskSessionCloseoutRecoveryRepositoryLockReleaseUnknown,
    "Closeout Recovery Repository Lock 释放结果无法确认。",
    operationError === undefined ? {} : { operationErrorCode: operationError.code },
    operationError === undefined
      ? releaseError
      : new AggregateError(
          [operationError, releaseError],
          "Closeout Recovery 操作与 Repository Lock 释放均失败。",
        ),
  );
}

/** 把不能继续自动执行的状态投影为稳定失败。 */
export function terminalRecoveryError(code: HarnessErrorCode, message: string): HarnessError {
  return new HarnessError(code, message);
}
