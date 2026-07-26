import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 构造 Closeout State 不存在错误。 */
export function closeoutStateNotFound(): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, "Closeout State 不存在。");
}

/** 构造 State 写入结果未知错误。 */
export function closeoutStateCommitUnknown(
  stateFile: string,
  cause?: unknown,
  reason?: string,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown,
    "Closeout State 提交结果未知，禁止自动重试。",
    {
      outputFilePath: stateFile,
      ...(reason === undefined ? {} : { reason }),
    },
    cause,
  );
}

/** 构造 Lock 释放结果未知错误，并保留原操作结果。 */
export function closeoutStateLockReleaseUnknown(
  stateFile: string,
  releaseCause: unknown,
  operationError?: HarnessError,
): HarnessError {
  const cause =
    operationError === undefined
      ? releaseCause
      : new AggregateError([operationError, releaseCause], "Closeout mutation 与锁释放均失败。");
  return new HarnessError(
    HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown,
    "Closeout State Lock 释放结果未知，必须先恢复锁状态。",
    {
      outputFilePath: stateFile,
      ...(operationError === undefined ? {} : { operationErrorCode: operationError.code }),
    },
    cause,
  );
}

/** 按写入是否开始，把 mutation 异常映射为确定失败或结果未知。 */
export function asCloseoutStateMutationError(
  error: unknown,
  stateFile: string,
  mutationStarted: boolean,
): HarnessError {
  if (error instanceof HarnessError) {
    if (error.code === HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown) {
      return error;
    }
    if (!mutationStarted) return error;
  }
  return mutationStarted
    ? closeoutStateCommitUnknown(stateFile, error)
    : new HarnessError(
        HarnessErrorCode.IoFailure,
        "Closeout State 写入失败。",
        { stateFile },
        error,
      );
}
