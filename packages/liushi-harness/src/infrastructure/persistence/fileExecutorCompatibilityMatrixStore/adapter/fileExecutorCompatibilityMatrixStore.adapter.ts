import {
  ExecutorCompatibilityWriteDisposition,
  type ExecutorCompatibilityMatrixRecord,
  type ExecutorCompatibilityMatrixStore,
  type ExecutorCompatibilityMatrixWriteResult,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  failure,
  success,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";
import {
  combineExecutorCompatibilityErrors,
  createExecutorCompatibilityCommitOutcomeUnknown,
  isExecutorCompatibilityCommitOutcomeUnknown,
  mapExecutorCompatibilityPreWriteError,
  releaseExecutorCompatibilityLockAfterWrite,
  releaseExecutorCompatibilityLockBeforeWrite,
  releaseExecutorCompatibilityLockBestEffort,
} from "#infrastructure/persistence/executorCompatibilityStoreSupport/index.js";

import type { FileExecutorCompatibilityMatrixStoreDependencies } from "../contracts/index.js";
import {
  readExecutorCompatibilityMatrixFile,
  writeExecutorCompatibilityMatrixFile,
} from "../io/index.js";
import {
  assertExecutorCompatibilityMatrixStorePathsSafe,
  parseExecutorCompatibilityMatrixDigest,
  resolveExecutorCompatibilityMatrixStorePaths,
} from "../path/index.js";
import {
  assertPersistedExecutorCompatibilityMatrixRecordIntegrity,
  validateExecutorCompatibilityMatrixRecord,
} from "../validation/index.js";

/** 以不可变内容寻址文件持久化完整 Executor Compatibility Matrix 与 Policy。 */
export class FileExecutorCompatibilityMatrixStore implements ExecutorCompatibilityMatrixStore {
  /** 注入 Runtime Store 根目录和既有锁、耐久性及摘要设施。 */
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileExecutorCompatibilityMatrixStoreDependencies,
  ) {}

  /** 校验完整记录后执行首次写入或同内容幂等复用。 */
  public async persist(
    record: ExecutorCompatibilityMatrixRecord,
  ): Promise<Result<ExecutorCompatibilityMatrixWriteResult, HarnessErrorType>> {
    let validated: ExecutorCompatibilityMatrixRecord;
    try {
      validated = validateExecutorCompatibilityMatrixRecord(record, this.dependencies.digest);
    } catch (error) {
      return failure(
        mapExecutorCompatibilityPreWriteError(error, "Executor Compatibility Matrix 校验失败。"),
      );
    }

    const matrixDigest = validated.matrix.matrixDigest;
    const paths = resolveExecutorCompatibilityMatrixStorePaths(this.storeRoot, matrixDigest);
    try {
      await assertExecutorCompatibilityMatrixStorePathsSafe(this.storeRoot, [
        paths.recordFile,
        paths.lockFile,
      ]);
    } catch (error) {
      return failure(
        mapExecutorCompatibilityPreWriteError(
          error,
          "Executor Compatibility Matrix 路径校验失败。",
        ),
      );
    }

    let lock: ExclusiveFileLockHandle;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: "executorCompatibility",
        taskId: matrixDigest,
      });
    } catch (error) {
      return failure(
        mapExecutorCompatibilityPreWriteError(
          error,
          "无法获取 Executor Compatibility Matrix 文件锁。",
        ),
      );
    }

    let contentCommitted = false;
    try {
      await assertExecutorCompatibilityMatrixStorePathsSafe(this.storeRoot, [
        paths.recordFile,
        paths.lockFile,
      ]);
      const existing = await readExecutorCompatibilityMatrixFile(paths.recordFile);
      if (existing !== undefined) {
        assertPersistedExecutorCompatibilityMatrixRecordIntegrity(
          existing,
          matrixDigest,
          this.dependencies.digest,
        );
        await releaseExecutorCompatibilityLockBeforeWrite(lock);
        return success({
          disposition: ExecutorCompatibilityWriteDisposition.IdempotentReuse,
          matrixDigest,
        });
      }

      await writeExecutorCompatibilityMatrixFile(paths.recordFile, validated);
      contentCommitted = true;
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.recordFile);
      await releaseExecutorCompatibilityLockAfterWrite(lock);
      return success({
        disposition: ExecutorCompatibilityWriteDisposition.Persisted,
        matrixDigest,
      });
    } catch (error) {
      const releaseError = await releaseExecutorCompatibilityLockBestEffort(lock);
      return failure(
        contentCommitted || isExecutorCompatibilityCommitOutcomeUnknown(error)
          ? createExecutorCompatibilityCommitOutcomeUnknown(
              combineExecutorCompatibilityErrors(error, releaseError),
            )
          : mapExecutorCompatibilityPreWriteError(
              error,
              "Executor Compatibility Matrix Store 操作失败。",
            ),
      );
    }
  }

  /** 按 Matrix 摘要加载完整记录并重新校验 Policy 与 Matrix 摘要。 */
  public async load(
    matrixDigest: ContentDigest,
  ): Promise<Result<ExecutorCompatibilityMatrixRecord, HarnessErrorType>> {
    let parsedDigest: ContentDigest;
    try {
      parsedDigest = parseExecutorCompatibilityMatrixDigest(matrixDigest);
    } catch (error) {
      return failure(
        mapExecutorCompatibilityPreWriteError(error, "Executor Compatibility Matrix 摘要无效。"),
      );
    }
    const paths = resolveExecutorCompatibilityMatrixStorePaths(this.storeRoot, parsedDigest);
    try {
      await assertExecutorCompatibilityMatrixStorePathsSafe(
        this.storeRoot,
        [paths.recordFile],
        true,
      );
      const record = await readExecutorCompatibilityMatrixFile(paths.recordFile);
      if (record === undefined) {
        return failure(
          new HarnessError(
            HarnessErrorCode.ExecutorCompatibilityMatrixNotFound,
            "Executor Compatibility Matrix 不存在。",
            { matrixDigest: parsedDigest },
          ),
        );
      }
      assertPersistedExecutorCompatibilityMatrixRecordIntegrity(
        record,
        parsedDigest,
        this.dependencies.digest,
      );
      return success(record);
    } catch (error) {
      return failure(mapReadError(error));
    }
  }
}

function mapReadError(error: unknown): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(
        HarnessErrorCode.IoFailure,
        "Executor Compatibility Matrix 读取失败。",
        {},
        error,
      );
}
