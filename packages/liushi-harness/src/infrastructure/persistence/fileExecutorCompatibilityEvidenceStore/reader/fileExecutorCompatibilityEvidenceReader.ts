import type { ExecutorCompatibilityEvidenceStore } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorCompatibilityDigestPort,
} from "#domain/executorCompatibility/index.js";
import { mapExecutorCompatibilityPreWriteError } from "#infrastructure/persistence/executorCompatibilityStoreSupport/index.js";

import {
  readExecutorCompatibilityArtifactFile,
  readExecutorCompatibilityEvidenceFile,
} from "../io/index.js";
import {
  assertExecutorCompatibilityEvidenceStorePathsSafe,
  parseExecutorCompatibilityContentDigest,
  resolveExecutorCompatibilityArtifactStorePaths,
  resolveExecutorCompatibilityEvidenceStorePaths,
} from "../path/index.js";
import {
  assertPersistedExecutorCompatibilityArtifactIntegrity,
  assertPersistedExecutorCompatibilityEvidenceIntegrity,
} from "../validation/index.js";

/** 单条 Evidence 与其已经过摘要校验的来源 Artifact。 */
interface LoadedExecutorCompatibilityEvidenceRecord {
  /** 规范 Evidence。 */
  readonly evidence: ExecutorCapabilityEvidence;
  /** Evidence 精确引用的脱敏 Artifact。 */
  readonly artifact: Record<string, unknown>;
}

/** 负责从内容寻址 Runtime Store 恢复并校验 Evidence Projection。 */
export class FileExecutorCompatibilityEvidenceReader {
  /** 注入 Runtime Store 根目录与摘要实现。 */
  public constructor(
    private readonly storeRoot: string,
    private readonly digest: ExecutorCompatibilityDigestPort,
  ) {}

  /** 按摘要加载 Evidence，并继续验证其 Runtime Store source Artifact。 */
  public async load(
    evidenceDigest: ContentDigest,
  ): ReturnType<ExecutorCompatibilityEvidenceStore["load"]> {
    const loaded = await this.loadEvidenceRecord(evidenceDigest);
    return loaded.status === ResultStatus.Failure ? loaded : success(loaded.value.evidence);
  }

  /** 恢复同一 Artifact 派生的完整 Projection。 */
  public async loadProjection(
    evidenceDigests: readonly ContentDigest[],
  ): ReturnType<ExecutorCompatibilityEvidenceStore["loadProjection"]> {
    if (evidenceDigests.length === 0) {
      return failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Executor Compatibility Matrix 未引用任何 Evidence。",
        ),
      );
    }

    const records: LoadedExecutorCompatibilityEvidenceRecord[] = [];
    for (const evidenceDigest of evidenceDigests) {
      const loaded = await this.loadEvidenceRecord(evidenceDigest);
      if (loaded.status === ResultStatus.Failure) return loaded;
      records.push(loaded.value);
    }
    const first = records[0];
    if (first === undefined) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Executor Compatibility Projection 为空。"),
      );
    }
    const mismatchedSource = records.some(
      ({ evidence }) =>
        evidence.source.artifactDigest !== first.evidence.source.artifactDigest ||
        evidence.source.locator.kind !== first.evidence.source.locator.kind ||
        evidence.source.locator.value !== first.evidence.source.locator.value,
    );
    if (mismatchedSource) {
      return failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Executor Compatibility Projection 引用了多个来源 Artifact。",
        ),
      );
    }
    return success({
      artifact: first.artifact,
      artifactDigest: first.evidence.source.artifactDigest,
      evidence: records.map(({ evidence }) => evidence),
    });
  }

  private async loadEvidenceRecord(
    evidenceDigest: ContentDigest,
  ): Promise<Result<LoadedExecutorCompatibilityEvidenceRecord, HarnessErrorType>> {
    let parsedDigest: ContentDigest;
    try {
      parsedDigest = parseExecutorCompatibilityContentDigest(evidenceDigest);
    } catch (error) {
      return failure(
        mapExecutorCompatibilityPreWriteError(error, "Executor Compatibility Evidence 摘要无效。"),
      );
    }
    const paths = resolveExecutorCompatibilityEvidenceStorePaths(this.storeRoot, parsedDigest);
    try {
      await assertExecutorCompatibilityEvidenceStorePathsSafe(
        this.storeRoot,
        [paths.recordFile],
        true,
      );
      const evidence = await readExecutorCompatibilityEvidenceFile(paths.recordFile);
      if (evidence === undefined) {
        return failure(
          new HarnessError(
            HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound,
            "Executor Compatibility Evidence 不存在。",
            { evidenceDigest: parsedDigest },
          ),
        );
      }
      assertPersistedExecutorCompatibilityEvidenceIntegrity(evidence, parsedDigest, this.digest);
      const artifactPaths = resolveExecutorCompatibilityArtifactStorePaths(
        this.storeRoot,
        evidence.source.locator.value,
      );
      await assertExecutorCompatibilityEvidenceStorePathsSafe(
        this.storeRoot,
        [artifactPaths.recordFile],
        true,
      );
      const artifact = await readExecutorCompatibilityArtifactFile(artifactPaths.recordFile);
      if (artifact === undefined) {
        return failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Executor Compatibility Evidence 缺少 source Artifact。",
            { artifactDigest: evidence.source.artifactDigest },
          ),
        );
      }
      assertPersistedExecutorCompatibilityArtifactIntegrity(
        artifact,
        evidence.source.artifactDigest,
        this.digest,
      );
      return success({ evidence, artifact });
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
        "Executor Compatibility Evidence 读取失败。",
        {},
        error,
      );
}
