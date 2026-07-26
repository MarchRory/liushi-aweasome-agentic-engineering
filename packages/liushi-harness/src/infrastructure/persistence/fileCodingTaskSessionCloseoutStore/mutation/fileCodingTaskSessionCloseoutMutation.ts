import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import type { FileLockManager } from "#infrastructure/persistence/fileEventStore/index.js";

import type { CodingTaskSessionCloseoutStorePaths } from "../contracts/index.js";
import { closeoutStateLockReleaseUnknown, closeoutStateNotFound } from "../errors/index.js";
import { ensureCodingTaskSessionCloseoutStorePath } from "../validation/index.js";

/** 受内部短时锁保护的 Closeout State mutation 输入。 */
export interface CodingTaskSessionCloseoutMutationInput<T> {
  /** Closeout State 与 Lock 路径。 */
  readonly paths: CodingTaskSessionCloseoutStorePaths;
  /** 是否允许创建缺失的目录层级。 */
  readonly createMissing: boolean;
  /** 跨进程文件锁管理器。 */
  readonly lockManager: FileLockManager;
  /** 在锁内执行且只执行一次的 mutation。 */
  readonly operation: () => Promise<Result<T, HarnessError>>;
}

/** 在同一短时锁内复核路径、执行 mutation 并分类释放失败。 */
export async function withCodingTaskSessionCloseoutMutationLock<T>(
  input: CodingTaskSessionCloseoutMutationInput<T>,
): Promise<Result<T, HarnessError>> {
  const prepared = await ensureCodingTaskSessionCloseoutStorePath(input.paths, input.createMissing);
  if (prepared.status === ResultStatus.Failure) return prepared;
  if (!prepared.value) return failure(closeoutStateNotFound());

  let lock;
  try {
    lock = await input.lockManager.acquire(input.paths.lockFile, {
      workspaceId: input.paths.workspaceId,
      taskId: input.paths.sessionId,
    });
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(HarnessErrorCode.IoFailure, "Closeout State Lock 获取失败。", {}, error),
    );
  }

  let result: Result<T, HarnessError>;
  try {
    const rechecked = await ensureCodingTaskSessionCloseoutStorePath(
      input.paths,
      input.createMissing,
    );
    result =
      rechecked.status === ResultStatus.Failure
        ? rechecked
        : !rechecked.value
          ? failure(closeoutStateNotFound())
          : await input.operation();
  } catch (error) {
    result = failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(HarnessErrorCode.IoFailure, "Closeout State mutation 失败。", {}, error),
    );
  }

  try {
    await lock.release();
  } catch (error) {
    return failure(
      closeoutStateLockReleaseUnknown(
        input.paths.stateFile,
        error,
        result.status === ResultStatus.Failure ? result.error : undefined,
      ),
    );
  }
  return result;
}
