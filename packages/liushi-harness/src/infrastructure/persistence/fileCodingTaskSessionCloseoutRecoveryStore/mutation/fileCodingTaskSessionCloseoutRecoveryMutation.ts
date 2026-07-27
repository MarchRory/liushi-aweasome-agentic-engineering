import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import type { FileLockManager } from "#infrastructure/persistence/fileEventStore/index.js";

import type { CodingTaskSessionCloseoutRecoveryStorePaths } from "../contracts/index.js";
import {
  codingTaskSessionCloseoutRecoveryLockReleaseUnknown,
  codingTaskSessionCloseoutRecoveryStateNotFound,
} from "../errors/index.js";
import { ensureCodingTaskSessionCloseoutRecoveryStorePath } from "../validation/index.js";

/** 受 Recovery State 独立短时锁保护的 mutation 输入。 */
export interface CodingTaskSessionCloseoutRecoveryMutationInput<T> {
  /** Recovery State 与锁的精确路径。 */
  readonly paths: CodingTaskSessionCloseoutRecoveryStorePaths;
  /** 是否允许创建缺失的 Session 目录。 */
  readonly createMissing: boolean;
  /** 跨进程文件锁管理器。 */
  readonly lockManager: FileLockManager;
  /** 锁内只执行一次的 mutation。 */
  readonly operation: () => Promise<Result<T, HarnessError>>;
}

/** 获取独立 Recovery 锁、二次校验路径、执行 mutation 并分类释放失败。 */
export async function withCodingTaskSessionCloseoutRecoveryMutationLock<T>(
  input: CodingTaskSessionCloseoutRecoveryMutationInput<T>,
): Promise<Result<T, HarnessError>> {
  const prepared = await ensureCodingTaskSessionCloseoutRecoveryStorePath(
    input.paths,
    input.createMissing,
  );
  if (prepared.status === ResultStatus.Failure) return prepared;
  if (!prepared.value) return failure(codingTaskSessionCloseoutRecoveryStateNotFound());

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
        : new HarnessError(HarnessErrorCode.IoFailure, "Recovery State Lock 获取失败。", {}, error),
    );
  }

  let result: Result<T, HarnessError>;
  try {
    const rechecked = await ensureCodingTaskSessionCloseoutRecoveryStorePath(
      input.paths,
      input.createMissing,
    );
    result =
      rechecked.status === ResultStatus.Failure
        ? rechecked
        : !rechecked.value
          ? failure(codingTaskSessionCloseoutRecoveryStateNotFound())
          : await input.operation();
  } catch (error) {
    result = failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(HarnessErrorCode.IoFailure, "Recovery State mutation 失败。", {}, error),
    );
  }

  try {
    await lock.release();
  } catch (error) {
    return failure(
      codingTaskSessionCloseoutRecoveryLockReleaseUnknown(
        input.paths.stateFile,
        error,
        result.status === ResultStatus.Failure ? result.error : undefined,
      ),
    );
  }
  return result;
}
