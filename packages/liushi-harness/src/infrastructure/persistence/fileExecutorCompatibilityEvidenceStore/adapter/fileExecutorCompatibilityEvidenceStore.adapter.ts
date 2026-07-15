import {
  ExecutorCompatibilityWriteDisposition,
  type ExecutorCompatibilityEvidenceProjection,
  type ExecutorCompatibilityEvidenceStore,
  type ExecutorCompatibilityEvidenceWriteResult,
} from "#application/ports/index.js";
import {
  failure,
  success,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";
import type { ExecutorCapabilityEvidence } from "#domain/executorCompatibility/index.js";
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

import type {
  ExecutorCompatibilityContentWriteOutcome,
  FileExecutorCompatibilityEvidenceStoreDependencies,
  ValidatedExecutorCompatibilityEvidenceProjection,
} from "../contracts/index.js";
import {
  readExecutorCompatibilityArtifactFile,
  readExecutorCompatibilityEvidenceFile,
  writeExecutorCompatibilityJsonFile,
} from "../io/index.js";
import {
  assertExecutorCompatibilityEvidenceStorePathsSafe,
  resolveExecutorCompatibilityArtifactStorePaths,
  resolveExecutorCompatibilityEvidenceStorePaths,
} from "../path/index.js";
import { FileExecutorCompatibilityEvidenceReader } from "../reader/index.js";
import {
  assertPersistedExecutorCompatibilityArtifactIntegrity,
  assertPersistedExecutorCompatibilityEvidenceIntegrity,
  validateExecutorCompatibilityEvidenceProjection,
} from "../validation/index.js";

/** 以不可变内容寻址文件持久化 Executor Compatibility Artifact 与 Evidence。 */
export class FileExecutorCompatibilityEvidenceStore implements ExecutorCompatibilityEvidenceStore {
  private readonly reader: FileExecutorCompatibilityEvidenceReader;

  /** 注入 Runtime Store 根目录和既有锁、耐久性及摘要设施。 */
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileExecutorCompatibilityEvidenceStoreDependencies,
  ) {
    this.reader = new FileExecutorCompatibilityEvidenceReader(storeRoot, dependencies.digest);
  }

  /** 先持久化 Artifact，再按摘要稳定顺序逐项持久化 Evidence。 */
  public async persist(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Promise<Result<ExecutorCompatibilityEvidenceWriteResult, HarnessError>> {
    let validated: ValidatedExecutorCompatibilityEvidenceProjection;
    try {
      validated = validateExecutorCompatibilityEvidenceProjection(
        projection,
        this.dependencies.digest,
      );
    } catch (error) {
      return failure(
        mapExecutorCompatibilityPreWriteError(
          error,
          "Executor Compatibility Projection 校验失败。",
        ),
      );
    }

    let anyPersisted = false;
    const artifactPaths = resolveExecutorCompatibilityArtifactStorePaths(
      this.storeRoot,
      validated.locator.value,
    );
    const evidencePaths = validated.evidence.map((item) => ({
      evidence: item,
      paths: resolveExecutorCompatibilityEvidenceStorePaths(this.storeRoot, item.evidenceDigest),
    }));
    try {
      await assertExecutorCompatibilityEvidenceStorePathsSafe(this.storeRoot, [
        artifactPaths.recordFile,
        artifactPaths.lockFile,
        ...evidencePaths.flatMap(({ paths }) => [paths.recordFile, paths.lockFile]),
      ]);

      const artifactWrite = await this.persistArtifact(validated, artifactPaths);
      anyPersisted ||= artifactWrite.persisted;

      for (const item of evidencePaths) {
        const evidenceWrite = await this.persistEvidence(item.evidence, item.paths);
        anyPersisted ||= evidenceWrite.persisted;
      }
      return success({
        disposition: anyPersisted
          ? ExecutorCompatibilityWriteDisposition.Persisted
          : ExecutorCompatibilityWriteDisposition.IdempotentReuse,
        artifactDigest: validated.artifactDigest,
        evidenceDigests: validated.evidence.map((item) => item.evidenceDigest),
      });
    } catch (error) {
      return failure(
        isExecutorCompatibilityCommitOutcomeUnknown(error)
          ? createExecutorCompatibilityCommitOutcomeUnknown(error)
          : mapExecutorCompatibilityPreWriteError(
              error,
              "Executor Compatibility Evidence Store 操作失败。",
            ),
      );
    }
  }

  /** 按摘要加载并校验 Evidence。 */
  public load(
    evidenceDigest: ContentDigest,
  ): ReturnType<ExecutorCompatibilityEvidenceStore["load"]> {
    return this.reader.load(evidenceDigest);
  }

  /** 恢复并校验按完整来源身份分组的 Projection 集合。 */
  public loadProjections(
    evidenceDigests: readonly ContentDigest[],
  ): ReturnType<ExecutorCompatibilityEvidenceStore["loadProjections"]> {
    return this.reader.loadProjections(evidenceDigests);
  }

  private async persistArtifact(
    projection: ValidatedExecutorCompatibilityEvidenceProjection,
    paths: { readonly recordFile: string; readonly lockFile: string },
  ): Promise<ExecutorCompatibilityContentWriteOutcome> {
    return this.persistContentAddressedFile(
      paths,
      projection.artifactDigest,
      projection.artifact,
      readExecutorCompatibilityArtifactFile,
      (existing) =>
        assertPersistedExecutorCompatibilityArtifactIntegrity(
          existing,
          projection.artifactDigest,
          this.dependencies.digest,
        ),
    );
  }

  private async persistEvidence(
    evidence: ExecutorCapabilityEvidence,
    paths: { readonly recordFile: string; readonly lockFile: string },
  ): Promise<ExecutorCompatibilityContentWriteOutcome> {
    return this.persistContentAddressedFile(
      paths,
      evidence.evidenceDigest,
      evidence,
      readExecutorCompatibilityEvidenceFile,
      (existing) =>
        assertPersistedExecutorCompatibilityEvidenceIntegrity(
          existing,
          evidence.evidenceDigest,
          this.dependencies.digest,
        ),
    );
  }

  private async persistContentAddressedFile<T>(
    paths: { readonly recordFile: string; readonly lockFile: string },
    digest: ContentDigest,
    value: T,
    read: (filePath: string) => Promise<T | undefined>,
    verifyExisting: (existing: T) => void,
  ): Promise<ExecutorCompatibilityContentWriteOutcome> {
    let lock: ExclusiveFileLockHandle;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: "executorCompatibility",
        taskId: digest,
      });
    } catch (error) {
      throw mapExecutorCompatibilityPreWriteError(
        error,
        "无法获取 Executor Compatibility 文件锁。",
      );
    }

    let contentCommitted = false;
    try {
      await assertExecutorCompatibilityEvidenceStorePathsSafe(this.storeRoot, [
        paths.recordFile,
        paths.lockFile,
      ]);
      const existing = await read(paths.recordFile);
      if (existing !== undefined) {
        verifyExisting(existing);
        await releaseExecutorCompatibilityLockBeforeWrite(lock);
        return { persisted: false };
      }

      await writeExecutorCompatibilityJsonFile(paths.recordFile, value);
      contentCommitted = true;
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.recordFile);
      await releaseExecutorCompatibilityLockAfterWrite(lock);
      return { persisted: true };
    } catch (error) {
      const releaseError = await releaseExecutorCompatibilityLockBestEffort(lock);
      if (contentCommitted || isExecutorCompatibilityCommitOutcomeUnknown(error)) {
        throw createExecutorCompatibilityCommitOutcomeUnknown(
          combineExecutorCompatibilityErrors(error, releaseError),
        );
      }
      throw mapExecutorCompatibilityPreWriteError(
        error,
        "Executor Compatibility 内容寻址文件校验失败。",
      );
    }
  }
}
