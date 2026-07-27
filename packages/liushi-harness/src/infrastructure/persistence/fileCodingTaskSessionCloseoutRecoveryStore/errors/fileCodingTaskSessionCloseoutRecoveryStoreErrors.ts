import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 构造 Recovery State 不存在错误。 */
export function codingTaskSessionCloseoutRecoveryStateNotFound(): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, "Closeout Recovery State 不存在。");
}

/** 保留严格读取的运行时故障，并将内容或路径身份异常映射为损坏状态。 */
export function asCodingTaskSessionCloseoutRecoveryReadError(error: HarnessError): HarnessError {
  if (
    error.code === HarnessErrorCode.IoFailure ||
    error.code === HarnessErrorCode.PreconditionNotMet
  ) {
    return error;
  }
  return new HarnessError(HarnessErrorCode.CorruptStore, "Recovery State JSON 无效。", {}, error);
}

/** 构造 Recovery State 提交结果未知错误。 */
export function codingTaskSessionCloseoutRecoveryCommitOutcomeUnknown(
  stateFile: string,
  cause?: unknown,
  reason?: string,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown,
    "Closeout Recovery State 提交结果未知，禁止自动重试。",
    {
      outputFilePath: stateFile,
      ...(reason === undefined ? {} : { reason }),
    },
    cause,
  );
}

/** 构造 Recovery State 锁释放结果未知错误，并保留原操作结果。 */
export function codingTaskSessionCloseoutRecoveryLockReleaseUnknown(
  stateFile: string,
  releaseCause: unknown,
  operationError?: HarnessError,
): HarnessError {
  const cause =
    operationError === undefined
      ? releaseCause
      : new AggregateError([operationError, releaseCause], "Recovery mutation 与锁释放均失败。");
  return new HarnessError(
    HarnessErrorCode.CodingTaskSessionCloseoutRecoveryLockReleaseUnknown,
    "Closeout Recovery State Lock 释放结果未知，必须先恢复锁状态。",
    {
      outputFilePath: stateFile,
      ...(operationError === undefined ? {} : { operationErrorCode: operationError.code }),
    },
    cause,
  );
}

/** 按写入是否已经开始，将 mutation 异常映射为确定失败或结果未知。 */
export function asCodingTaskSessionCloseoutRecoveryMutationError(
  error: unknown,
  stateFile: string,
  mutationStarted: boolean,
): HarnessError {
  if (error instanceof HarnessError) {
    if (error.code === HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown) {
      return error;
    }
    if (!mutationStarted) return error;
  }
  return mutationStarted
    ? codingTaskSessionCloseoutRecoveryCommitOutcomeUnknown(stateFile, error)
    : new HarnessError(
        HarnessErrorCode.IoFailure,
        "Closeout Recovery State 写入失败。",
        { stateFile },
        error,
      );
}
