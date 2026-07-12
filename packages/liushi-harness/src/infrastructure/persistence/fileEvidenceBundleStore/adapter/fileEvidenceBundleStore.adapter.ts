import {
  EvidenceBundleWriteDisposition,
  type EvidenceBundleLocator,
  type EvidenceBundleStore,
  type EvidenceBundleWriteResult,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import { validateEvidenceBundle, type EvidenceBundle } from "#domain/verification/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";
import { pathExists } from "#infrastructure/persistence/fileEventStore/taskStore/index.js";

import type { FileEvidenceBundleStoreDependencies } from "../contracts/index.js";
import { readEvidenceBundleFile, writeEvidenceBundleFile } from "../io/index.js";
import { resolveEvidenceBundleStorePaths } from "../path/index.js";

/** 以 CodingTask/VerificationRun 隔离文件实现不可变 EvidenceBundle Store。 */
export class FileEvidenceBundleStore implements EvidenceBundleStore {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileEvidenceBundleStoreDependencies,
  ) {}

  /** 首次原子写入 Bundle；相同内容幂等复用，不同内容固定冲突。 */
  public async persist(
    locator: EvidenceBundleLocator,
    input: EvidenceBundle,
  ): Promise<Result<EvidenceBundleWriteResult, HarnessErrorType>> {
    const valid = validateInput(locator, input);
    if (valid.status === ResultStatus.Failure) return valid;
    const paths = resolveEvidenceBundleStorePaths(this.storeRoot, locator);
    if (!(await pathExists(paths.codingTaskEventsFile))) {
      return failure(
        new HarnessError(
          HarnessErrorCode.CodingTaskNotFound,
          "EvidenceBundle 所属 CodingTask 不存在。",
        ),
      );
    }
    const bundleDigest = this.dependencies.digest.calculate(valid.value);
    if (bundleDigest.status === ResultStatus.Failure) return bundleDigest;

    let lock: ExclusiveFileLockHandle;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: locator.workspaceId,
        taskId: locator.codingTaskId,
      });
    } catch (error) {
      return failure(mapAcquireError(error));
    }

    let wrote = false;
    try {
      if (await pathExists(paths.recordFile)) {
        const existing = await readEvidenceBundleFile(paths.recordFile);
        assertRecordIdentity(existing, locator);
        const verified = this.dependencies.digest.calculate(existing.bundle);
        if (verified.status === ResultStatus.Failure || verified.value !== existing.bundleDigest) {
          throw new HarnessError(HarnessErrorCode.CorruptStore, "EvidenceBundle 内容摘要无效。");
        }
        if (existing.bundleDigest !== bundleDigest.value) {
          throw new HarnessError(
            HarnessErrorCode.EvidenceBundleConflict,
            "同一 Verification Run 已绑定不同 EvidenceBundle。",
          );
        }
        await releaseKnown(lock);
        return success({
          disposition: EvidenceBundleWriteDisposition.IdempotentReuse,
          bundleDigest: bundleDigest.value,
        });
      }

      wrote = true;
      await writeEvidenceBundleFile(paths.recordFile, {
        schemaVersion: 1,
        workspaceId: locator.workspaceId,
        codingTaskId: locator.codingTaskId,
        verificationRunId: locator.verificationRunId,
        bundleDigest: bundleDigest.value,
        bundle: valid.value,
      });
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.recordFile);
      await releaseAfterWrite(lock);
      return success({
        disposition: EvidenceBundleWriteDisposition.Persisted,
        bundleDigest: bundleDigest.value,
      });
    } catch (error) {
      await releaseBestEffort(lock);
      return failure(wrote ? commitUnknown(error) : mapReadOrConflict(error));
    }
  }

  /** 读取 Bundle，并重新校验文件身份、Schema 和规范内容摘要。 */
  public async load(
    locator: EvidenceBundleLocator,
  ): Promise<Result<EvidenceBundle, HarnessErrorType>> {
    if (!isSafeRunId(locator.verificationRunId)) return failure(invalidLocator());
    const paths = resolveEvidenceBundleStorePaths(this.storeRoot, locator);
    try {
      if (!(await pathExists(paths.recordFile))) {
        return failure(
          new HarnessError(HarnessErrorCode.EvidenceBundleNotFound, "EvidenceBundle 不存在。"),
        );
      }
      const record = await readEvidenceBundleFile(paths.recordFile);
      assertRecordIdentity(record, locator);
      const verified = this.dependencies.digest.calculate(record.bundle);
      if (verified.status === ResultStatus.Failure || verified.value !== record.bundleDigest) {
        return failure(
          new HarnessError(HarnessErrorCode.CorruptStore, "EvidenceBundle 内容摘要无效。"),
        );
      }
      return success(record.bundle);
    } catch (error) {
      return failure(mapReadOrConflict(error));
    }
  }
}

function validateInput(
  locator: EvidenceBundleLocator,
  input: EvidenceBundle,
): Result<EvidenceBundle, HarnessErrorType> {
  if (
    !isSafeRunId(locator.verificationRunId) ||
    input.verificationRunId !== locator.verificationRunId
  ) {
    return failure(invalidLocator());
  }
  return validateEvidenceBundle(input);
}

function isSafeRunId(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/u.test(value);
}

function invalidLocator(): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "EvidenceBundle Locator 无效。", {
    field: "verificationRunId",
  });
}

function assertRecordIdentity(
  record: { workspaceId: string; codingTaskId: string; verificationRunId: string },
  locator: EvidenceBundleLocator,
): void {
  if (
    record.workspaceId !== locator.workspaceId ||
    record.codingTaskId !== locator.codingTaskId ||
    record.verificationRunId !== locator.verificationRunId
  ) {
    throw new HarnessError(HarnessErrorCode.CorruptStore, "EvidenceBundle 文件身份不匹配。");
  }
}

function mapAcquireError(error: unknown): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, "EvidenceBundle Lock 获取失败。", {}, error);
}

function mapReadOrConflict(error: unknown): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, "EvidenceBundle Store 操作失败。", {}, error);
}

function commitUnknown(error: unknown): HarnessError {
  return new HarnessError(
    HarnessErrorCode.EvidenceBundleCommitOutcomeUnknown,
    "EvidenceBundle 提交结果未知，禁止自动重试。",
    {},
    error,
  );
}

async function releaseKnown(lock: ExclusiveFileLockHandle): Promise<void> {
  try {
    await lock.release();
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.LockUnavailable,
      "EvidenceBundle Lock 释放失败。",
      {},
      error,
    );
  }
}

async function releaseAfterWrite(lock: ExclusiveFileLockHandle): Promise<void> {
  try {
    await lock.release();
  } catch (error) {
    throw commitUnknown(error);
  }
}

async function releaseBestEffort(lock: ExclusiveFileLockHandle): Promise<void> {
  try {
    await lock.release();
  } catch {
    // 恢复路径由稳定错误码驱动，不能用第二个释放异常覆盖原始失败。
  }
}
