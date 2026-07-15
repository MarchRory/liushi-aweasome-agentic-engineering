import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";

/** 将提交前异常映射为稳定错误类别。 */
export function mapExecutorCompatibilityPreWriteError(
  error: unknown,
  message: string,
): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, message, {}, error);
}

/** 创建禁止自动重试的提交结果未知错误。 */
export function createExecutorCompatibilityCommitOutcomeUnknown(error: unknown): HarnessError {
  return error instanceof HarnessError && isExecutorCompatibilityCommitOutcomeUnknown(error)
    ? error
    : new HarnessError(
        HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown,
        "Executor Compatibility 持久化结果未知，禁止自动重试。",
        {},
        error,
      );
}

/** 判断错误是否已经被分类为提交结果未知。 */
export function isExecutorCompatibilityCommitOutcomeUnknown(error: unknown): boolean {
  return (
    error instanceof HarnessError &&
    error.code === HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown
  );
}

/** 在尚未写入时释放锁，失败保持稳定 Lock 错误。 */
export async function releaseExecutorCompatibilityLockBeforeWrite(
  lock: ExclusiveFileLockHandle,
): Promise<void> {
  try {
    await lock.release();
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.LockUnavailable,
      "Executor Compatibility 文件锁释放失败。",
      {},
      error,
    );
  }
}

/** 在写入完成后释放锁，失败升级为提交结果未知。 */
export async function releaseExecutorCompatibilityLockAfterWrite(
  lock: ExclusiveFileLockHandle,
): Promise<void> {
  try {
    await lock.release();
  } catch (error) {
    throw createExecutorCompatibilityCommitOutcomeUnknown(error);
  }
}

/** 恢复路径尽力释放锁，并把失败作为次要异常返回。 */
export async function releaseExecutorCompatibilityLockBestEffort(
  lock: ExclusiveFileLockHandle,
): Promise<unknown> {
  try {
    await lock.release();
    return undefined;
  } catch (error) {
    // 恢复路径不能用第二个释放异常覆盖原始失败。
    return error;
  }
}

/** 在保留主异常的同时附加恢复异常。 */
export function combineExecutorCompatibilityErrors(primary: unknown, secondary: unknown): unknown {
  return secondary === undefined ? primary : new AggregateError([primary, secondary]);
}
