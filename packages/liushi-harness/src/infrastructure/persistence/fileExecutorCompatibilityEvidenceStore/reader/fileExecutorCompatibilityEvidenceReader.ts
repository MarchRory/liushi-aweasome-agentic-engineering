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
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

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
  /** 用于同来源 Artifact 完整内容比对的规范 JSON。 */
  readonly canonicalArtifact: string;
}

/** 同一完整来源身份下待组装的 Projection。 */
interface LoadedExecutorCompatibilityProjectionGroup {
  /** 已通过摘要校验的脱敏 Artifact。 */
  readonly artifact: Record<string, unknown>;
  /** Artifact 的规范 JSON，用于拒绝同来源内容漂移。 */
  readonly canonicalArtifact: string;
  /** Artifact 的内容摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 属于当前来源的规范 Evidence。 */
  readonly evidence: ExecutorCapabilityEvidence[];
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

  /** 按完整来源身份恢复确定排序的 Projection 集合。 */
  public async loadProjections(
    evidenceDigests: readonly ContentDigest[],
  ): ReturnType<ExecutorCompatibilityEvidenceStore["loadProjections"]> {
    if (evidenceDigests.length === 0) {
      return failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Executor Compatibility Matrix 未引用任何 Evidence。",
        ),
      );
    }
    if (new Set(evidenceDigests).size !== evidenceDigests.length) {
      return corruptProjections("Executor Compatibility Matrix 包含重复 Evidence 摘要。");
    }

    const records: LoadedExecutorCompatibilityEvidenceRecord[] = [];
    for (const evidenceDigest of [...evidenceDigests].sort((left, right) =>
      left.localeCompare(right),
    )) {
      const loaded = await this.loadEvidenceRecord(evidenceDigest);
      if (loaded.status === ResultStatus.Failure) return loaded;
      records.push(loaded.value);
    }

    const sourceIdentityByArtifactDigest = new Map<ContentDigest, string>();
    const groups = new Map<string, LoadedExecutorCompatibilityProjectionGroup>();
    for (const record of records) {
      const sourceIdentity = createSourceIdentity(record.evidence);
      const knownSourceIdentity = sourceIdentityByArtifactDigest.get(
        record.evidence.source.artifactDigest,
      );
      if (knownSourceIdentity !== undefined && knownSourceIdentity !== sourceIdentity) {
        return corruptProjections(
          "同一 Executor Compatibility Artifact 摘要绑定了不一致的来源身份。",
        );
      }
      sourceIdentityByArtifactDigest.set(record.evidence.source.artifactDigest, sourceIdentity);

      const group = groups.get(sourceIdentity);
      if (group === undefined) {
        groups.set(sourceIdentity, {
          artifact: record.artifact,
          canonicalArtifact: record.canonicalArtifact,
          artifactDigest: record.evidence.source.artifactDigest,
          evidence: [record.evidence],
        });
        continue;
      }
      if (group.canonicalArtifact !== record.canonicalArtifact) {
        return corruptProjections("同一 Executor Compatibility 来源包含不一致的 Artifact。");
      }
      group.evidence.push(record.evidence);
    }

    return success(
      [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, group]) => ({
          artifact: group.artifact,
          artifactDigest: group.artifactDigest,
          evidence: [...group.evidence].sort((left, right) =>
            left.evidenceDigest.localeCompare(right.evidenceDigest),
          ),
        })),
    );
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
      return success({ evidence, artifact, canonicalArtifact: canonicalizeArtifact(artifact) });
    } catch (error) {
      return failure(mapReadError(error));
    }
  }
}

/** 来源身份不包含每条 Evidence 自身的检查项和观察时间。 */
function createSourceIdentity(evidence: ExecutorCapabilityEvidence): string {
  return canonicalizeJson({
    artifactDigest: evidence.source.artifactDigest,
    locator: evidence.source.locator,
    schemaVersion: evidence.source.schemaVersion,
  });
}

function canonicalizeArtifact(artifact: Record<string, unknown>): string {
  try {
    return canonicalizeJson(artifact);
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Executor Compatibility Artifact 无法规范化。",
      {},
      error,
    );
  }
}

function corruptProjections(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message));
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
